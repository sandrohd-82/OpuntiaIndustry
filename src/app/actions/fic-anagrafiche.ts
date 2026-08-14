"use server";

import {
  markAnagraficaArchivioRipescatoAction,
  upsertAnagraficaArchivioFromDraftAction,
} from "@/app/actions/anagrafiche-archivio";
import {
  createClienteAction,
  updateClienteAction,
} from "@/app/actions/clienti";
import {
  createFornitoreAction,
  getUsedFornitoriCodiciTarga,
  updateFornitoreAction,
} from "@/app/actions/fornitori";
import {
  mapClienteArchivioRow,
  mapFornitoreArchivioRow,
  type AnagraficaArchivioHit,
} from "@/lib/amministrazione/anagrafiche-archivio";
import {
  draftFromCliente,
  draftFromFicEntity,
  draftFromFornitore,
  draftToClienteInput,
  draftToFornitoreInput,
  mergeProposedDraft,
  normalizeVatKey,
  type AnagraficaSyncDraft,
  type AnagraficaSyncKind,
  type AnagraficaSyncReviewItem,
} from "@/lib/amministrazione/fic-anagrafiche";
import {
  nextSequentialCodiceTarga,
  isValidCodiceTarga,
} from "@/lib/amministrazione/codice-targa";
import { mapClienteRow } from "@/lib/amministrazione/clienti";
import { mapFornitoreRow } from "@/lib/amministrazione/fornitori";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  enrichEntityFromInvoiceRaw,
  fetchFicClients,
  fetchFicSuppliers,
  fetchIssuedInvoices,
  fetchReceivedInvoices,
  getFicConfig,
  type FicEntityNormalized,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type {
  ClienteArchivioRow,
  ClienteRow,
  FicImportEntityKind,
  FornitoreArchivioRow,
  FornitoreRow,
} from "@/types/database";

function entityKindDb(kind: AnagraficaSyncKind): FicImportEntityKind {
  return kind === "fornitore" ? "supplier" : "client";
}

async function loadDiscardedIds(
  kind: FicImportEntityKind
): Promise<Set<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fic_import_discarded")
    .select("fic_entity_id")
    .eq("entity_kind", kind);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => Number(r.fic_entity_id)));
}

async function loadArchivioHits(
  kind: AnagraficaSyncKind
): Promise<{
  byVat: Map<string, AnagraficaArchivioHit>;
  byFicId: Map<number, AnagraficaArchivioHit>;
}> {
  const supabase = await createClient();
  const table =
    kind === "cliente" ? "clienti_archivio" : "fornitori_archivio";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .is("ripescato_at", null);
  if (error) throw new Error(error.message);

  const byVat = new Map<string, AnagraficaArchivioHit>();
  const byFicId = new Map<number, AnagraficaArchivioHit>();
  for (const row of (data ?? []) as Array<
    ClienteArchivioRow | FornitoreArchivioRow
  >) {
    const hit =
      kind === "cliente"
        ? mapClienteArchivioRow(row as ClienteArchivioRow)
        : mapFornitoreArchivioRow(row as FornitoreArchivioRow);
    const vat = normalizeVatKey(hit.partitaIva);
    if (vat && !byVat.has(vat)) byVat.set(vat, hit);
    if (hit.ficEntityId && !byFicId.has(hit.ficEntityId)) {
      byFicId.set(hit.ficEntityId, hit);
    }
  }
  return { byVat, byFicId };
}

async function loadCheckpointCompletedIds(
  kind: FicImportEntityKind
): Promise<{ completed: Set<number>; resumed: boolean; lastSavedName: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fic_import_checkpoints")
    .select("status, completed_fic_ids, last_saved_name")
    .eq("entity_kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status === "idle") {
    return { completed: new Set(), resumed: false, lastSavedName: "" };
  }
  const ids = Array.isArray(data.completed_fic_ids)
    ? data.completed_fic_ids.map((n) => Number(n))
    : [];
  return {
    completed: new Set(ids.filter((n) => Number.isFinite(n) && n > 0)),
    resumed: data.status === "paused" || data.status === "in_progress",
    lastSavedName: String(data.last_saved_name ?? ""),
  };
}

async function upsertCheckpoint(input: {
  kind: FicImportEntityKind;
  status: "idle" | "in_progress" | "paused";
  completedFicIds: number[];
  lastSavedFicEntityId?: number | null;
  lastSavedName?: string;
  lastSavedVat?: string;
  userId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fic_import_checkpoints").upsert(
    {
      entity_kind: input.kind,
      status: input.status,
      completed_fic_ids: input.completedFicIds,
      last_saved_fic_entity_id: input.lastSavedFicEntityId ?? null,
      last_saved_name: input.lastSavedName ?? "",
      last_saved_vat: input.lastSavedVat ?? "",
      updated_by: input.userId,
    },
    { onConflict: "entity_kind" }
  );
  if (error) throw new Error(error.message);
}

