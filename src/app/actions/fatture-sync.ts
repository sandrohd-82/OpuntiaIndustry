"use server";

import {
  amountMatchScore,
  buildFatturaSyncQueueItem,
  creditNotesRelatedToInvoice,
  matchCreditNoteToFattura,
  matchFicDocToRegisteredFattura,
  normalizeCompanyNameKey,
  normalizeVatKey,
  sortPendingInvoicesByNcAmount,
  type FatturaSyncDuplicateCandidate,
  type FatturaSyncQueueItem,
  type RegisteredFatturaHint,
} from "@/lib/amministrazione/fatture-sync";
import { companyNamesMatch } from "@/lib/amministrazione/fic-anagrafiche";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import { getUsedFornitoriCodiciTarga } from "@/app/actions/fornitori";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  enrichReceivedDocument,
  fetchIssuedCreditNotes,
  fetchIssuedInvoices,
  fetchReceivedInvoices,
  getFicConfig,
  type FicDocumentNormalized,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type { ClienteRow, FornitoreRow } from "@/types/database";

function resolveFornitoreForDoc(
  doc: FicDocumentNormalized,
  byVat: Map<string, FornitoreRow>,
  fornitori: FornitoreRow[]
): FornitoreRow | null {
  const vat = normalizeVatKey(doc.entityVat);
  if (vat) {
    const byExact = byVat.get(vat);
    if (byExact) {
      return byExact;
    }
    for (const f of fornitori) {
      const piva = normalizeVatKey(f.partita_iva ?? "");
      const cf = normalizeVatKey(f.codice_fiscale ?? "");
      if (piva === vat || cf === vat) {
        return f;
      }
    }
  }

  const name = (doc.entityName || "").trim();
  if (!name) return null;
  const exactKey = normalizeCompanyNameKey(name);
  if (exactKey) {
    for (const f of fornitori) {
      if (normalizeCompanyNameKey(f.ragione_sociale ?? "") === exactKey) {
        return f;
      }
    }
  }
  for (const f of fornitori) {
    if (companyNamesMatch(name, f.ragione_sociale ?? "")) {
      return f;
    }
  }
  return null;
}

