import {
  POSTO_FOTO_BUCKET,
  POSTO_FOTO_SCALE_DEFAULT,
  isUbicazioneUuid,
  type PostoFoto,
  type PostoFotoPrincipale,
} from "@/lib/magazzino/posto-foto";
import { createServiceClient } from "@/lib/supabase/server";

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

function tableAssente(message: string): boolean {
  return /schema cache|does not exist|PGRST205|42P01/i.test(message);
}

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

function dbFoto() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function signedUrls(
  db: ReturnType<typeof createServiceClient>,
  paths: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  try {
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

export async function queryFotoPosto(
  ubicazioneId: string
): Promise<
  { success: true; foto: PostoFoto[] } | { success: false; error: string }
> {
  if (!ubicazioneId || !isUbicazioneUuid(ubicazioneId)) {
    return { success: true, foto: [] };
  }
  const db = dbFoto();
  if (!db) {
    return { success: false, error: "Configurazione storage foto mancante." };
  }
  const { data, error } = await db
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
  const urls = await signedUrls(
    db,
    rows.map((r) => r.storage_path)
  );
  return {
    success: true,
    foto: rows.map((r) => mapFoto(r, urls.get(r.storage_path) ?? "")),
  };
}

export async function queryFotoPrincipali(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, PostoFotoPrincipale> }
  | { success: false; error: string }
> {
  const ids = [...new Set(ubicazioneIds.filter(isUbicazioneUuid))];
  const perPosto: Record<string, PostoFotoPrincipale> = {};
  if (!ids.length) return { success: true, perPosto };
  const db = dbFoto();
  if (!db) {
    return { success: false, error: "Configurazione storage foto mancante." };
  }
  const { data, error } = await db
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
  const urls = await signedUrls(
    db,
    rows.map((r) => r.storage_path)
  );
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