export type FicSyncStartResult =
  | {
      success: true;
      items: AnagraficaSyncReviewItem[];
      resumed: boolean;
      skippedCompleted: number;
      completedFicIds: number[];
      lastSavedName: string;
    }
  | { success: false; error: string };

function mergeInvoiceEnrichment(
  entities: FicEntityNormalized[],
  invoices: Array<{ raw: Record<string, unknown> }>,
  kind: "supplier" | "client"
): FicEntityNormalized[] {
  const byId = new Map(entities.map((e) => [e.ficId, e]));
  const byVat = new Map(
    entities
      .filter((e) => e.vat)
      .map((e) => [normalizeVatKey(e.vat), e] as const)
  );

  for (const inv of invoices) {
    const entity = (inv.raw.entity ?? {}) as Record<string, unknown>;
    const ficId = Number(entity.id ?? 0);
    const vat = normalizeVatKey(
      String(entity.vat_number ?? entity.tax_code ?? "")
    );
    let base = ficId ? byId.get(ficId) : undefined;
    if (!base && vat) base = byVat.get(vat);
    if (base) {
      const enriched = enrichEntityFromInvoiceRaw(base, inv.raw);
      byId.set(enriched.ficId, enriched);
      if (enriched.vat) byVat.set(normalizeVatKey(enriched.vat), enriched);
      continue;
    }
    // Solo da fattura: crea stub se ha id + nome
    const stub = enrichEntityFromInvoiceRaw(
      {
        ficId: ficId || 0,
        kind,
        name: "",
        vat: "",
        taxCode: "",
        email: "",
        pec: "",
        phone: "",
        sdi: "",
        country: "Italia",
        province: "",
        city: "",
        postalCode: "",
        street: "",
        shippingAddress: "",
      },
      inv.raw
    );
    if (stub.ficId && stub.name) {
      byId.set(stub.ficId, stub);
      if (stub.vat) byVat.set(normalizeVatKey(stub.vat), stub);
    }
  }

  return Array.from(byId.values());
}

async function previewTarga(
  prefix: "F" | "C",
  used: string[]
): Promise<string> {
  return nextSequentialCodiceTarga(prefix, used);
}

export async function startFicSyncFornitoriAction(): Promise<FicSyncStartResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
    const discarded = await loadDiscardedIds("supplier");
    const archivio = await loadArchivioHits("fornitore");
    const checkpoint = await loadCheckpointCompletedIds("supplier");
    const [suppliers, received] = await Promise.all([
      fetchFicSuppliers(),
      fetchReceivedInvoices(null),
    ]);
    const merged = mergeInvoiceEnrichment(
      suppliers,
      received.map((d) => ({ raw: d.raw })),
      "supplier"
    ).filter((e) => e.ficId && !checkpoint.completed.has(e.ficId));

    const supabase = await createClient();
    const { data: localRows, error } = await supabase
      .from("fornitori")
      .select("*")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };

    const locals = ((localRows ?? []) as FornitoreRow[]).map(mapFornitoreRow);
    const byVat = new Map(
      locals
        .filter((f) => f.partitaIva)
        .map((f) => [normalizeVatKey(f.partitaIva), f] as const)
    );
    const usedTarghe = await getUsedFornitoriCodiciTarga();
    /** Una sola anteprima: non prenotare F progressivi per tutta la coda sync. */
    const nextTargaPreview = await previewTarga("F", usedTarghe);
    const items: AnagraficaSyncReviewItem[] = [];

    for (const entity of merged) {
      const incoming = draftFromFicEntity(entity);
      if (!incoming.ragioneSociale.trim()) continue;
      const vatKey = normalizeVatKey(incoming.partitaIva);
      const existing = vatKey ? byVat.get(vatKey) : undefined;
      const archHit =
        archivio.byFicId.get(entity.ficId) ??
        (vatKey ? archivio.byVat.get(vatKey) : undefined);
      const wasDiscarded = discarded.has(entity.ficId) || Boolean(archHit);

      const current = existing ? draftFromFornitore(existing) : null;
      const baseIncoming =
        !existing && archHit
          ? mergeProposedDraft(incoming, archHit.draft).proposed
          : incoming;
      const { proposed, changedFields } = mergeProposedDraft(
        baseIncoming,
        current
      );

      // Attivo e identico → salta; scartati/archiviati (non attivi) si ripropongono
      if (existing && changedFields.length === 0) continue;

      const codiceTarga = existing?.codiceTarga ?? nextTargaPreview;

      items.push({
        ficEntityId: entity.ficId,
        kind: "fornitore",
        codiceTarga,
        mode: existing ? "update" : "create",
        existingId: existing?.id ?? null,
        current: current ?? (archHit ? archHit.draft : null),
        proposed,
        changedFields,
        fromArchivio: wasDiscarded && !existing,
        archivioId: archHit?.id ?? null,
        motivoArchivio:
          archHit?.motivo ?? (wasDiscarded ? "scartata_sync" : null),
      });
    }

    items.sort((a, b) =>
      a.proposed.ragioneSociale.localeCompare(b.proposed.ragioneSociale, "it")
    );

    if (items.length === 0 && checkpoint.completed.size > 0) {
      await upsertCheckpoint({
        kind: "supplier",
        status: "idle",
        completedFicIds: [],
        userId: auth.userId,
      });
    } else if (items.length > 0) {
      await upsertCheckpoint({
        kind: "supplier",
        status: "in_progress",
        completedFicIds: Array.from(checkpoint.completed),
        lastSavedName: checkpoint.lastSavedName,
        userId: auth.userId,
      });
    }

    return {
      success: true,
      items,
      resumed: checkpoint.resumed && checkpoint.completed.size > 0,
      skippedCompleted: checkpoint.completed.size,
      completedFicIds: Array.from(checkpoint.completed),
      lastSavedName: checkpoint.lastSavedName,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync fornitori fallita.",
    };
  }
}

