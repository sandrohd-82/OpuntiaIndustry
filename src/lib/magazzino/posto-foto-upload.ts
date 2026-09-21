import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import { isTestImpersonation } from "@/lib/areas/guard";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import type { AreaSlug } from "@/types/database";
import {
  POSTO_FOTO_BUCKET,
  POSTO_FOTO_MAX_BYTES,
  POSTO_FOTO_MAX_PER_POSTO,
  POSTO_FOTO_SCALE_DEFAULT,
  mimeFotoAmmesso,
} from "@/lib/magazzino/posto-foto";
import { createServiceClient } from "@/lib/supabase/server";

function safeName(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return base || "foto.jpg";
}

export async function salvaFotoPosto(input: {
  ubicazioneId: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth) {
    return { success: false, error: "Accesso richiesto." };
  }
  const areeUpload: AreaSlug[] = [
    "magazzino",
    "strumenti",
    "amministrazione",
    "produzione",
    "commerciale",
  ];
  if (
    !isTestImpersonation(auth) &&
    !isUnrestrictedSuperadmin(auth) &&
    !areeUpload.some((s) => userCanAccessArea(auth.areas, s))
  ) {
    return { success: false, error: "Permesso insufficiente per caricare foto." };
  }
  if (!input.ubicazioneId) {
    return { success: false, error: "Posto mancante." };
  }
  const mime = (input.mime || "image/jpeg").toLowerCase();
  if (!mimeFotoAmmesso(mime)) {
    return { success: false, error: "Formato non ammesso: usa JPG, PNG o WebP." };
  }
  if (input.bytes.length > POSTO_FOTO_MAX_BYTES) {
    return { success: false, error: "Immagine oltre 15 MB." };
  }
  const db = createServiceClient();
  const { count } = await db
    .from("magazzino_posto_foto")
    .select("id", { count: "exact", head: true })
    .eq("ubicazione_id", input.ubicazioneId)
    .is("deleted_at", null);
  if ((count ?? 0) >= POSTO_FOTO_MAX_PER_POSTO) {
    return { success: false, error: `Massimo ${POSTO_FOTO_MAX_PER_POSTO} foto per posto.` };
  }
  const { data: esistenti } = await db
    .from("magazzino_posto_foto")
    .select("id, sort_order")
    .eq("ubicazione_id", input.ubicazioneId)
    .is("deleted_at", null);
  const rows = (esistenti ?? []) as Array<{ id: string; sort_order: number }>;
  const isPrincipale = rows.length === 0;
  const sortOrder =
    rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
  const id = randomUUID();
  const path = `${input.ubicazioneId}/${id}/${safeName(input.fileName)}`;
  const up = await db.storage.from(POSTO_FOTO_BUCKET).upload(path, input.bytes, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) {
    return { success: false, error: up.error.message };
  }
  const { error } = await db.from("magazzino_posto_foto").insert({
    id,
    ubicazione_id: input.ubicazioneId,
    storage_path: path,
    file_name: input.fileName.slice(0, 180),
    mime,
    is_principale: isPrincipale,
    sort_order: sortOrder,
    fit_scale: POSTO_FOTO_SCALE_DEFAULT,
    offset_x: 0,
    offset_y: 0,
    documento_stato: "approvato",
    versione: 1,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) {
    await db.storage.from(POSTO_FOTO_BUCKET).remove([path]);
    return { success: false, error: error.message };
  }
  await writeAuditLog({
    entity_type: "magazzino_posto_foto",
    entity_id: id,
    action: "create",
    actor_id: auth.userId,
    summary: `Caricata foto posto ${input.fileName}`,
    payload: {
      ubicazione_id: input.ubicazioneId,
      principale: isPrincipale,
      fit_scale: POSTO_FOTO_SCALE_DEFAULT,
    },
  });
  return { success: true, id };
}
