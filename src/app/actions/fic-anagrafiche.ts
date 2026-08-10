"use server";

import {
  createClienteAction,
  updateClienteAction,
} from "@/app/actions/clienti";
import {
  createFornitoreAction,
  updateFornitoreAction,
} from "@/app/actions/fornitori";
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
  ClienteRow,
  FicImportEntityKind,
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

export async function startFicSyncFornitoriAction(): Promise<
  | { success: true; items: AnagraficaSyncReviewItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
    const discarded = await loadDiscardedIds("supplier");
    const [suppliers, received] = await Promise.all([
      fetchFicSuppliers(),
      fetchReceivedInvoices(null),
    ]);
    const merged = mergeInvoiceEnrichment(
      suppliers,
      received.map((d) => ({ raw: d.raw })),
      "supplier"
    ).filter((e) => e.ficId && !discarded.has(e.ficId));

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
    const usedTarghe = locals.map((f) => f.codiceTarga);
    const items: AnagraficaSyncReviewItem[] = [];

    for (const entity of merged) {
      const incoming = draftFromFicEntity(entity);
      if (!incoming.ragioneSociale.trim()) continue;
      const existing = incoming.partitaIva
        ? byVat.get(normalizeVatKey(incoming.partitaIva))
        : undefined;
      const current = existing ? draftFromFornitore(existing) : null;
      const { proposed, changedFields } = mergeProposedDraft(incoming, current);

      // Se già presente e niente da cambiare → salta (niente rumore)
      if (existing && changedFields.length === 0) continue;

      let codiceTarga = existing?.codiceTarga ?? "";
      if (!existing) {
        codiceTarga = await previewTarga("F", usedTarghe);
        usedTarghe.push(codiceTarga);
      }

      items.push({
        ficEntityId: entity.ficId,
        kind: "fornitore",
        codiceTarga,
        mode: existing ? "update" : "create",
        existingId: existing?.id ?? null,
        current,
        proposed,
        changedFields,
      });
    }

    items.sort((a, b) =>
      a.proposed.ragioneSociale.localeCompare(b.proposed.ragioneSociale, "it")
    );
    return { success: true, items };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync fornitori fallita.",
    };
  }
}

export async function startFicSyncClientiAction(): Promise<
  | { success: true; items: AnagraficaSyncReviewItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
    const discarded = await loadDiscardedIds("client");
    const [clients, issued] = await Promise.all([
      fetchFicClients(),
      fetchIssuedInvoices(null),
    ]);
    const merged = mergeInvoiceEnrichment(
      clients,
      issued.map((d) => ({ raw: d.raw })),
      "client"
    ).filter((e) => e.ficId && !discarded.has(e.ficId));

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
    const items: AnagraficaSyncReviewItem[] = [];

    for (const entity of merged) {
      const incoming = draftFromFicEntity(entity);
      if (!incoming.ragioneSociale.trim()) continue;
      const existing = incoming.partitaIva
        ? byVat.get(normalizeVatKey(incoming.partitaIva))
        : undefined;
      const current = existing ? draftFromCliente(existing) : null;
      const { proposed, changedFields } = mergeProposedDraft(incoming, current);
      if (existing && changedFields.length === 0) continue;

      let codiceTarga = existing?.codiceTarga ?? "";
      if (!existing) {
        codiceTarga = await previewTarga("C", usedTarghe);
        usedTarghe.push(codiceTarga);
      }

      items.push({
        ficEntityId: entity.ficId,
        kind: "cliente",
        codiceTarga,
        mode: existing ? "update" : "create",
        existingId: existing?.id ?? null,
        current,
        proposed,
        changedFields,
      });
    }

    items.sort((a, b) =>
      a.proposed.ragioneSociale.localeCompare(b.proposed.ragioneSociale, "it")
    );
    return { success: true, items };
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
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { error } = await supabase.from("fic_import_discarded").upsert(
    {
      entity_kind: entityKindDb(input.kind),
      fic_entity_id: input.ficEntityId,
      entity_name: input.entityName ?? "",
      vat_number: input.vatNumber ?? "",
      created_by: auth.userId,
    },
    { onConflict: "entity_kind,fic_entity_id" }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveFicImportReviewAction(input: {
  kind: AnagraficaSyncKind;
  mode: "create" | "update";
  existingId: string | null;
  codiceTarga: string;
  draft: AnagraficaSyncDraft;
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const draft = input.draft;

  if (input.kind === "fornitore") {
    const values = draftToFornitoreInput(
      draft,
      isValidCodiceTarga(input.codiceTarga, "F")
        ? input.codiceTarga
        : undefined
    );
    if (input.mode === "update" && input.existingId) {
      const fd = new FormData();
      fd.set("input", JSON.stringify(values));
      const result = await updateFornitoreAction(input.existingId, fd);
      return result.success
        ? { success: true }
        : { success: false, error: result.error };
    }
    const fd = new FormData();
    fd.set("input", JSON.stringify(values));
    const result = await createFornitoreAction(fd);
    return result.success
      ? { success: true }
      : { success: false, error: result.error };
  }

  const values = draftToClienteInput(
    draft,
    isValidCodiceTarga(input.codiceTarga, "C") ? input.codiceTarga : undefined
  );
  if (input.mode === "update" && input.existingId) {
    const result = await updateClienteAction(input.existingId, values);
    return result.success
      ? { success: true }
      : { success: false, error: result.error };
  }
  const result = await createClienteAction(values);
  return result.success
    ? { success: true }
    : { success: false, error: result.error };
}