/** Esegue async su pool con concorrenza limitata (ordine risultati preservato). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export type FattureSyncStartResult =
  | {
      success: true;
      items: FatturaSyncQueueItem[];
      skippedAlreadyRegistered: number;
      autoLinkedCount: number;
      creditNotesPending: number;
    }
  | { success: false; error: string };

function resolveClienteForDoc(
  doc: FicDocumentNormalized,
  byVat: Map<string, ClienteRow>,
  usedTarghe: Set<string>
): {
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
} {
  const vat = normalizeVatKey(doc.entityVat);
  const existing = vat ? byVat.get(vat) ?? null : null;
  let proposedTarga = existing?.codice_targa ?? "";
  if (!existing) {
    proposedTarga = nextSequentialCodiceTarga("C", [...usedTarghe]);
    usedTarghe.add(proposedTarga);
  }
  return {
    existingId: existing?.id ?? null,
    existingLabel: existing
      ? `${existing.codice_targa} — ${existing.ragione_sociale}`
      : null,
    proposedTarga,
  };
}

export async function startFattureEmesseSyncAction(): Promise<FattureSyncStartResult> {
  const { auth } = await requireAreaAccess("amministrazione");
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

  // Rinumerazione spostata a fine/pausa sync (UI board): non bloccare l'apertura coda.

  const supabase = await createClient();
  const [invoices, creditNotes, clientiRes, registeredRes] =
    await Promise.all([
      fetchIssuedInvoices(null),
      fetchIssuedCreditNotes(null),
      supabase.from("clienti").select("*").is("deleted_at", null),
      supabase
        .from("fatture_emesse")
        .select(
          "id, fic_id, numero_interno, numero_documento_esterno, numero_fattura, cliente_id, cliente_codice_targa, data_emissione, totale, tipo_documento, origine"
        )
        .is("deleted_at", null),
    ]);

  if (clientiRes.error) {
    return { success: false, error: clientiRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }

  const registeredRows = registeredRes.data ?? [];
  const registeredFicIds = new Set(
    registeredRows
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  const clienti = (clientiRes.data ?? []) as ClienteRow[];
  const byVat = new Map<string, ClienteRow>();
  for (const c of clienti) {
    const key = normalizeVatKey(c.partita_iva);
    if (key) byVat.set(key, c);
  }
  const clienteById = new Map(clienti.map((c) => [c.id, c]));

  const registeredHints: RegisteredFatturaHint[] = registeredRows.map((r) => {
    const cliente = clienteById.get(String(r.cliente_id));
    return {
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      numeroEsterno: String(r.numero_documento_esterno ?? ""),
      numeroFattura: String(r.numero_fattura ?? ""),
      clienteId: String(r.cliente_id),
      entityVat: cliente?.partita_iva ?? "",
      dataEmissione: String(r.data_emissione ?? ""),
      totale: Number(r.totale) || 0,
      tipoDocumento:
        (r.tipo_documento ?? "fattura") === "nota_credito"
          ? "nota_credito"
          : "fattura",
      ficId: r.fic_id != null ? Number(r.fic_id) : null,
    };
  });

  const registeredFattureOnly = registeredHints.filter(
    (r) => r.tipoDocumento !== "nota_credito"
  );

  let pendingInvoices = invoices.filter((d) => !registeredFicIds.has(d.ficId));
  let pendingCredits = creditNotes.filter(
    (d) => !registeredFicIds.has(d.ficId)
  );

  /** Auto-link match forti (manuale senza fic_id ↔ FiC). */
  let autoLinkedCount = 0;
  const stillPendingInv: FicDocumentNormalized[] = [];
  const stillPendingNc: FicDocumentNormalized[] = [];
  const weakDupByFicId = new Map<number, FatturaSyncDuplicateCandidate>();

  async function tryAutoLink(
    doc: FicDocumentNormalized,
    kind: "emessa" | "nota_credito"
  ): Promise<"linked" | "weak" | "none"> {
    const match = matchFicDocToRegisteredFattura(doc, kind, registeredHints);
    if (!match) return "none";
    if (match.strength === "strong") {
      const { error } = await supabase
        .from("fatture_emesse")
        .update({
          fic_id: doc.ficId,
          updated_by: auth.userId,
          numero_documento_esterno:
            match.fattura.numeroEsterno?.trim() ||
            doc.number ||
            match.fattura.numeroEsterno,
        })
        .eq("id", match.fattura.id)
        .is("deleted_at", null)
        .is("fic_id", null);
      if (error) {
        console.error("[fatture-sync] auto-link failed", error.message);
        return "none";
      }
      registeredFicIds.add(doc.ficId);
      const hint = registeredHints.find((h) => h.id === match.fattura.id);
      if (hint) hint.ficId = doc.ficId;
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: match.fattura.id,
        action: "sync_auto_link_fic",
        actor_id: auth.userId,
        summary: `Collegato FiC #${doc.ficId} a ${match.fattura.numeroInterno}`,
        payload: {
          ficId: doc.ficId,
          motivo: match.motivo,
          numeroEsterno: doc.number,
        },
      });
      return "linked";
    }
    weakDupByFicId.set(doc.ficId, {
      strength: "weak",
      fatturaId: match.fattura.id,
      numeroInterno: match.fattura.numeroInterno,
      numeroEsterno: match.fattura.numeroEsterno,
      dataEmissione: match.fattura.dataEmissione,
      totale: match.fattura.totale,
      motivo: match.motivo,
    });
    return "weak";
  }

  const invLinkResults = await mapPool(pendingInvoices, 8, async (inv) => {
    const r = await tryAutoLink(inv, "emessa");
    return { inv, r };
  });
  for (const { inv, r } of invLinkResults) {
    if (r === "linked") autoLinkedCount += 1;
    else stillPendingInv.push(inv);
  }
  const ncLinkResults = await mapPool(pendingCredits, 8, async (nc) => {
    const r = await tryAutoLink(nc, "nota_credito");
    return { nc, r };
  });
  for (const { nc, r } of ncLinkResults) {
    if (r === "linked") autoLinkedCount += 1;
    else stillPendingNc.push(nc);
  }
  pendingInvoices = stillPendingInv;
  pendingCredits = stillPendingNc;

  const skippedAlreadyRegistered =
    invoices.length +
    creditNotes.length -
    pendingInvoices.length -
    pendingCredits.length;

  const usedTarghe = new Set(
    clienti.map((c) => c.codice_targa.trim().toUpperCase()).filter(Boolean)
  );

  const usedNcFicIds = new Set<number>();
  const items: FatturaSyncQueueItem[] = [];

  // 1) Note di credito collegate a fatture GIÀ registrate → prima di tutto
  const linkedToRegistered = pendingCredits
    .map((doc) => ({
      doc,
      linked: matchCreditNoteToFattura(doc, registeredFattureOnly),
    }))
    .filter((x) => x.linked?.fatturaId);

  // Cronologico inverso: dalla data più vicina a oggi verso le più lontane
  linkedToRegistered.sort((a, b) =>
    (b.doc.date || "").localeCompare(a.doc.date || "")
  );

  for (const { doc, linked } of linkedToRegistered) {
    usedNcFicIds.add(doc.ficId);
    const anag = resolveClienteForDoc(doc, byVat, usedTarghe);
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "nota_credito",
        ...anag,
        linkedFattura: linked,
        duplicateCandidate: weakDupByFicId.get(doc.ficId) ?? null,
      })
    );
  }

  // 2) Per ogni fattura pendente (più recente prima): NC correlate, poi fattura
  const invoicesSorted = [...pendingInvoices].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  for (const inv of invoicesSorted) {
    const related = creditNotesRelatedToInvoice(inv, pendingCredits)
      .filter((nc) => !usedNcFicIds.has(nc.ficId))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    for (const nc of related) {
      usedNcFicIds.add(nc.ficId);
      const anag = resolveClienteForDoc(nc, byVat, usedTarghe);
      const linked = matchCreditNoteToFattura(nc, [
        ...registeredFattureOnly,
        {
          id: "",
          numeroInterno: "",
          numeroEsterno: inv.number,
          clienteId: anag.existingId ?? "",
          entityVat: inv.entityVat,
          dataEmissione: inv.date || "",
          totale: inv.amountGross,
        },
      ]);
      items.push(
        buildFatturaSyncQueueItem({
          doc: nc,
          kind: "nota_credito",
          ...anag,
          linkedFattura: linked ?? {
            fatturaId: null,
            numeroInterno: "",
            numeroEsterno: inv.number,
            motivo: "Nota di credito correlata alla fattura in registrazione",
          },
          duplicateCandidate: weakDupByFicId.get(nc.ficId) ?? null,
        })
      );
    }

    const anagInv = resolveClienteForDoc(inv, byVat, usedTarghe);
    items.push(
      buildFatturaSyncQueueItem({
        doc: inv,
        kind: "emessa",
        ...anagInv,
        linkedFattura: null,
        duplicateCandidate: weakDupByFicId.get(inv.ficId) ?? null,
      })
    );
  }

  // 3) NC residue (senza match forte) — ancora dalla più recente
  const orphanCredits = pendingCredits
    .filter((d) => !usedNcFicIds.has(d.ficId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  for (const doc of orphanCredits) {
    const anag = resolveClienteForDoc(doc, byVat, usedTarghe);
    const linked = matchCreditNoteToFattura(doc, registeredFattureOnly);
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "nota_credito",
        ...anag,
        linkedFattura: linked,
        duplicateCandidate: weakDupByFicId.get(doc.ficId) ?? null,
      })
    );
  }

  return {
    success: true,
    items,
    skippedAlreadyRegistered,
    autoLinkedCount,
    creditNotesPending: pendingCredits.length,
  };
}

