"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  POSTO_FOTO_BUCKET,
  POSTO_FOTO_MAX_PER_POSTO,
  POSTO_FOTO_SCALE_DEFAULT,
  aggiornaFitFotoSchema,
  type PostoFoto,
  type PostoFotoPrincipale,
} from "@/lib/magazzino/posto-foto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
  const db = createServiceClient();
  const { data } = await db.storage
    .from(POSTO_FOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}

export async function listFotoPostoAction(
  ubicazioneId: string
): Promise<
  { success: true; foto: PostoFoto[] } | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  if (!ubicazioneId) return { success: true, foto: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_posto_foto")
    .select(FOTO_SELECT)
    .eq("ubicazione_id", ubicazioneId)
    .is("deleted_at", null)
    .order("is_principale", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as FotoRow[];
  const urls = await signedUrls(rows.map((r) => r.storage_path));
  return {
    success: true,
    foto: rows.map((r) => mapFoto(r, urls.get(r.storage_path) ?? "")),
  };
}

export async function listFotoPrincipaliPostiAction(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, PostoFotoPrincipale> }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, PostoFotoPrincipale> = {};
  if (!ids.length) return { success: true, perPosto };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_posto_foto")
    .select(FOTO_SELECT)
    .in("ubicazione_id", ids)
    .eq("is_principale", true)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
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
}

export async function aggiornaFitFotoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["magazzino", "amministrazione"]);
  const parsed = aggiornaFitFotoSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Fit non valido." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("magazzino_posto_foto")
    .update({
      fit_scale: parsed.data.fitScale,
      offset_x: parsed.data.offsetX,
      offset_y: parsed.data.offsetY,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: parsed.data.id,
    action: "update_fit",
    actor_id: auth.userId,
    summary: `Ritaglio foto posto scala ${parsed.data.fitScale}`,
    payload: parsed.data,
  });
  return { success: true };
}

export async function impostaFotoPrincipaleAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["magazzino", "amministrazione"]);
  const supabase = await createClient();
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
    .update({ is_principale: false, updated_by: auth.userId })
    .eq("ubicazione_id", row.ubicazione_id)
    .is("deleted_at", null);
  const { error: upErr } = await supabase
    .from("magazzino_posto_foto")
    .update({ is_principale: true, updated_by: auth.userId })
    .eq("id", id);
  if (upErr) return { success: false, error: upErr.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: id,
    action: "set_principale",
    actor_id: auth.userId,
    summary: "Impostata foto principale del posto",
    payload: { ubicazione_id: row.ubicazione_id },
  });
  return { success: true };
}

export async function eliminaFotoPostoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["magazzino", "amministrazione"]);
  const supabase = await createClient();
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
      deleted_by: auth.userId,
      is_principale: false,
      updated_by: auth.userId,
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
        .update({ is_principale: true, updated_by: auth.userId })
        .eq("id", nid);
    }
  }
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Eliminata foto posto (soft delete)",
    payload: { ubicazione_id: row.ubicazione_id },
  });
  return { success: true };
}

export async function contaFotoPostoAction(
  ubicazioneId: string
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("magazzino_posto_foto")
    .select("id", { count: "exact", head: true })
    .eq("ubicazione_id", ubicazioneId)
    .is("deleted_at", null);
  return count ?? 0;
}

export { POSTO_FOTO_MAX_PER_POSTO };
