import type { Attachment } from "mailparser";
import {
  normalizeAttachmentMime,
  normalizeContentId,
  WEBMAIL_ALLEGATI_BUCKET,
} from "@/lib/webmail/html-render";
import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 40;

function safeFilename(name: string | undefined, fallback: string): string {
  const base = (name || fallback).replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return base || fallback;
}

/**
 * Soft-delete allegati esistenti e carica quelli del parser IMAP su storage + DB.
 */
export async function persistMessaggioAttachments(input: {
  supabase: Service;
  messaggioId: string;
  accountId: string;
  attachments: Attachment[] | undefined;
  userId?: string | null;
}): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  const { supabase, messaggioId, accountId } = input;

  await supabase
    .from("webmail_messaggi_allegati")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: input.userId ?? null,
      updated_by: input.userId ?? null,
    })
    .eq("messaggio_id", messaggioId)
    .is("deleted_at", null);

  const list = (input.attachments ?? []).slice(0, MAX_ATTACHMENTS);
  let saved = 0;

  for (let i = 0; i < list.length; i++) {
    const att = list[i]!;
    const buf = att.content;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) continue;
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      errors.push(`${att.filename || "file"} troppo grande`);
      continue;
    }

    const contentId = normalizeContentId(att.contentId);
    const disposition = String(att.contentDisposition || "").toLowerCase();
    const isInline =
      Boolean(contentId) ||
      disposition === "inline" ||
      disposition.includes("inline");

    const filename = safeFilename(
      att.filename || undefined,
      contentId ? `cid-${contentId.slice(0, 40)}` : `part-${i + 1}`
    );
    const mime = normalizeAttachmentMime(att.contentType);
    const path = `${accountId}/${messaggioId}/${Date.now()}-${i}-${filename}`;

    const { error: upErr } = await supabase.storage
      .from(WEBMAIL_ALLEGATI_BUCKET)
      .upload(path, buf, {
        contentType: mime,
        upsert: false,
      });
    if (upErr) {
      // Retry con octet-stream se il bucket rifiuta il MIME
      const { error: up2 } = await supabase.storage
        .from(WEBMAIL_ALLEGATI_BUCKET)
        .upload(path, buf, {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (up2) {
        errors.push(upErr.message);
        continue;
      }
    }

    const { error: insErr } = await supabase
      .from("webmail_messaggi_allegati")
      .insert({
        messaggio_id: messaggioId,
        filename,
        mime_type: mime,
        size_bytes: buf.length,
        content_id: contentId,
        is_inline: isInline,
        storage_bucket: WEBMAIL_ALLEGATI_BUCKET,
        storage_path: path,
        created_by: input.userId ?? null,
        updated_by: input.userId ?? null,
      });
    if (insErr) {
      errors.push(insErr.message);
      await supabase.storage.from(WEBMAIL_ALLEGATI_BUCKET).remove([path]);
      continue;
    }
    saved += 1;
  }

  return { saved, errors };
}