export async function startFattureRicevuteSyncAction(): Promise<FattureSyncStartResult> {
  const { auth } = await requireAreaAccess("amministrazione");
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

  const supabase = await createClient();
  const [docs, fornitoriRes, registeredRes] = await Promise.all([
    fetchReceivedInvoices(null),
    supabase.from("fornitori").select("*").is("deleted_at", null),
    supabase
      .from("fatture_ricevute")
      .select(
        "id, numero_interno, numero_documento_esterno, fornitore_id, data_emissione, totale, fic_id"
      )
      .is("deleted_at", null),
  ]);

  if (fornitoriRes.error) {
    return { success: false, error: fornitoriRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }

  const fornitori = (fornitoriRes.data ?? []) as FornitoreRow[];
  const byVat = new Map<string, FornitoreRow>();
  const fornitoreById = new Map(fornitori.map((f) => [f.id, f]));
  for (const f of fornitori) {
    const key = normalizeVatKey(f.partita_iva);
    if (key) byVat.set(key, f);
    const cf = normalizeVatKey(f.codice_fiscale ?? "");
    if (cf && !byVat.has(cf)) byVat.set(cf, f);
  }

  const registeredHints: RegisteredFatturaHint[] = (
    registeredRes.data ?? []
  ).map((r) => {
    const forn = fornitoreById.get(String(r.fornitore_id));
    return {
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      numeroEsterno: String(r.numero_documento_esterno ?? ""),
      clienteId: String(r.fornitore_id),
      entityVat: forn?.partita_iva ?? "",
      dataEmissione: String(r.data_emissione ?? ""),
      totale: Number(r.totale) || 0,
      tipoDocumento: "fattura" as const,
      ficId: r.fic_id != null ? Number(r.fic_id) : null,
    };
  });

  const registeredFicIds = new Set(
    registeredHints
      .map((r) => Number(r.ficId))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  let pending = docs.filter((d) => !registeredFicIds.has(d.ficId));
  const stillPending: FicDocumentNormalized[] = [];
  const weakDupByFicId = new Map<number, FatturaSyncDuplicateCandidate>();

  type RicevutaLinkPlan =
    | { doc: FicDocumentNormalized; outcome: "none" }
    | {
        doc: FicDocumentNormalized;
        outcome: "strong";
        fatturaId: string;
        numeroInterno: string;
        numeroEsterno: string;
        motivo: string;
      }
    | {
        doc: FicDocumentNormalized;
        outcome: "weak";
        candidate: FatturaSyncDuplicateCandidate;
      };

  const linkPlans: RicevutaLinkPlan[] = pending.map((doc) => {
    const match = matchFicDocToRegisteredFattura(
      doc,
      "ricevuta",
      registeredHints
    );
    if (!match) return { doc, outcome: "none" as const };
    if (match.strength === "strong") {
      return {
        doc,
        outcome: "strong" as const,
        fatturaId: match.fattura.id,
        numeroInterno: match.fattura.numeroInterno,
        numeroEsterno: match.fattura.numeroEsterno,
        motivo: match.motivo,
      };
    }
    return {
      doc,
      outcome: "weak" as const,
      candidate: {
        strength: "weak" as const,
        fatturaId: match.fattura.id,
        numeroInterno: match.fattura.numeroInterno,
        numeroEsterno: match.fattura.numeroEsterno,
        dataEmissione: match.fattura.dataEmissione,
        totale: match.fattura.totale,
        motivo: match.motivo,
      },
    };
  });

  const strongPlans = linkPlans.filter(
    (p): p is Extract<RicevutaLinkPlan, { outcome: "strong" }> =>
      p.outcome === "strong"
  );
  const strongResults = await mapPool(strongPlans, 8, async (plan) => {
    const { error } = await supabase
      .from("fatture_ricevute")
      .update({
        fic_id: plan.doc.ficId,
        updated_by: auth.userId,
        numero_documento_esterno:
          plan.numeroEsterno?.trim() ||
          plan.doc.number ||
          plan.numeroEsterno,
      })
      .eq("id", plan.fatturaId)
      .is("deleted_at", null)
      .is("fic_id", null);
    if (error) {
      console.error("[fatture-sync] auto-link ricevuta failed", error.message);
      return { plan, ok: false as const };
    }
    registeredFicIds.add(plan.doc.ficId);
    await writeAuditLog({
      entity_type: "fatture_ricevute",
      entity_id: plan.fatturaId,
      action: "sync_auto_link_fic",
      actor_id: auth.userId,
      summary: `Collegato FiC #${plan.doc.ficId} a ${plan.numeroInterno}`,
      payload: {
        ficId: plan.doc.ficId,
        motivo: plan.motivo,
        numeroEsterno: plan.doc.number,
      },
    });
    return { plan, ok: true as const };
  });

  for (const r of strongResults) {
    if (!r.ok) stillPending.push(r.plan.doc);
  }
  const autoLinkedCount = strongResults.filter((r) => r.ok).length;

  for (const plan of linkPlans) {
    if (plan.outcome === "strong") continue;
    if (plan.outcome === "weak") {
      weakDupByFicId.set(plan.doc.ficId, plan.candidate);
    }
    stillPending.push(plan.doc);
  }

  pending = stillPending.sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );
  const skippedAlreadyRegistered = docs.length - pending.length;

  const usedTarghe = new Set(await getUsedFornitoriCodiciTarga());

  /**
   * Coda snella: niente enrich di massa (era O(N) chiamate FiC sequenziali ≈ minuti).
   * Dettaglio/XML/righe via hydrateFatturaSyncQueueItemAction al documento corrente.
   */
  const items: FatturaSyncQueueItem[] = [];
  for (const doc of pending) {
    const existing = resolveFornitoreForDoc(doc, byVat, fornitori);
    let proposedTarga = existing?.codice_targa ?? "";
    if (!existing) {
      proposedTarga = nextSequentialCodiceTarga("F", [...usedTarghe]);
      usedTarghe.add(proposedTarga);
    }
    const item = buildFatturaSyncQueueItem({
      doc,
      kind: "ricevuta",
      existingId: existing?.id ?? null,
      existingLabel: existing
        ? `${existing.codice_targa} — ${existing.ragione_sociale}`
        : null,
      proposedTarga,
      linkedFattura: null,
      duplicateCandidate: weakDupByFicId.get(doc.ficId) ?? null,
    });
    items.push({
      ...item,
      needsHydration: true,
      // Evita payload enorme: le righe arriveranno dall'hydrate
      righe: [],
    });
  }

  // Prefetch solo i primi 2 (apertura immediata + documento successivo)
  const prefetch = items.slice(0, 2);
  const hydratedPrefetch = await mapPool(prefetch, 2, async (slim) => {
    const res = await hydrateRicevutaQueueItemInternal({
      slim,
      byVat,
      fornitori,
      usedTarghe,
    });
    return res;
  });
  for (let i = 0; i < hydratedPrefetch.length; i++) {
    const h = hydratedPrefetch[i];
    if (h) items[i] = h;
  }

  return {
    success: true,
    items,
    skippedAlreadyRegistered,
    autoLinkedCount,
    creditNotesPending: 0,
  };
}

async function hydrateRicevutaQueueItemInternal(input: {
  slim: FatturaSyncQueueItem;
  byVat: Map<string, FornitoreRow>;
  fornitori: FornitoreRow[];
  usedTarghe: Set<string>;
}): Promise<FatturaSyncQueueItem> {
  const slim = input.slim;
  const stub: FicDocumentNormalized = {
    ficId: slim.ficId,
    type: "received",
    number: slim.numeroEsterno,
    date: slim.dataEmissione,
    dueDate: null,
    entityName: slim.entityName,
    entityVat: slim.entityVat,
    amountGross: slim.amountGross,
    status: "paid",
    raw: {},
  };
  let enriched: FicDocumentNormalized;
  try {
    enriched = await enrichReceivedDocument(stub);
  } catch (e) {
    console.error(
      "[fatture-sync] hydrate enrich failed",
      slim.ficId,
      e instanceof Error ? e.message : e
    );
    enriched = stub;
  }

  const existing = resolveFornitoreForDoc(
    enriched,
    input.byVat,
    input.fornitori
  );
  let proposedTarga = existing?.codice_targa ?? slim.proposedTarga;
  if (!existing && !proposedTarga) {
    proposedTarga = nextSequentialCodiceTarga("F", [...input.usedTarghe]);
    input.usedTarghe.add(proposedTarga);
  }

  const full = buildFatturaSyncQueueItem({
    doc: enriched,
    kind: "ricevuta",
    existingId: existing?.id ?? slim.existingId,
    existingLabel: existing
      ? `${existing.codice_targa} — ${existing.ragione_sociale}`
      : slim.existingLabel,
    proposedTarga: existing?.codice_targa ?? proposedTarga,
    linkedFattura: slim.linkedFattura,
    duplicateCandidate: slim.duplicateCandidate,
  });
  return { ...full, needsHydration: false };
}

/**
 * Carica dettaglio/XML/righe per un solo documento in coda (lazy).
 * Evita di arricchire tutta la coda all'avvio sync.
 */
export async function hydrateFatturaSyncQueueItemAction(
  slim: FatturaSyncQueueItem
): Promise<
  | { success: true; item: FatturaSyncQueueItem }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!slim.needsHydration) {
    return { success: true, item: { ...slim, needsHydration: false } };
  }
  if (slim.kind !== "ricevuta") {
    return { success: true, item: { ...slim, needsHydration: false } };
  }

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("*")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const fornitori = (data ?? []) as FornitoreRow[];
  const byVat = new Map<string, FornitoreRow>();
  for (const f of fornitori) {
    const key = normalizeVatKey(f.partita_iva);
    if (key) byVat.set(key, f);
    const cf = normalizeVatKey(f.codice_fiscale ?? "");
    if (cf && !byVat.has(cf)) byVat.set(cf, f);
  }
  const usedTarghe = new Set(await getUsedFornitoriCodiciTarga());

  const item = await hydrateRicevutaQueueItemInternal({
    slim,
    byVat,
    fornitori,
    usedTarghe,
  });
  return { success: true, item };
}

