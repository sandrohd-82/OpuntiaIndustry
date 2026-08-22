"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { MagazzinoCatalogKind } from "@/lib/magazzino/types";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const MAGAZZINO_FOTO_BUCKET = "magazzino-prodotti";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const metaSchema = z.object({
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  prodottoId: z.string().uuid(),
});

function catalogTable(
  kind: MagazzinoCatalogKind
): "materie_prime" | "catalogo_prodotti_fornitore" {
  return kind === "materia_prima"
    ? "materie_prime"
    : "catalogo_prodotti_fornitore";
}

function kindFolder(kind: MagazzinoCatalogKind): string {
  return kind === "materia_prima" ? "mp" : "pr";
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function getMagazzinoFotoUrlAction(raw: unknown): Promise<
  | { success: true; url: string | null; fotoPath: string | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const { catalogKind, prodottoId } = parsed.data;
  const supabase = await createClient();
  const table = catalogTable(catalogKind);

  const { data, error } = await supabase
    .from(table)
    .select("foto_path")
    .eq("id", prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };

  const path = (data as { foto_path: string | null } | null)?.foto_path?.trim();
  if (!path) {
    return { success: true, url: null, fotoPath: null };
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(MAGAZZINO_FOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (sErr) return { success: false, error: sErr.message };
  return { success: true, url: signed?.signedUrl ?? null, fotoPath: path };
}

export async function uploadMagazzinoFotoAction(
  formData: FormData
): Promise<
  | { success: true; fotoPath: string; url: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const catalogKind = String(formData.get("catalogKind") ?? "");
  const prodottoId = String(formData.get("prodottoId") ?? "");
  const parsed = metaSchema.safeParse({ catalogKind, prodottoId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size <= 0) {
    return { success: false, error: "Seleziona un’immagine." };
  }
  if (!ALLOWED.has(file.type)) {
    return {
      success: false,
      error: "Formato non supportato (usa JPEG, PNG o WebP).",
    };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: "La foto non può superare 5 MB." };
  }

  const supabase = await createClient();
  const table = catalogTable(parsed.data.catalogKind);

  const { data: row, error: rErr } = await supabase
    .from(table)
    .select("id, codice, foto_path")
    .eq("id", parsed.data.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rErr) return { success: false, error: rErr.message };
  if (!row) return { success: false, error: "Articolo non trovato." };

  const articolo = row as {
    id: string;
    codice: string;
    foto_path: string | null;
  };
  const oldPath = articolo.foto_path?.trim() || null;
  const ext = extFromMime(file.type);
  const path = `${kindFolder(parsed.data.catalogKind)}/${articolo.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(MAGAZZINO_FOTO_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) return { success: false, error: upErr.message };

  const now = new Date().toISOString();
  const { error: dbErr } = await supabase
    .from(table)
    .update({
      foto_path: path,
      foto_updated_at: now,
      foto_updated_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", articolo.id)
    .is("deleted_at", null);
  if (dbErr) {
    await supabase.storage.from(MAGAZZINO_FOTO_BUCKET).remove([path]);
    return { success: false, error: dbErr.message };
  }

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(MAGAZZINO_FOTO_BUCKET).remove([oldPath]);
  }

  const { data: signed } = await supabase.storage
    .from(MAGAZZINO_FOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);

  void writeAuditLog({
    entity_type: table,
    entity_id: articolo.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Foto magazzino ${articolo.codice}`,
    payload: { fotoPath: path, previousPath: oldPath },
  });

  return {
    success: true,
    fotoPath: path,
    url: signed?.signedUrl ?? "",
  };
}

export async function removeMagazzinoFotoAction(raw: unknown): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const table = catalogTable(parsed.data.catalogKind);

  const { data: row, error: rErr } = await supabase
    .from(table)
    .select("id, codice, foto_path")
    .eq("id", parsed.data.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rErr) return { success: false, error: rErr.message };
  if (!row) return { success: false, error: "Articolo non trovato." };

  const articolo = row as {
    id: string;
    codice: string;
    foto_path: string | null;
  };
  const oldPath = articolo.foto_path?.trim() || null;

  const { error: dbErr } = await supabase
    .from(table)
    .update({
      foto_path: null,
      foto_updated_at: new Date().toISOString(),
      foto_updated_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", articolo.id)
    .is("deleted_at", null);
  if (dbErr) return { success: false, error: dbErr.message };

  if (oldPath) {
    await supabase.storage.from(MAGAZZINO_FOTO_BUCKET).remove([oldPath]);
  }

  void writeAuditLog({
    entity_type: table,
    entity_id: articolo.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Rimossa foto magazzino ${articolo.codice}`,
    payload: { previousPath: oldPath },
  });

  return { success: true };
}
