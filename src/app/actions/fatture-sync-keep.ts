"use server";

import { z } from "zod";
import {
  startFattureEmesseSyncAction,
  startFattureRicevuteSyncAction,
} from "@/app/actions/fatture-sync";
import {
  rinumeraFattureEmesseClienteInternal,
  rinumeraFattureRicevuteFornitoreInternal,
  rinumeraTutteFattureEmesseAction,
  rinumeraTutteFattureRicevuteAction,
} from "@/app/actions/fatture";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  resolveFiscaleDocScope,
  isFiscaleDocAllowed,
} from "@/lib/auth/data-scope-enforce";
import {
  buildMonthOptions,
  defaultStopMonth,
  fattureSyncKeepKindSchema,
  fattureSyncModalitaSchema,
  fattureSyncStopMonthSchema,
  ficDocGiaInGestionale,
  findRegisteredHintForFicDoc,
  filterFromStopMonth,
  normalizeIsoDate,
  splitForwardRetro,
  todayIsoRome,
  type FattureSyncAnagraficaCreata,
  type FattureSyncFatturaRegistrata,
  type FattureSyncKeepKind,
  type FattureSyncMonthOption,
  type FattureSyncEccezione,
  type FattureSyncPendingMeta,
  type FattureSyncSkipped,
} from "@/lib/amministrazione/fatture-sync-keep";
import {
  buildFatturaSyncQueueItem,
  ECCEZIONE_SYNC_PREZZO_NEGATIVO,
  isErroreVincoloRigaFattura,
  type FatturaSyncQueueItem,
} from "@/lib/amministrazione/fatture-sync";
import {
  ensureAnagraficaDaFic,
  registraFatturaVeloce,
  toAnagraficaCreata,
} from "@/lib/amministrazione/fatture-sync-veloce";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import {
  enrichReceivedDocument,
  fetchIssuedCreditNotes,
  fetchIssuedInvoices,
  fetchReceivedDocumentById,
  fetchReceivedInvoices,
  getFicConfig,
} from "@/lib/fic";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type FattureSyncPreview = {
  lastRegisteredDate: string | null;
  today: string;
  pending: FattureSyncPendingMeta[];
  months: FattureSyncMonthOption[];
  defaultStopMonth: string | null;
  forwardCount: number;
  retroCount: number;
  skippedAlreadyRegistered: number;
};

export type FattureSyncKeepState = {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunFatture: number;
  lastError: string | null;
};

export type FattureSyncVeloceResult = {
  success: true;
  registered: number;
  skipped: FattureSyncSkipped[];
  anagraficheCreate: FattureSyncAnagraficaCreata[];
  fattureRegistrate: FattureSyncFatturaRegistrata[];
  errors: string[];
  eccezione: FattureSyncEccezione | null;
  remainingFicIds: number[];
};

function emptyVeloceResult(): FattureSyncVeloceResult {
  return {
    success: true,
    registered: 0,
    skipped: [],
    anagraficheCreate: [],
    fattureRegistrate: [],
    errors: [],
    eccezione: null,
    remainingFicIds: [],
  };
}

const previewCacheSchema = z.object({
  kind: fattureSyncKeepKindSchema,
  stopMonth: fattureSyncStopMonthSchema.optional(),
});

type RegisteredDocHint = {
  id: string;
  ficId: number | null;
  numeroEsterno: string;
  numeroInterno: string;
  dataEmissione: string;
  totale: number;
};

function mapRegisteredHints(
  rows: Array<Record<string, unknown>> | null
): RegisteredDocHint[] {
  return (rows ?? []).map((r) => {
    const ficRaw = Number(r.fic_id);
    return {
      id: String(r.id ?? ""),
      ficId: Number.isFinite(ficRaw) && ficRaw > 0 ? ficRaw : null,
      numeroEsterno: String(r.numero_documento_esterno ?? ""),
      numeroInterno: String(r.numero_interno ?? ""),
      dataEmissione: normalizeIsoDate(String(r.data_emissione ?? "")),
      totale: Number(r.totale) || 0,
    };
  });
}

function lastRegisteredIso(hints: RegisteredDocHint[]): string | null {
  const dates = hints.map((h) => h.dataEmissione).filter(Boolean);
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
}