export type PendingFicInvoiceCandidate = FatturaSyncQueueItem & {
  amountClose: boolean;
  amountDelta: number;
};

/**
 * Fatture FiC emesse ancora da sincronizzare per un cliente,
 * priorità a importo uguale/affine alla nota di credito.
 */
export async function listPendingFicInvoicesForClienteAction(input: {
  clienteId: string;
  importoNc: number;
  excludeFicIds?: number[];
}): Promise<
  | { success: true; items: PendingFicInvoiceCandidate[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!input.clienteId) {
    return { success: true, items: [] };
  }

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

  const supabase = await createClient();
  const [clienteRes, registeredRes, invoices] = await Promise.all([
    supabase
      .from("clienti")
      .select("*")
      .eq("id", input.clienteId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("fatture_emesse")
      .select("fic_id")
      .is("deleted_at", null),
    fetchIssuedInvoices(null),
  ]);

  if (clienteRes.error) {
    return { success: false, error: clienteRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }
  const cliente = clienteRes.data as ClienteRow | null;
  if (!cliente) {
    return { success: false, error: "Cliente non trovato." };
  }

  const registeredFicIds = new Set(
    (registeredRes.data ?? [])
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const excluded = new Set(
    (input.excludeFicIds ?? []).filter((n) => Number.isFinite(n) && n > 0)
  );

  const vat = normalizeVatKey(cliente.partita_iva);

  const pending = invoices.filter((d) => {
    if (registeredFicIds.has(d.ficId)) return false;
    if (excluded.has(d.ficId)) return false;
    const docVat = normalizeVatKey(d.entityVat);
    if (vat && docVat) return docVat === vat;
    // Fallback: nome ragione sociale (normalizzato) se manca P.IVA
    if (!vat && !docVat) {
      const a = (cliente.ragione_sociale || "").trim().toLowerCase();
      const b = (d.entityName || "").trim().toLowerCase();
      return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
    }
    return false;
  });

  const sorted = sortPendingInvoicesByNcAmount(pending, input.importoNc);
  const target = Math.abs(input.importoNc);
  const items: PendingFicInvoiceCandidate[] = sorted.map((doc) => {
    const score = amountMatchScore(doc.amountGross, target);
    const base = buildFatturaSyncQueueItem({
      doc,
      kind: "emessa",
      existingId: cliente.id,
      existingLabel: `${cliente.codice_targa} — ${cliente.ragione_sociale}`,
      proposedTarga: cliente.codice_targa,
      linkedFattura: null,
    });
    return {
      ...base,
      anagraficaMode: "existing",
      amountClose: score.close,
      amountDelta: score.delta,
    };
  });

  return { success: true, items };
}

/** Collega manualmente un documento FiC a una fattura emessa già registrata (anti-duplicato). */
export async function linkFicIdToFatturaEmessaAction(input: {
  fatturaId: string;
  ficId: number;
  numeroEsterno?: string;
  motivo?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!input.fatturaId || !Number.isFinite(input.ficId) || input.ficId <= 0) {
    return { success: false, error: "Dati collegamento non validi." };
  }
  const supabase = await createClient();

  const { data: clash } = await supabase
    .from("fatture_emesse")
    .select("id, numero_interno")
    .eq("fic_id", input.ficId)
    .is("deleted_at", null)
    .neq("id", input.fatturaId)
    .maybeSingle();
  if (clash) {
    return {
      success: false,
      error: `FiC #${input.ficId} già collegato a ${(clash as { numero_interno: string }).numero_interno}.`,
    };
  }

  const patch: Record<string, unknown> = {
    fic_id: input.ficId,
    updated_by: auth.userId,
  };
  if (input.numeroEsterno?.trim()) {
    patch.numero_documento_esterno = input.numeroEsterno.trim();
  }

  const { data, error } = await supabase
    .from("fatture_emesse")
    .update(patch)
    .eq("id", input.fatturaId)
    .is("deleted_at", null)
    .select("id, numero_interno, fic_id")
    .single();
  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Collegamento non riuscito.",
    };
  }

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: input.fatturaId,
    action: "sync_link_fic",
    actor_id: auth.userId,
    summary: `Collegato FiC #${input.ficId} a ${(data as { numero_interno: string }).numero_interno}`,
    payload: {
      ficId: input.ficId,
      motivo: input.motivo ?? "conferma_operatore",
      numeroEsterno: input.numeroEsterno ?? "",
    },
  });

  return { success: true };
}