export async function startFicSyncClientiAction(): Promise<FicSyncStartResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
    const discarded = await loadDiscardedIds("client");
    const archivio = await loadArchivioHits("cliente");
    const checkpoint = await loadCheckpointCompletedIds("client");
    const [clients, issued] = await Promise.all([
      fetchFicClients(),
      fetchIssuedInvoices(null),
    ]);
    const merged = mergeInvoiceEnrichment(
      clients,
      issued.map((d) => ({ raw: d.raw })),
      "client"
    ).filter((e) => e.ficId && !checkpoint.completed.has(e.ficId));

    const supabase = await createClient();
    const { data: localRows, error } = await supabase
      .from("clienti")
      .select("*")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };

    const locals = ((localRows ?? []) as ClienteRow[]).map(mapClienteRow);
    const byVat = new Map(
      locals
        .filter((c) => c.partitaIva)
        .map((c) => [normalizeVatKey(c.partitaIva), c] as const)
    );
    const usedTarghe = locals.map((c) => c.codiceTarga);
    /** Una sola anteprima: non prenotare C001…C00D per tutta la coda sync. */
    const nextTargaPreview = await previewTarga("C", usedTarghe);
    const items: AnagraficaSyncReviewItem[] = [];

    for (const entity of merged) {
      const incoming = draftFromFicEntity(entity);
      if (!incoming.ragioneSociale.trim()) continue;
      const vatKey = normalizeVatKey(incoming.partitaIva);
      const existing = vatKey ? byVat.get(vatKey) : undefined;
      const archHit =
        archivio.byFicId.get(entity.ficId) ??
        (vatKey ? archivio.byVat.get(vatKey) : undefined);
      const wasDiscarded = discarded.has(entity.ficId) || Boolean(archHit);

      const current = existing ? draftFromCliente(existing) : null;
      const baseIncoming =
        !existing && archHit
          ? mergeProposedDraft(incoming, archHit.draft).proposed
          : incoming;
      const { proposed, changedFields } = mergeProposedDraft(
        baseIncoming,
        current
      );

      if (existing && changedFields.length === 0) continue;

      const codiceTarga = existing?.codiceTarga ?? nextTargaPreview;

      items.push({
        ficEntityId: entity.ficId,
        kind: "cliente",
        codiceTarga,
        mode: existing ? "update" : "create",
        existingId: existing?.id ?? null,
        current: current ?? (archHit ? archHit.draft : null),
        proposed,
        changedFields,
        fromArchivio: wasDiscarded && !existing,
        archivioId: archHit?.id ?? null,
        motivoArchivio:
          archHit?.motivo ?? (wasDiscarded ? "scartata_sync" : null),
      });
    }

    items.sort((a, b) =>
      a.proposed.ragioneSociale.localeCompare(b.proposed.ragioneSociale, "it")
    );

    if (items.length === 0 && checkpoint.completed.size > 0) {
      await upsertCheckpoint({
        kind: "client",
        status: "idle",
        completedFicIds: [],
        userId: auth.userId,
      });
    } else if (items.length > 0) {
      await upsertCheckpoint({
        kind: "client",
        status: "in_progress",
        completedFicIds: Array.from(checkpoint.completed),
        lastSavedName: checkpoint.lastSavedName,
        userId: auth.userId,
      });
    }

    return {
      success: true,
      items,
      resumed: checkpoint.resumed && checkpoint.completed.size > 0,
      skippedCompleted: checkpoint.completed.size,
      completedFicIds: Array.from(checkpoint.completed),
      lastSavedName: checkpoint.lastSavedName,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync clienti fallita.",
    };
  }
}