function docInScope(
  scope: Awaited<ReturnType<typeof resolveFiscaleDocScope>>,
  aziendaId: string | null,
  date: string | null | undefined
): boolean {
  return isFiscaleDocAllowed(scope, { aziendaId, date: date ?? null });
}

async function listPendingMeta(
  kind: FattureSyncKeepKind,
  opts?: { supabase?: unknown; skipScope?: boolean }
): Promise<
  | { success: true; preview: FattureSyncPreview }
  | { success: false; error: string }
> {
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Configurazione Fatture in Cloud mancante.",
    };
  }

  const supabase = (opts?.supabase ??
    (await createClient())) as Awaited<ReturnType<typeof createClient>>;
  const skipScope = Boolean(opts?.skipScope);
  const today = todayIsoRome();

  if (kind === "emessa") {
    const [invoices, creditNotes, registeredRes] = await Promise.all([
      fetchIssuedInvoices(null),
      fetchIssuedCreditNotes(null),
      supabase
        .from("fatture_emesse")
        .select("id, fic_id, data_emissione, numero_documento_esterno, numero_interno, totale")
        .is("deleted_at", null),
    ]);
    if (registeredRes.error) {
      return { success: false, error: registeredRes.error.message };
    }
    const registeredHints = mapRegisteredHints(
      (registeredRes.data ?? []) as Array<Record<string, unknown>>
    );
    const lastRegisteredDate = lastRegisteredIso(registeredHints);

    const emesseScope = skipScope
      ? { skip: true as const, dateFloor: null, ownedIds: null }
      : await resolveFiscaleDocScope(supabase, "fiscale.fatture_emesse");
    const ncScope = skipScope
      ? { skip: true as const, dateFloor: null, ownedIds: null }
      : await resolveFiscaleDocScope(supabase, "fiscale.note_credito_emesse");

    const pending: FattureSyncPendingMeta[] = [];
    for (const d of invoices) {
      if (ficDocGiaInGestionale(d, registeredHints)) continue;
      if (!skipScope && !docInScope(emesseScope, null, d.date)) continue;
      pending.push({
        ficId: d.ficId,
        kind: "emessa",
        date: normalizeIsoDate(d.date) || d.date || "",
        number: d.number,
        entityName: d.entityName,
        entityVat: d.entityVat,
        amountGross: d.amountGross,
      });
    }
    for (const d of creditNotes) {
      if (ficDocGiaInGestionale(d, registeredHints)) continue;
      if (!skipScope && !docInScope(ncScope, null, d.date)) continue;
      pending.push({
        ficId: d.ficId,
        kind: "nota_credito",
        date: normalizeIsoDate(d.date) || d.date || "",
        number: d.number,
        entityName: d.entityName,
        entityVat: d.entityVat,
        amountGross: d.amountGross,
      });
    }

    const { forward, retro } = splitForwardRetro(pending, lastRegisteredDate, today);
    const months = buildMonthOptions(pending, today);
    return {
      success: true,
      preview: {
        lastRegisteredDate,
        today,
        pending,
        months,
        defaultStopMonth: defaultStopMonth(months),
        forwardCount: forward.length,
        retroCount: retro.length,
        skippedAlreadyRegistered: invoices.length + creditNotes.length - pending.length,
      },
    };
  }

  const [docs, registeredRes] = await Promise.all([
    fetchReceivedInvoices(null),
    supabase
      .from("fatture_ricevute")
      .select("id, fic_id, data_emissione, numero_documento_esterno, numero_interno, totale")
      .is("deleted_at", null),
  ]);
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }
  const registeredHints = mapRegisteredHints(
    (registeredRes.data ?? []) as Array<Record<string, unknown>>
  );
  const lastRegisteredDate = lastRegisteredIso(registeredHints);
  const scope = skipScope
    ? { skip: true as const, dateFloor: null, ownedIds: null }
    : await resolveFiscaleDocScope(supabase, "fiscale.fatture_ricevute");
  const pending: FattureSyncPendingMeta[] = [];
  for (const d of docs) {
    if (ficDocGiaInGestionale(d, registeredHints)) continue;
    if (!skipScope && !docInScope(scope, null, d.date)) continue;
    pending.push({
      ficId: d.ficId,
      kind: "ricevuta",
      date: normalizeIsoDate(d.date) || d.date || "",
      number: d.number,
      entityName: d.entityName,
      entityVat: d.entityVat,
      amountGross: d.amountGross,
    });
  }
  const { forward, retro } = splitForwardRetro(pending, lastRegisteredDate, today);
  const months = buildMonthOptions(pending, today);
  return {
    success: true,
    preview: {
      lastRegisteredDate,
      today,
      pending,
      months,
      defaultStopMonth: defaultStopMonth(months),
      forwardCount: forward.length,
      retroCount: retro.length,
      skippedAlreadyRegistered: docs.length - pending.length,
    },
  };
}