/** Collega FiC a fattura ricevuta già registrata (anti-duplicato). */
export async function linkFicIdToFatturaRicevutaAction(input: {
  fatturaId: string;
  ficId: number;
  numeroEsterno?: string;
  motivo?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!input.fatturaId || !Number.isFinite(input.ficId) || input.ficId <= 0) {
    return { success: false, error: "Dati collegamento non validi." };
  }
  const supabase = await createClient();

  const { data: clash } = await supabase
    .from("fatture_ricevute")
    .select("id, numero_interno")
    .eq("fic_id", input.ficId)
    .is("deleted_at", null)
    .neq("id", input.fatturaId)
    .maybeSingle();
  if (clash) {
    return {
      success: false,
      error: `FiC #${input.ficId} già collegato a ${(clash as { numero_interno: string }).numero_interno}.`,
    };
  }

  const patch: Record<string, unknown> = {
    fic_id: input.ficId,
    updated_by: auth.userId,
  };
  if (input.numeroEsterno?.trim()) {
    patch.numero_documento_esterno = input.numeroEsterno.trim();
  }

  const { data, error } = await supabase
    .from("fatture_ricevute")
    .update(patch)
    .eq("id", input.fatturaId)
    .is("deleted_at", null)
    .select("id, numero_interno, fic_id")
    .single();
  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Collegamento non riuscito.",
    };
  }

  await writeAuditLog({
    entity_type: "fatture_ricevute",
    entity_id: input.fatturaId,
    action: "sync_link_fic",
    actor_id: auth.userId,
    summary: `Collegato FiC #${input.ficId} a ${(data as { numero_interno: string }).numero_interno}`,
    payload: {
      ficId: input.ficId,
      motivo: input.motivo ?? "conferma_operatore",
      numeroEsterno: input.numeroEsterno ?? "",
    },
  });

  return { success: true };
}
