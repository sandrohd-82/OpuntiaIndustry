"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAreaAccess } from "@/lib/areas/guard";
import { writeAuditLog } from "@/lib/audit";
import {
  corriereInputSchema,
  imballaggioVoceInputSchema,
  mapCorriereRow,
  mapImballaggioVoceRow,
  type Corriere,
  type CorriereInput,
  type ImballaggioStadio,
  type ImballaggioVoce,
  type ImballaggioVoceInput,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import type { CorriereRow, ImballaggioVoceRow } from "@/types/database";

type ListVociResult =
  | { success: true; items: ImballaggioVoce[] }
  | { success: false; error: string };

type VoceResult =
  | { success: true; item: ImballaggioVoce }
  | { success: false; error: string };

type ListCorrieriResult =
  | { success: true; items: Corriere[] }
  | { success: false; error: string };

type CorriereResult =
  | { success: true; item: Corriere }
  | { success: false; error: string };

export async function listImballaggiVociAction(
  stadio?: ImballaggioStadio
): Promise<ListVociResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  let q = supabase
    .from("imballaggi_voci")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (stadio) q = q.eq("stadio", stadio);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as ImballaggioVoceRow[]).map(mapImballaggioVoceRow),
  };
}

export async function createImballaggioVoceAction(
  raw: ImballaggioVoceInput
): Promise<VoceResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = imballaggioVoceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .insert({
      stadio: v.stadio,
      codice: v.codice.trim(),
      nome: v.nome.trim(),
      largo_mm: v.largoMm ?? null,
      profondita_mm: v.profonditaMm ?? null,
      altezza_mm: v.altezzaMm ?? null,
      capacita_lt: v.capacitaLt ?? null,
      note: (v.note ?? "").trim(),
      sort_order: v.sortOrder ?? 0,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const row = data as ImballaggioVoceRow;
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata voce imballaggio ${row.stadio} ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome, stadio: row.stadio },
  });
  return { success: true, item: mapImballaggioVoceRow(row) };
}

export async function updateImballaggioVoceAction(
  id: string,
  raw: ImballaggioVoceInput
): Promise<VoceResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = imballaggioVoceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .update({
      codice: v.codice.trim(),
      nome: v.nome.trim(),
      largo_mm: v.largoMm ?? null,
      profondita_mm: v.profonditaMm ?? null,
      altezza_mm: v.altezzaMm ?? null,
      capacita_lt: v.capacitaLt ?? null,
      note: (v.note ?? "").trim(),
      sort_order: v.sortOrder ?? 0,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  const row = data as ImballaggioVoceRow;
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata voce imballaggio ${row.codice}`,
    payload: { codice: row.codice, nome: row.nome },
  });
  return { success: true, item: mapImballaggioVoceRow(row) };
}

export async function softDeleteImballaggioVoceAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("imballaggi_voci")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "imballaggi_voci",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Eliminata (soft) voce imballaggio`,
    payload: {},
  });
  return { success: true };
}

export async function listCorrieriAction(): Promise<ListCorrieriResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corrieri")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as CorriereRow[]).map(mapCorriereRow),
  };
}

export async function createCorriereAction(
  raw: CorriereInput
): Promise<CorriereResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = corriereInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corrieri")
    .insert({
      nome: parsed.data.nome.trim(),
      note: (parsed.data.note ?? "").trim(),
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const row = data as CorriereRow;
  await writeAuditLog({
    entity_type: "corrieri",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato corriere ${row.nome}`,
    payload: { nome: row.nome },
  });
  return { success: true, item: mapCorriereRow(row) };
}

export async function softDeleteCorriereAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("corrieri")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "corrieri",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Eliminato (soft) corriere",
    payload: {},
  });
  return { success: true };
}
