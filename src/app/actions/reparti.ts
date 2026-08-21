"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  repartoInputSchema,
  type Reparto,
  type RepartoInput,
} from "@/lib/magazzino/types";
import { createClient } from "@/lib/supabase/server";

type RepartoRow = {
  id: string;
  codice: string;
  nome: string;
  attivo: boolean;
  note: string | null;
  created_at: string;
};

function mapReparto(row: RepartoRow): Reparto {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

export async function listRepartiAction(): Promise<
  { success: true; items: Reparto[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_reparti")
    .select("id, codice, nome, attivo, note, created_at")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as RepartoRow[]).map(mapReparto),
  };
}

/** Elenco leggero per select Magazzino (anche senza area produzione). */
export async function listRepartiAttiviAction(): Promise<
  { success: true; items: Reparto[] } | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_reparti")
    .select("id, codice, nome, attivo, note, created_at")
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as RepartoRow[]).map(mapReparto),
  };
}

export async function createRepartoAction(
  raw: RepartoInput
): Promise<
  { success: true; item: Reparto } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = repartoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_reparti")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      attivo: parsed.data.attivo ?? true,
      note: parsed.data.note?.trim() ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice, nome, attivo, note, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice reparto già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapReparto(data as RepartoRow);
  void writeAuditLog({
    entity_type: "produzione_reparti",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato reparto ${item.codice}`,
    payload: { codice: item.codice, nome: item.nome },
  });
  return { success: true, item };
}

export async function updateRepartoAction(
  id: string,
  raw: RepartoInput
): Promise<
  { success: true; item: Reparto } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = repartoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_reparti")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      attivo: parsed.data.attivo ?? true,
      note: parsed.data.note?.trim() ?? "",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, codice, nome, attivo, note, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice reparto già esistente." };
    }
    return { success: false, error: error.message };
  }
  const item = mapReparto(data as RepartoRow);
  void writeAuditLog({
    entity_type: "produzione_reparti",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato reparto ${item.codice}`,
    payload: { codice: item.codice, nome: item.nome },
  });
  return { success: true, item };
}

export async function softDeleteRepartoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_reparti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_reparti",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete reparto",
    payload: {},
  });
  return { success: true };
}
