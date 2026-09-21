"use server";

import { writeAuditLog } from "@/lib/audit";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isConfigStato, parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import {
  POSTO_FOTO_MAX_PER_POSTO,
  aggiornaFitFotoSchema,
} from "@/lib/magazzino/posto-foto";
import {
  queryFotoPosto,
  queryFotoPrincipali,
} from "@/lib/magazzino/posto-foto-query";
import { createServiceClient } from "@/lib/supabase/server";
import type { AreaSlug } from "@/types/database";

/** Stesse aree della pianta: niente redirect/notFound (la modale resterebbe in loading). */
const POSTO_FOTO_AREE: AreaSlug[] = [
  "magazzino",
  "strumenti",
  "amministrazione",
  "produzione",
  "commerciale",
  "action",
  "area-fiscale",
  "promemorie-e-note",
];

async function requirePostoFoto(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, error: "Accesso richiesto." };
  if (
    isUnrestrictedSuperadmin(auth) ||
    (auth.impersonating &&
      isConfigStato(parseProfileStatoOperativo(auth.profile.stato_operativo)))
  ) {
    return { ok: true, userId: auth.userId };
  }
  if (!POSTO_FOTO_AREE.some((s) => userCanAccessArea(auth.areas, s))) {
    return { ok: false, error: "Permesso insufficiente per le foto del posto." };
  }
  return { ok: true, userId: auth.userId };
}

export async function listFotoPostoAction(ubicazioneId: string) {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false as const, error: gate.error };
  return queryFotoPosto(ubicazioneId);
}

export async function listFotoPrincipaliPostiAction(ubicazioneIds: string[]) {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false as const, error: gate.error };
  return queryFotoPrincipali(ubicazioneIds);
}

export async function aggiornaFitFotoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = aggiornaFitFotoSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Fit non valido." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("magazzino_posto_foto")
    .update({
      fit_scale: parsed.data.fitScale,
      offset_x: parsed.data.offsetX,
      offset_y: parsed.data.offsetY,
      updated_by: gate.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: parsed.data.id,
    action: "update_fit",
    actor_id: gate.userId,
    summary: `Ritaglio foto posto scala ${parsed.data.fitScale}`,
    payload: parsed.data,
  });
  return { success: true };
}

export async function impostaFotoPrincipaleAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_posto_foto")
    .select("id, ubicazione_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const row = data as { id: string; ubicazione_id: string } | null;
  if (!row) return { success: false, error: "Foto non trovata." };
  await supabase
    .from("magazzino_posto_foto")
    .update({ is_principale: false, updated_by: gate.userId })
    .eq("ubicazione_id", row.ubicazione_id)
    .is("deleted_at", null);
  const { error: upErr } = await supabase
    .from("magazzino_posto_foto")
    .update({ is_principale: true, updated_by: gate.userId })
    .eq("id", id);
  if (upErr) return { success: false, error: upErr.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: id,
    action: "set_principale",
    actor_id: gate.userId,
    summary: "Impostata foto principale del posto",
    payload: { ubicazione_id: row.ubicazione_id },
  });
  return { success: true };
}

export async function eliminaFotoPostoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_posto_foto")
    .select("id, ubicazione_id, is_principale")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const row = data as {
    id: string;
    ubicazione_id: string;
    is_principale: boolean;
  } | null;
  if (!row) return { success: false, error: "Foto non trovata." };
  const { error: delErr } = await supabase
    .from("magazzino_posto_foto")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: gate.userId,
      is_principale: false,
      updated_by: gate.userId,
    })
    .eq("id", id);
  if (delErr) return { success: false, error: delErr.message };
  if (row.is_principale) {
    const { data: next } = await supabase
      .from("magazzino_posto_foto")
      .select("id")
      .eq("ubicazione_id", row.ubicazione_id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const nid = (next as { id?: string } | null)?.id;
    if (nid) {
      await supabase
        .from("magazzino_posto_foto")
        .update({ is_principale: true, updated_by: gate.userId })
        .eq("id", nid);
    }
  }
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: id,
    action: "soft_delete",
    actor_id: gate.userId,
    summary: "Eliminata foto posto (soft delete)",
    payload: { ubicazione_id: row.ubicazione_id },
  });
  return { success: true };
}

export async function contaFotoPostoAction(
  ubicazioneId: string
): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("magazzino_posto_foto")
    .select("id", { count: "exact", head: true })
    .eq("ubicazione_id", ubicazioneId)
    .is("deleted_at", null);
  return count ?? 0;
}

export { POSTO_FOTO_MAX_PER_POSTO };