export async function discardFicImportAction(input: {
  kind: AnagraficaSyncKind;
  ficEntityId: number;
  entityName?: string;
  vatNumber?: string;
  note?: string;
  draft?: AnagraficaSyncDraft | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { error } = await supabase.from("fic_import_discarded").upsert(
    {
      entity_kind: entityKindDb(input.kind),
      fic_entity_id: input.ficEntityId,
      entity_name: input.entityName ?? "",
      vat_number: input.vatNumber ?? "",
      note: input.note ?? "",
      created_by: auth.userId,
    },
    { onConflict: "entity_kind,fic_entity_id" }
  );
  if (error) return { success: false, error: error.message };

  const draft: AnagraficaSyncDraft = input.draft ?? {
    ragioneSociale: input.entityName ?? "",
    partitaIva: input.vatNumber ?? "",
    codiceFiscale: input.vatNumber ?? "",
    email: "",
    pec: "",
    sdiCode: "",
    telefono: "",
    sitoWeb: "",
    sedeAmministrativa: {
      nazione: "Italia",
      provincia: "",
      citta: "",
      cap: "",
      indirizzo: "",
    },
    sedeMagazzino: {
      nazione: "",
      provincia: "",
      citta: "",
      cap: "",
      indirizzo: "",
    },
  };

  const archived = await upsertAnagraficaArchivioFromDraftAction({
    kind: input.kind,
    draft,
    ficEntityId: input.ficEntityId,
    motivo: "scartata_sync",
    note: input.note ?? "",
  });
  if (!archived.success) return { success: false, error: archived.error };

  return { success: true };
}

/** Dopo Salva/Scarta: aggiorna elenco già fatti (così la Pausa non perde nulla). */
export async function markFicImportProgressAction(input: {
  kind: AnagraficaSyncKind;
  completedFicIds: number[];
  lastSavedFicEntityId: number;
  lastSavedName: string;
  lastSavedVat: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    await upsertCheckpoint({
      kind: entityKindDb(input.kind),
      status: "in_progress",
      completedFicIds: input.completedFicIds,
      lastSavedFicEntityId: input.lastSavedFicEntityId,
      lastSavedName: input.lastSavedName,
      lastSavedVat: input.lastSavedVat,
      userId: auth.userId,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Salvataggio avanzamento fallito.",
    };
  }
}

/** Pausa: chiude la sync e riparte da qui al prossimo Sincronizza. */
export async function pauseFicImportAction(input: {
  kind: AnagraficaSyncKind;
  completedFicIds: number[];
  lastSavedFicEntityId: number | null;
  lastSavedName: string;
  lastSavedVat: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    await upsertCheckpoint({
      kind: entityKindDb(input.kind),
      status: "paused",
      completedFicIds: input.completedFicIds,
      lastSavedFicEntityId: input.lastSavedFicEntityId,
      lastSavedName: input.lastSavedName,
      lastSavedVat: input.lastSavedVat,
      userId: auth.userId,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Pausa sync fallita.",
    };
  }
}

/** Fine coda: azzera checkpoint. */
export async function clearFicImportCheckpointAction(
  kind: AnagraficaSyncKind
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    await upsertCheckpoint({
      kind: entityKindDb(kind),
      status: "idle",
      completedFicIds: [],
      lastSavedFicEntityId: null,
      lastSavedName: "",
      lastSavedVat: "",
      userId: auth.userId,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Reset checkpoint fallito.",
    };
  }
}

export type AnagraficaByVatHit = {
  id: string;
  codiceTarga: string;
  ragioneSociale: string;
  partitaIva: string;
  draft: AnagraficaSyncDraft;
};

/** Ricerca anagrafica attiva solo per P.IVA normalizzata (mai per nome). */
export async function findAnagraficaByPartitaIvaAction(input: {
  kind: AnagraficaSyncKind;
  partitaIva: string;
}): Promise<
  | { success: true; hit: AnagraficaByVatHit | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const vatKey = normalizeVatKey(input.partitaIva);
  if (!vatKey) return { success: true, hit: null };

  const supabase = await createClient();
  if (input.kind === "fornitore") {
    const { data, error } = await supabase
      .from("fornitori")
      .select("*")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    const row = ((data ?? []) as FornitoreRow[]).find(
      (r) => normalizeVatKey(r.partita_iva) === vatKey
    );
    if (!row) return { success: true, hit: null };
    const f = mapFornitoreRow(row);
    return {
      success: true,
      hit: {
        id: f.id,
        codiceTarga: f.codiceTarga,
        ragioneSociale: f.ragioneSociale,
        partitaIva: f.partitaIva,
        draft: draftFromFornitore(f),
      },
    };
  }

  const { data, error } = await supabase
    .from("clienti")
    .select("*")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const row = ((data ?? []) as ClienteRow[]).find(
    (r) => normalizeVatKey(r.partita_iva) === vatKey
  );
  if (!row) return { success: true, hit: null };
  const c = mapClienteRow(row);
  return {
    success: true,
    hit: {
      id: c.id,
      codiceTarga: c.codiceTarga,
      ragioneSociale: c.ragioneSociale,
      partitaIva: c.partitaIva,
      draft: draftFromCliente(c),
    },
  };
}

export async function saveFicImportReviewAction(input: {
  kind: AnagraficaSyncKind;
  mode: "create" | "update";
  existingId: string | null;
  codiceTarga: string;
  draft: AnagraficaSyncDraft;
  archivioId?: string | null;
  ficEntityId?: number | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");

  const vatKey = normalizeVatKey(input.draft.partitaIva);
  if (!vatKey) {
    return { success: false, error: "P. IVA obbligatoria per il salvataggio." };
  }
  if (!input.draft.codiceFiscale.trim()) {
    return { success: false, error: "Codice Fiscale obbligatorio per il salvataggio." };
  }

  // Risoluzione definitiva solo per P.IVA: se esiste → update + nome gestionale.
  const resolved = await findAnagraficaByPartitaIvaAction({
    kind: input.kind,
    partitaIva: input.draft.partitaIva,
  });
  if (!resolved.success) return resolved;

  let mode = input.mode;
  let existingId = input.existingId;
  let codiceTarga = input.codiceTarga;
  let draft = { ...input.draft };

  if (resolved.hit) {
    mode = "update";
    existingId = resolved.hit.id;
    codiceTarga = resolved.hit.codiceTarga;
    draft = {
      ...draft,
      ragioneSociale: resolved.hit.ragioneSociale,
      partitaIva: resolved.hit.partitaIva,
    };
  }

  async function afterSaveSuccess(): Promise<
    { success: true } | { success: false; error: string }
  > {
    if (input.archivioId) {
      const marked = await markAnagraficaArchivioRipescatoAction({
        kind: input.kind,
        archivioId: input.archivioId,
      });
      if (!marked.success) return marked;
    }
    if (input.ficEntityId) {
      const supabase = await createClient();
      await supabase
        .from("fic_import_discarded")
        .delete()
        .eq("entity_kind", entityKindDb(input.kind))
        .eq("fic_entity_id", input.ficEntityId);
    }
    return { success: true };
  }

  if (input.kind === "fornitore") {
    // Create: non usare la targa “prenotata” in coda — la assegna il server.
    const values = draftToFornitoreInput(
      draft,
      mode === "update" && isValidCodiceTarga(codiceTarga, "F")
        ? codiceTarga
        : undefined
    );
    values.archivioId = input.archivioId ?? null;
    if (mode === "update" && existingId) {
      const fd = new FormData();
      fd.set("input", JSON.stringify(values));
      const result = await updateFornitoreAction(existingId, fd);
      if (!result.success) return { success: false, error: result.error };
      return afterSaveSuccess();
    }
    const fd = new FormData();
    fd.set("input", JSON.stringify(values));
    const result = await createFornitoreAction(fd);
    if (!result.success) return { success: false, error: result.error };
    return afterSaveSuccess();
  }

  const values = draftToClienteInput(
    draft,
    mode === "update" && isValidCodiceTarga(codiceTarga, "C")
      ? codiceTarga
      : undefined
  );
  values.archivioId = input.archivioId ?? null;
  if (mode === "update" && existingId) {
    const result = await updateClienteAction(existingId, values);
    if (!result.success) return { success: false, error: result.error };
    return afterSaveSuccess();
  }
  const result = await createClienteAction(values);
  if (!result.success) return { success: false, error: result.error };
  return afterSaveSuccess();
}
