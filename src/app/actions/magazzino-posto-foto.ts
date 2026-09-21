"use server";

import { writeAuditLog } from "@/lib/audit";
import { isTestImpersonation } from "@/lib/areas/guard";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  POSTO_FOTO_BUCKET,
  POSTO_FOTO_MAX_PER_POSTO,
  POSTO_FOTO_SCALE_DEFAULT,
  aggiornaFitFotoSchema,
  type PostoFoto,
  type PostoFotoPrincipale,
} from "@/lib/magazzino/posto-foto";
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
  if (isTestImpersonation(auth) || isUnrestrictedSuperadmin(auth)) {
    return { ok: true, userId: auth.userId };
  }
  if (!POSTO_FOTO_AREE.some((s) => userCanAccessArea(auth.areas, s))) {
    return { ok: false, error: "Permesso insufficiente per le foto del posto." };
  }
  return { ok: true, userId: auth.userId };
}

function tableAssente(message: string): boolean {
  return /schema cache|does not exist|PGRST205|42P01/i.test(message);
}

const FOTO_SELECT =
  "id, ubicazione_id, storage_path, file_name, mime, is_principale, sort_order, fit_scale, offset_x, offset_y";

type FotoRow = {
  id: string;
  ubicazione_id: string;
  storage_path: string;
  file_name: string;
  mime: string;
  is_principale: boolean;
  sort_order: number;
  fit_scale: number | string;
  offset_x: number | string;
  offset_y: number | string;
};

function mapFoto(row: FotoRow, url: string): PostoFoto {
  return {
    id: row.id,
    ubicazioneId: row.ubicazione_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mime: row.mime,
    isPrincipale: row.is_principale,
    sortOrder: row.sort_order,
    fitScale: Number(row.fit_scale) || POSTO_FOTO_SCALE_DEFAULT,
    offsetX: Number(row.offset_x) || 0,
    offsetY: Number(row.offset_y) || 0,
    url,
  };
}

async function signedUrls(
  paths: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  try {
    const db = createServiceClient();
    const { data } = await db.storage
      .from(POSTO_FOTO_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
    }
  } catch (e) {
    console.error(
      "[posto-foto] signedUrls",
      e instanceof Error ? e.message : e
    );
  }
  return out;
}

export async function listFotoPostoAction(
  ubicazioneId: string
): Promise<
  { success: true; foto: PostoFoto[] } | { success: false; error: string }
> {
  try {
    const gate = await requirePostoFoto();
    if (!gate.ok) return { success: false, error: gate.error };
    if (!ubicazioneId) return { success: true, foto: [] };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("magazzino_posto_foto")
      .select(FOTO_SELECT)
      .eq("ubicazione_id", ubicazioneId)
      .is("deleted_at", null)
      .order("is_principale", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) {
      if (tableAssente(error.message)) return { success: true, foto: [] };
      return { success: false, error: error.message };
    }
    const rows = (data ?? []) as FotoRow[];
    const urls = await signedUrls(rows.map((r) => r.storage_path));
    return {
      success: true,
      foto: rows.map((r) => mapFoto(r, urls.get(r.storage_path) ?? "")),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Elenco foto non disponibile.",
    };
  }
}

export async function listFotoPrincipaliPostiAction(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, PostoFotoPrincipale> }
  | { success: false; error: string }
> {
  try {
  const gate = await requirePostoFoto();
  if (!gate.ok) return { success: false, error: gate.error };
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, PostoFotoPrincipale> = {};
  if (!ids.length) return { success: true, perPosto };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_posto_foto")
    .select(FOTO_SELECT)
    .in("ubicazione_id", ids)
    .eq("is_principale", true)
    .is("deleted_at", null);
  if (error) {
    if (tableAssente(error.message)) return { success: true, perPosto };
    return { success: false, error: error.message };
  }
  const rows = (data ?? []) as FotoRow[];
  const urls = await signedUrls(rows.map((r) => r.storage_path));
  for (const r of rows) {
    const url = urls.get(r.storage_path) ?? "";
    if (!url) continue;
    perPosto[r.ubicazione_id] = {
      ubicazioneId: r.ubicazione_id,
      url,
      fitScale: Number(r.fit_scale) || POSTO_FOTO_SCALE_DEFAULT,
      offsetX: Number(r.offset_x) || 0,
      offsetY: Number(r.offset_y) || 0,
    };
  }
  return { success: true, perPosto };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Elenco foto non disponibile.",
    };
  }
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