export async function previewFattureSyncAction(
  kind: FattureSyncKeepKind
): Promise<
  { success: true; preview: FattureSyncPreview } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = fattureSyncKeepKindSchema.safeParse(kind);
  if (!parsed.success) return { success: false, error: "Tipo fatture non valido." };
  return listPendingMeta(parsed.data);
}

export async function countFattureSyncPeriodoAction(input: {
  kind: FattureSyncKeepKind;
  stopMonth: string;
}): Promise<
  | {
      success: true;
      count: number;
      forwardCount: number;
      retroCount: number;
      lastRegisteredDate: string | null;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = previewCacheSchema.safeParse(input);
  if (!parsed.success || !parsed.data.stopMonth) {
    return { success: false, error: "Mese di arresto non valido." };
  }
  const res = await listPendingMeta(parsed.data.kind);
  if (!res.success) return res;
  const today = res.preview.today;
  const inPeriod = filterFromStopMonth(
    res.preview.pending,
    parsed.data.stopMonth,
    today
  );
  const { forward, retro } = splitForwardRetro(
    inPeriod,
    res.preview.lastRegisteredDate,
    today
  );
  return {
    success: true,
    count: inPeriod.length,
    forwardCount: forward.length,
    retroCount: retro.length,
    lastRegisteredDate: res.preview.lastRegisteredDate,
  };
}

export async function getFattureKeepSyncAction(
  kind: FattureSyncKeepKind
): Promise<
  { success: true; state: FattureSyncKeepState } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = fattureSyncKeepKindSchema.safeParse(kind);
  if (!parsed.success) return { success: false, error: "Tipo non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_sync_keep")
    .select("enabled, last_run_at, last_run_fatture, last_error")
    .eq("kind", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    state: {
      enabled: Boolean(data?.enabled),
      lastRunAt: data?.last_run_at ? String(data.last_run_at) : null,
      lastRunFatture: Number(data?.last_run_fatture) || 0,
      lastError: data?.last_error ? String(data.last_error) : null,
    },
  };
}

