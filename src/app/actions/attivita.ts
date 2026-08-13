"use server";

import { createClient } from "@/lib/supabase/server";
import {
  attivitaInputSchema,
  isValidCodiceAttivita,
  mapAttivitaRow,
  normalizeAttivitaInput,
  type Attivita,
  type AttivitaInput,
} from "@/lib/amministrazione/attivita";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { AttivitaInsert, AttivitaRow } from "@/types/database";

export type AttivitaActionResult =
  | { success: true; attivita: Attivita }
  | { success: false; error: string };

export async function listAttivitaAction(): Promise<
  | { success: true; attivita: Attivita[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attivita")
    .select("*")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    attivita: ((data ?? []) as AttivitaRow[]).map(mapAttivitaRow),
  };
}

export async function listAttivitaByProdottoAction(
  prodottoId: string
): Promise<
  | { success: true; attivita: Attivita[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!prodottoId) return { success: true, attivita: [] };
  const supabase = await createClient();
  const { data: links, error: linkErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("attivita_id, sort_order")
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (linkErr) return { success: false, error: linkErr.message };
  const ids = (links ?? []).map(
    (r: { attivita_id: string }) => r.attivita_id
  );
  if (!ids.length) return { success: true, attivita: [] };

  const { data, error } = await supabase
    .from("attivita")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const byId = new Map(
    ((data ?? []) as AttivitaRow[]).map((r) => [r.id, mapAttivitaRow(r)])
  );
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((a): a is Attivita => Boolean(a));
  return { success: true, attivita: ordered };
}

export async function setProdottiPropriAttivitaAction(input: {
  prodottoId: string;
  attivitaIds: string[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: existing, error: exErr } = await supabase
    .from("prodotti_propri_attivita")
    .select("id, attivita_id")
    .eq("prodotto_id", input.prodottoId)
    .is("deleted_at", null);
  if (exErr) return { success: false, error: exErr.message };

  const wanted = input.attivitaIds.filter(Boolean);
  const current = (existing ?? []) as Array<{
    id: string;
    attivita_id: string;
  }>;
  const currentIds = new Set(current.map((c) => c.attivita_id));

  const toRemove = current.filter((c) => !wanted.includes(c.attivita_id));
  if (toRemove.length) {
    await supabase
      .from("prodotti_propri_attivita")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  for (let i = 0; i < wanted.length; i += 1) {
    const attivitaId = wanted[i]!;
    if (currentIds.has(attivitaId)) {
      await supabase
        .from("prodotti_propri_attivita")
        .update({ sort_order: i, updated_by: auth.userId })
        .eq("prodotto_id", input.prodottoId)
        .eq("attivita_id", attivitaId)
        .is("deleted_at", null);
    } else {
      const { error: insErr } = await supabase
        .from("prodotti_propri_attivita")
        .insert({
          prodotto_id: input.prodottoId,
          attivita_id: attivitaId,
          sort_order: i,
          created_by: auth.userId,
          updated_by: auth.userId,
        });
      if (insErr) return { success: false, error: insErr.message };
    }
  }

  await writeAuditLog({
    entity_type: "prodotti_propri_attivita",
    entity_id: input.prodottoId,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornate attività prodotto (${wanted.length})`,
    payload: { attivitaIds: wanted },
  });

  return { success: true };
}

export async function createAttivitaAction(
  input: AttivitaInput
): Promise<AttivitaActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = attivitaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const normalized = normalizeAttivitaInput(parsed.data);
  if (!isValidCodiceAttivita(normalized.codice)) {
    return {
      success: false,
      error:
        "La targa deve iniziare con At, seguito da lettere, cifre o - _ / (es. At-TRi/DRa).",
    };
  }

  const supabase = await createClient();
  const insert: AttivitaInsert = {
    codice: normalized.codice,
    titolo: normalized.titolo,
    spiegazione: normalized.spiegazione ?? "",
    kg_per_ora: normalized.kgPerOra,
    ore_giorno: normalized.oreGiorno ?? 8,
    incastrabile_durante_lavorazione: Boolean(
      normalized.incastrabileDuranteLavorazione
    ),
    documento_stato: normalized.documentoStato ?? "approvato",
    versione: 1,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase
    .from("attivita")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `La targa ${normalized.codice} esiste già.`
          : error?.message ?? "Salvataggio non riuscito.",
    };
  }

  const row = data as AttivitaRow;
  await writeAuditLog({
    entity_type: "attivita",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata attività ${row.codice}`,
    payload: { codice: row.codice, titolo: row.titolo },
  });

  return { success: true, attivita: mapAttivitaRow(row) };
}

export async function updateAttivitaAction(
  id: string,
  input: AttivitaInput
): Promise<AttivitaActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = attivitaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const normalized = normalizeAttivitaInput(parsed.data);
  if (!isValidCodiceAttivita(normalized.codice)) {
    return {
      success: false,
      error:
        "La targa deve iniziare con At, seguito da lettere, cifre o - _ /.",
    };
  }

  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("attivita")
    .select("versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data, error } = await supabase
    .from("attivita")
    .update({
      codice: normalized.codice,
      titolo: normalized.titolo,
      spiegazione: normalized.spiegazione ?? "",
      kg_per_ora: normalized.kgPerOra,
      ore_giorno: normalized.oreGiorno ?? 8,
      incastrabile_durante_lavorazione: Boolean(
        normalized.incastrabileDuranteLavorazione
      ),
      documento_stato: normalized.documentoStato ?? "approvato",
      versione: Number((prev as { versione?: number } | null)?.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `La targa ${normalized.codice} esiste già.`
          : error?.message ?? "Aggiornamento non riuscito.",
    };
  }

  const row = data as AttivitaRow;
  await writeAuditLog({
    entity_type: "attivita",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata attività ${row.codice}`,
    payload: { codice: row.codice, titolo: row.titolo },
  });

  return { success: true, attivita: mapAttivitaRow(row) };
}

export async function softDeleteAttivitaAction(input: {
  id: string;
  confermaTestuale: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const { data: row, error: loadErr } = await supabase
    .from("attivita")
    .select("id, codice")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!row) return { success: false, error: "Attività non trovata." };

  const expected = fraseConfermaSoftDelete(
    (row as { codice: string }).codice
  );
  if (input.confermaTestuale.trim() !== expected) {
    return {
      success: false,
      error: `Per confermare digita esattamente: ${expected}`,
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("attivita")
    .update({
      deleted_at: nowIso,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "attivita",
    entity_id: input.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminata (soft) attività ${(row as { codice: string }).codice}`,
    payload: { codice: (row as { codice: string }).codice },
  });

  return { success: true };
}
