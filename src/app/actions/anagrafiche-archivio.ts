"use server";

import {
  draftToArchivioSnapshot,
  mapClienteArchivioRow,
  mapFornitoreArchivioRow,
  type AnagraficaArchivioHit,
  type ArchivioMotivo,
} from "@/lib/amministrazione/anagrafiche-archivio";
import {
  normalizeVatKey,
  type AnagraficaSyncDraft,
  type AnagraficaSyncKind,
} from "@/lib/amministrazione/fic-anagrafiche";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  ClienteArchivioRow,
  FornitoreArchivioRow,
} from "@/types/database";

export async function findAnagraficaArchivioByVatAction(
  kind: AnagraficaSyncKind,
  partitaIva: string
): Promise<
  | { success: true; hit: AnagraficaArchivioHit | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const vat = normalizeVatKey(partitaIva);
  if (!vat) return { success: true, hit: null };

  const supabase = await createClient();
  const table =
    kind === "cliente" ? "clienti_archivio" : "fornitori_archivio";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .is("ripescato_at", null)
    .ilike("partita_iva", partitaIva.trim())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as Array<ClienteArchivioRow | FornitoreArchivioRow>;
  const match = rows.find(
    (r) => normalizeVatKey(r.partita_iva) === vat
  );
  if (!match) return { success: true, hit: null };

  return {
    success: true,
    hit:
      kind === "cliente"
        ? mapClienteArchivioRow(match as ClienteArchivioRow)
        : mapFornitoreArchivioRow(match as FornitoreArchivioRow),
  };
}

export async function upsertAnagraficaArchivioFromDraftAction(input: {
  kind: AnagraficaSyncKind;
  draft: AnagraficaSyncDraft;
  ficEntityId?: number | null;
  motivo: ArchivioMotivo;
  note?: string;
}): Promise<
  | { success: true; archivioId: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const vat = normalizeVatKey(input.draft.partitaIva);
  const table =
    input.kind === "cliente" ? "clienti_archivio" : "fornitori_archivio";
  const snapshot = draftToArchivioSnapshot(input.draft);

  if (vat) {
    const { data: existing } = await supabase
      .from(table)
      .select("id, partita_iva")
      .is("ripescato_at", null)
      .limit(50);
    const hit = ((existing ?? []) as Array<{ id: string; partita_iva: string }>)
      .find((r) => normalizeVatKey(r.partita_iva) === vat);
    if (hit) {
      const { error } = await supabase
        .from(table)
        .update({
          ragione_sociale: input.draft.ragioneSociale.trim(),
          partita_iva: input.draft.partitaIva.trim(),
          fic_entity_id: input.ficEntityId ?? null,
          motivo: input.motivo,
          note: input.note ?? "",
          snapshot,
          updated_by: auth.userId,
        })
        .eq("id", hit.id);
      if (error) return { success: false, error: error.message };
      await writeAuditLog({
        entity_type: table,
        entity_id: hit.id,
        action: "update",
        actor_id: auth.userId,
        summary: `Aggiornato archivio ${input.kind} ${input.draft.ragioneSociale}`,
        payload: { motivo: input.motivo, vat },
      });
      return { success: true, archivioId: hit.id };
    }
  }

  const { data, error } = await supabase
    .from(table)
    .insert({
      partita_iva: input.draft.partitaIva.trim(),
      ragione_sociale: input.draft.ragioneSociale.trim(),
      fic_entity_id: input.ficEntityId ?? null,
      motivo: input.motivo,
      note: input.note ?? "",
      snapshot,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Salvataggio archivio non riuscito.",
    };
  }

  await writeAuditLog({
    entity_type: table,
    entity_id: data.id as string,
    action: "create",
    actor_id: auth.userId,
    summary: `Archiviato ${input.kind} ${input.draft.ragioneSociale}`,
    payload: { motivo: input.motivo, vat },
  });

  return { success: true, archivioId: data.id as string };
}

export async function markAnagraficaArchivioRipescatoAction(input: {
  kind: AnagraficaSyncKind;
  archivioId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const table =
    input.kind === "cliente" ? "clienti_archivio" : "fornitori_archivio";

  const { error } = await supabase
    .from(table)
    .update({
      ripescato_at: new Date().toISOString(),
      ripescato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.archivioId)
    .is("ripescato_at", null);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: table,
    entity_id: input.archivioId,
    action: "update",
    actor_id: auth.userId,
    summary: `Ripescaggio ${input.kind} da archivio`,
    payload: { archivio_id: input.archivioId },
  });

  return { success: true };
}

export async function loadActiveArchivioMapsAction(
  kind: AnagraficaSyncKind
): Promise<
  | {
      success: true;
      byVat: Record<string, AnagraficaArchivioHit>;
      byFicId: Record<string, AnagraficaArchivioHit>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const table =
    kind === "cliente" ? "clienti_archivio" : "fornitori_archivio";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .is("ripescato_at", null);
  if (error) return { success: false, error: error.message };

  const byVat: Record<string, AnagraficaArchivioHit> = {};
  const byFicId: Record<string, AnagraficaArchivioHit> = {};
  for (const row of (data ?? []) as Array<
    ClienteArchivioRow | FornitoreArchivioRow
  >) {
    const hit =
      kind === "cliente"
        ? mapClienteArchivioRow(row as ClienteArchivioRow)
        : mapFornitoreArchivioRow(row as FornitoreArchivioRow);
    const vat = normalizeVatKey(hit.partitaIva);
    if (vat && !byVat[vat]) byVat[vat] = hit;
    if (hit.ficEntityId) byFicId[String(hit.ficEntityId)] = hit;
  }
  return { success: true, byVat, byFicId };
}