export async function setFattureKeepSyncAction(input: {
  kind: FattureSyncKeepKind;
  enabled: boolean;
}): Promise<
  { success: true; state: FattureSyncKeepState } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const kindParsed = fattureSyncKeepKindSchema.safeParse(input.kind);
  if (!kindParsed.success) return { success: false, error: "Tipo non valido." };
  const enabled = Boolean(input.enabled);
  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("fatture_sync_keep")
    .select("id")
    .eq("kind", kindParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };

  if (existing?.id) {
    const { error } = await supabase
      .from("fatture_sync_keep")
      .update({
        enabled,
        updated_by: auth.userId,
        last_error: null,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from("fatture_sync_keep").insert({
      kind: kindParsed.data,
      enabled,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "fatture_sync_keep",
    entity_id: kindParsed.data,
    action: enabled ? "keep_on" : "keep_off",
    actor_id: auth.userId,
    summary: `${enabled ? "Attivato" : "Disattivato"} Mantieni sincronizzato ${kindParsed.data}`,
    payload: { kind: kindParsed.data, enabled },
  });

  return getFattureKeepSyncAction(kindParsed.data);
}

async function loadQueueItems(
  kind: FattureSyncKeepKind
): Promise<
  | { success: true; items: FatturaSyncQueueItem[] }
  | { success: false; error: string }
> {
  const res =
    kind === "ricevuta"
      ? await startFattureRicevuteSyncAction()
      : await startFattureEmesseSyncAction();
  if (!res.success) return res;
  return { success: true, items: res.items };
}

async function hydrateIfNeeded(
  item: FatturaSyncQueueItem
): Promise<FatturaSyncQueueItem> {
  if (!item.needsHydration && item.righe.length > 0) return item;
  if (item.kind !== "ricevuta") return { ...item, needsHydration: false };
  const stub = {
    ficId: item.ficId,
    type: "received" as const,
    number: item.numeroEsterno,
    date: item.dataEmissione,
    dueDate: null,
    entityName: item.entityName,
    entityVat: item.entityVat,
    amountGross: item.amountGross,
    status: "paid" as const,
    raw: {},
  };
  try {
    const enriched = await enrichReceivedDocument(stub);
    return buildFatturaSyncQueueItem({
      doc: enriched,
      kind: "ricevuta",
      existingId: item.existingId,
      existingLabel: item.existingLabel,
      proposedTarga: item.proposedTarga,
      linkedFattura: item.linkedFattura,
      duplicateCandidate: item.duplicateCandidate,
    });
  } catch {
    return { ...item, needsHydration: false };
  }
}

async function buildItemsFromFicIds(
  kind: FattureSyncKeepKind,
  ficIds: number[]
): Promise<FatturaSyncQueueItem[]> {
  const idSet = new Set(ficIds);
  if (idSet.size === 0) return [];
  if (kind === "emessa") {
    const [invoices, creditNotes] = await Promise.all([
      fetchIssuedInvoices(null),
      fetchIssuedCreditNotes(null),
    ]);
    const items: FatturaSyncQueueItem[] = [];
    for (const d of invoices) {
      if (!idSet.has(d.ficId)) continue;
      items.push(
        buildFatturaSyncQueueItem({
          doc: d,
          kind: "emessa",
          existingId: null,
          existingLabel: null,
          proposedTarga: "",
        })
      );
    }
    for (const d of creditNotes) {
      if (!idSet.has(d.ficId)) continue;
      items.push(
        buildFatturaSyncQueueItem({
          doc: d,
          kind: "nota_credito",
          existingId: null,
          existingLabel: null,
          proposedTarga: "",
        })
      );
    }
    return items;
  }

  const listed = await fetchReceivedInvoices(null);
  const byList = new Map(listed.map((d) => [d.ficId, d]));
  const items: FatturaSyncQueueItem[] = [];
  for (const ficId of idSet) {
    let enriched = byList.get(ficId) ?? null;
    if (!enriched) {
      enriched = await fetchReceivedDocumentById(ficId);
    } else {
      try {
        enriched = await enrichReceivedDocument(enriched);
      } catch (e) {
        console.error(
          "[fatture-sync-keep] enrich ricevuta",
          ficId,
          e instanceof Error ? e.message : e
        );
      }
    }
    if (!enriched) {
      console.error("[fatture-sync-keep] ricevuta FiC non scaricata", ficId);
      continue;
    }
    items.push(
      buildFatturaSyncQueueItem({
        doc: enriched,
        kind: "ricevuta",
        existingId: null,
        existingLabel: null,
        proposedTarga: "",
      })
    );
  }
  return items;
}

async function collegaFicIdEsistente(input: {
  supabase: unknown;
  kind: FattureSyncKeepKind;
  fatturaId: string;
  ficId: number;
  userId: string;
}): Promise<boolean> {
  if (!input.fatturaId) return false;
  const table = input.kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const { error } = await (
    input.supabase as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            is: (c: string, v: null) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from(table)
    .update({
      fic_id: input.ficId,
      updated_by: input.userId,
    })
    .eq("id", input.fatturaId)
    .is("deleted_at", null);
  if (error) {
    console.error("[fatture-sync-keep] collega fic_id", error.message);
    return false;
  }
  return true;
}

async function runVeloceOnItems(input: {
  kind: FattureSyncKeepKind;
  items: FatturaSyncQueueItem[];
  userId: string;
  supabase: unknown;
  /** Wizard: si ferma alla prima eccezione e lascia il resto in remainingFicIds. */
  stopOnEccezione?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<FattureSyncVeloceResult> {
  const created: FattureSyncAnagraficaCreata[] = [];
  const skipped: FattureSyncSkipped[] = [];
  const fattureRegistrate: FattureSyncFatturaRegistrata[] = [];
  const errors: string[] = [];
  const anagCache = new Map<string, Awaited<ReturnType<typeof ensureAnagraficaDaFic>>>();
  let registered = 0;
  const tipo = input.kind === "ricevuta" ? "fornitore" : "cliente";
  const anagIds = new Set<string>();
  const tableHint =
    input.kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const { data: existingRows } = await (
    input.supabase as {
      from: (t: string) => {
        select: (c: string) => {
          is: (c: string, v: null) => Promise<{
            data: Array<Record<string, unknown>> | null;
          }>;
        };
      };
    }
  )
    .from(tableHint)
    .select(
      "id, fic_id, data_emissione, numero_documento_esterno, numero_interno, totale"
    )
    .is("deleted_at", null);
  let hints = mapRegisteredHints(existingRows ?? []);

  async function giaRegistrataFic(ficId: number): Promise<boolean> {
    const table = input.kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
    const { data } = await (
      input.supabase as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: number) => {
              is: (c: string, v: null) => {
                maybeSingle: () => Promise<{ data: { id?: string } | null }>;
              };
            };
          };
        };
      }
    )
      .from(table)
      .select("id")
      .eq("fic_id", ficId)
      .is("deleted_at", null)
      .maybeSingle();
    return Boolean(data?.id);
  }

  for (let i = 0; i < input.items.length; i++) {
    const slim = input.items[i];
    input.onProgress?.(
      `Registro ${i + 1} di ${input.items.length} (${slim.numeroEsterno || slim.ficId})…`
    );
    if (await giaRegistrataFic(slim.ficId)) {
      skipped.push({
        ficId: slim.ficId,
        number: slim.numeroEsterno,
        motivo: "già registrata",
      });
      continue;
    }
    const item = await hydrateIfNeeded(slim);
    const hitEsistente = findRegisteredHintForFicDoc(
      {
        ficId: item.ficId,
        number: item.numeroEsterno,
        date: item.dataEmissione,
        amountGross: item.amountGross,
      },
      hints
    );
    if (hitEsistente) {
      if (!hitEsistente.ficId && hitEsistente.id) {
        const linked = await collegaFicIdEsistente({
          supabase: input.supabase,
          kind: input.kind,
          fatturaId: hitEsistente.id,
          ficId: item.ficId,
          userId: input.userId,
        });
        if (linked) {
          hints = hints.map((h) =>
            h.id === hitEsistente.id ? { ...h, ficId: item.ficId } : h
          );
          registered += 1;
          fattureRegistrate.push({
            numero: item.numeroEsterno || hitEsistente.numeroInterno || "",
            ragioneSociale: item.entityName,
            partitaIva: item.entityVat,
            importo: item.amountGross,
          });
          continue;
        }
      }
      skipped.push({
        ficId: item.ficId,
        number: item.numeroEsterno,
        motivo: "già registrata",
      });
      continue;
    }
    const eccezioneMotivo = item.eccezioneMotivo?.trim() || null;
    if (eccezioneMotivo && input.stopOnEccezione) {
      return finishVeloce({
        created,
        skipped,
        fattureRegistrate,
        errors,
        registered,
        anagIds,
        kind: input.kind,
        userId: input.userId,
        eccezione: {
          ficId: item.ficId,
          number: item.numeroEsterno,
          motivo: eccezioneMotivo,
        },
        remainingFicIds: input.items.slice(i + 1).map((x) => x.ficId),
      });
    }
    const vat = normalizeVatKey(item.entityVat || item.draft?.partitaIva || "");
    const cacheKey = vat || `${item.entityName}|${item.ficId}`;
    let anag = anagCache.get(cacheKey);
    if (!anag) {
      anag = await ensureAnagraficaDaFic({
        supabase: input.supabase,
        userId: input.userId,
        tipo,
        ragioneSociale: item.draft?.ragioneSociale || item.entityName,
        partitaIva: item.draft?.partitaIva || item.entityVat,
        codiceFiscale: item.draft?.codiceFiscale,
        draft: item.draft,
      });
      anagCache.set(cacheKey, anag);
    }
    if ("error" in anag) {
      skipped.push({
        ficId: item.ficId,
        number: item.numeroEsterno,
        motivo: anag.error,
      });
      continue;
    }
    if (anag.created) {
      created.push(toAnagraficaCreata(tipo, anag));
    }
    anagIds.add(anag.id);
    const saved = await registraFatturaVeloce({
      supabase: input.supabase,
      userId: input.userId,
      item,
      anagrafica: anag,
    });
    if (!saved.ok) {
      const dup =
        /duplicate|unique|fic_id/i.test(saved.error) ||
        saved.error.toLowerCase().includes("già");
      if (
        input.stopOnEccezione &&
        !dup &&
        isErroreVincoloRigaFattura(saved.error)
      ) {
        return finishVeloce({
          created,
          skipped,
          fattureRegistrate,
          errors,
          registered,
          anagIds,
          kind: input.kind,
          userId: input.userId,
          eccezione: {
            ficId: item.ficId,
            number: item.numeroEsterno,
            motivo: ECCEZIONE_SYNC_PREZZO_NEGATIVO,
          },
          remainingFicIds: input.items.slice(i + 1).map((x) => x.ficId),
        });
      }
      const hitDopo = findRegisteredHintForFicDoc(
        {
          ficId: item.ficId,
          number: item.numeroEsterno,
          date: item.dataEmissione,
          amountGross: item.amountGross,
        },
        hints
      );
      if (hitDopo?.id && !hitDopo.ficId) {
        const linked = await collegaFicIdEsistente({
          supabase: input.supabase,
          kind: input.kind,
          fatturaId: hitDopo.id,
          ficId: item.ficId,
          userId: input.userId,
        });
        if (linked) {
          hints = hints.map((h) =>
            h.id === hitDopo.id ? { ...h, ficId: item.ficId } : h
          );
          registered += 1;
          fattureRegistrate.push({
            numero: item.numeroEsterno || hitDopo.numeroInterno || "",
            ragioneSociale: anag.ragioneSociale,
            partitaIva: anag.partitaIva,
            importo: item.amountGross,
          });
          continue;
        }
      }
      skipped.push({
        ficId: item.ficId,
        number: item.numeroEsterno,
        motivo: dup ? "già registrata" : saved.error,
      });
      if (!dup) {
        errors.push(`${item.numeroEsterno || item.ficId}: ${saved.error}`);
      }
      continue;
    }
    registered += 1;
    fattureRegistrate.push({
      numero: saved.numero,
      ragioneSociale: anag.ragioneSociale,
      partitaIva: anag.partitaIva,
      importo: saved.importo,
    });
  }

  return finishVeloce({
    created,
    skipped,
    fattureRegistrate,
    errors,
    registered,
    anagIds,
    kind: input.kind,
    userId: input.userId,
    eccezione: null,
    remainingFicIds: [],
  });
}

async function finishVeloce(input: {
  created: FattureSyncAnagraficaCreata[];
  skipped: FattureSyncSkipped[];
  fattureRegistrate: FattureSyncFatturaRegistrata[];
  errors: string[];
  registered: number;
  anagIds: Set<string>;
  kind: FattureSyncKeepKind;
  userId: string;
  eccezione: FattureSyncEccezione | null;
  remainingFicIds: number[];
}): Promise<FattureSyncVeloceResult> {
  const sb = await createClient();
  for (const id of input.anagIds) {
    if (input.kind === "ricevuta") {
      await rinumeraFattureRicevuteFornitoreInternal(sb, input.userId, id);
    } else {
      await rinumeraFattureEmesseClienteInternal(sb, input.userId, id);
    }
  }
  return {
    success: true,
    registered: input.registered,
    skipped: input.skipped,
    anagraficheCreate: input.created,
    fattureRegistrate: input.fattureRegistrate,
    errors: input.errors,
    eccezione: input.eccezione,
    remainingFicIds: input.remainingFicIds,
  };
}

export async function runFattureSyncVeloceAction(input: {
  kind: FattureSyncKeepKind;
  ficIds: number[];
  stopMonth?: string | null;
  fase: "prospettiva" | "retroso" | "mista";
}): Promise<FattureSyncVeloceResult | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const kind = fattureSyncKeepKindSchema.safeParse(input.kind);
  if (!kind.success) return { success: false, error: "Tipo non valido." };
  const ids = [...new Set(input.ficIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) {
    return emptyVeloceResult();
  }

  const wanted = await buildItemsFromFicIds(kind.data, ids);
  const byId = new Map(wanted.map((it) => [it.ficId, it]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((it): it is FatturaSyncQueueItem => Boolean(it));
  if (ordered.length === 0) {
    return {
      success: false,
      error:
        "Documento FiC non scaricato (Gennaio o altri mesi a ritroso). Riprova la sincronizzazione.",
    };
  }
  const supabase = await createClient();
  const result = await runVeloceOnItems({
    kind: kind.data,
    items: ordered,
    userId: auth.userId,
    supabase,
    stopOnEccezione: input.fase === "prospettiva",
  });

  await supabase.from("fatture_sync_run").insert({
    kind: kind.data,
    modalita: "veloce",
    fase: input.fase,
    stop_month: input.stopMonth ?? null,
    fatture_count: result.registered,
    anagrafiche_create: result.anagraficheCreate,
    skipped: result.skipped,
    status: result.errors.length ? "completata" : "completata",
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  await writeAuditLog({
    entity_type: "fatture_sync_run",
    entity_id: kind.data,
    action: "sync_veloce",
    actor_id: auth.userId,
    summary: `Sync veloce ${kind.data}: ${result.registered} fatture`,
    payload: {
      registered: result.registered,
      skipped: result.skipped.length,
      anagrafiche: result.anagraficheCreate.length,
      fatture: result.fattureRegistrate,
      fase: input.fase,
      eccezione: result.eccezione,
    },
  });
  return result;
}

export async function prepareFattureSyncPrecisaAction(input: {
  kind: FattureSyncKeepKind;
  ficIds: number[];
}): Promise<
  | {
      success: true;
      items: FatturaSyncQueueItem[];
      anagraficheCreate: FattureSyncAnagraficaCreata[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const kind = fattureSyncKeepKindSchema.safeParse(input.kind);
  if (!kind.success) return { success: false, error: "Tipo non valido." };
  const ids = [...new Set(input.ficIds.filter((n) => Number.isFinite(n) && n > 0))];
  const queue = await loadQueueItems(kind.data);
  if (!queue.success) return queue;
  const wanted = queue.items.filter((it) => ids.includes(it.ficId));
  const supabase = await createClient();
  const created: FattureSyncAnagraficaCreata[] = [];
  const tipo = kind.data === "ricevuta" ? "fornitore" : "cliente";
  const items: FatturaSyncQueueItem[] = [];

  for (const slim of wanted) {
    const item = await hydrateIfNeeded(slim);
    const anag = await ensureAnagraficaDaFic({
      supabase,
      userId: auth.userId,
      tipo,
      ragioneSociale: item.draft?.ragioneSociale || item.entityName,
      partitaIva: item.draft?.partitaIva || item.entityVat,
      codiceFiscale: item.draft?.codiceFiscale,
      draft: item.draft,
    });
    if ("error" in anag) {
      items.push(item);
      continue;
    }
    if (anag.created) created.push(toAnagraficaCreata(tipo, anag));
    items.push({
      ...item,
      anagraficaMode: "existing",
      existingId: anag.id,
      existingLabel: `${anag.codiceTarga} — ${anag.ragioneSociale}`,
      proposedTarga: anag.codiceTarga,
    });
  }

  return { success: true, items, anagraficheCreate: created };
}

export async function finalizeFattureSyncRunAction(input: {
  kind: FattureSyncKeepKind;
  modalita: "precisa" | "veloce" | "keep";
  fase: "prospettiva" | "retroso" | "mista";
  stopMonth?: string | null;
  fattureCount: number;
  anagraficheCreate: FattureSyncAnagraficaCreata[];
  fattureRegistrate?: FattureSyncFatturaRegistrata[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const kind = fattureSyncKeepKindSchema.safeParse(input.kind);
  const mode = fattureSyncModalitaSchema.safeParse(input.modalita);
  if (!kind.success || !mode.success) {
    return { success: false, error: "Parametri sync non validi." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("fatture_sync_run").insert({
    kind: kind.data,
    modalita: mode.data,
    fase: input.fase,
    stop_month: input.stopMonth ?? null,
    fatture_count: input.fattureCount,
    anagrafiche_create: input.anagraficheCreate,
    skipped: [],
    status: "completata",
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "fatture_sync_run",
    entity_id: kind.data,
    action: "sync_finalize",
    actor_id: auth.userId,
    summary: `Resoconto sync ${kind.data}: ${input.fattureCount} fatture`,
    payload: {
      modalita: mode.data,
      fase: input.fase,
      fattureCount: input.fattureCount,
      anagrafiche: input.anagraficheCreate,
      fatture: input.fattureRegistrate ?? [],
    },
  });
  if (kind.data === "emessa") await rinumeraTutteFattureEmesseAction();
  else await rinumeraTutteFattureRicevuteAction();
  return { success: true };
}

export async function runFattureKeepSyncNowAction(
  kind: FattureSyncKeepKind
): Promise<
  | { success: true; registered: number; anagraficheCreate: FattureSyncAnagraficaCreata[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = fattureSyncKeepKindSchema.safeParse(kind);
  if (!parsed.success) return { success: false, error: "Tipo non valido." };
  return runKeepSyncInternal(parsed.data, auth.userId, await createClient());
}

async function runKeepSyncInternal(
  kind: FattureSyncKeepKind,
  userId: string,
  supabase: unknown
): Promise<
  | { success: true; registered: number; anagraficheCreate: FattureSyncAnagraficaCreata[] }
  | { success: false; error: string }
> {
  const preview = await listPendingMeta(kind, {
    supabase,
    skipScope: true,
  });
  if (!preview.success) {
    await touchKeep(kind, userId, 0, preview.error, supabase);
    return preview;
  }
  const { forward } = splitForwardRetro(
    preview.preview.pending,
    preview.preview.lastRegisteredDate,
    preview.preview.today
  );
  if (forward.length === 0) {
    await touchKeep(kind, userId, 0, null, supabase);
    return { success: true, registered: 0, anagraficheCreate: [] };
  }
  const items = await buildItemsFromFicIds(
    kind,
    forward.map((f) => f.ficId)
  );
  const result = await runVeloceOnItems({
    kind,
    items,
    userId,
    supabase,
  });
  await (supabase as ReturnType<typeof createServiceClient>)
    .from("fatture_sync_run")
    .insert({
      kind,
      modalita: "keep",
      fase: "prospettiva",
      fatture_count: result.registered,
      anagrafiche_create: result.anagraficheCreate,
      skipped: result.skipped,
      status: "completata",
      created_by: userId,
      updated_by: userId,
    });
  await touchKeep(kind, userId, result.registered, null, supabase);
  await writeAuditLog({
    entity_type: "fatture_sync_keep",
    entity_id: kind,
    action: "keep_run",
    actor_id: userId,
    summary: `Keep-sync ${kind}: ${result.registered} fatture fino a oggi`,
    payload: { registered: result.registered },
  });
  return {
    success: true,
    registered: result.registered,
    anagraficheCreate: result.anagraficheCreate,
  };
}

async function touchKeep(
  kind: FattureSyncKeepKind,
  userId: string,
  count: number,
  error: string | null,
  supabase: unknown
) {
  const sb = supabase as ReturnType<typeof createServiceClient>;
  const { data } = await sb
    .from("fatture_sync_keep")
    .select("id")
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle();
  if (data?.id) {
    await sb
      .from("fatture_sync_keep")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_fatture: count,
        last_error: error,
        updated_by: userId,
      })
      .eq("id", data.id);
  }
}

/** Cron service-role: keep-sync per le aree abilitate. */
export async function runFattureKeepSyncCronJob(): Promise<{
  ok: true;
  runs: Array<{ kind: string; registered: number }>;
}> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("fatture_sync_keep")
    .select("kind, enabled, updated_by, created_by")
    .eq("enabled", true)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const runs: Array<{ kind: string; registered: number }> = [];
  for (const row of data ?? []) {
    const kind = row.kind === "ricevuta" ? "ricevuta" : "emessa";
    const userId = String(row.updated_by || row.created_by || "");
    if (!userId) continue;
    const res = await runKeepSyncInternal(kind, userId, sb);
    runs.push({
      kind,
      registered: res.success ? res.registered : 0,
    });
  }
  return { ok: true, runs };
}
