import { createServiceClient } from "@/lib/supabase/server";

export const WIKI_DOCS_BUCKET = "wikiopuntia-docs";

export function wikiPublicUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/${WIKI_DOCS_BUCKET}/${storagePath}`;
}

export async function uploadWikiPdfPublic(input: {
  bytes: Buffer;
  storagePath: string;
  contentType?: string;
}): Promise<{ publicUrl: string; storagePath: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(WIKI_DOCS_BUCKET)
    .upload(input.storagePath, input.bytes, {
      contentType: input.contentType || "application/pdf",
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return {
    storagePath: input.storagePath,
    publicUrl: wikiPublicUrl(input.storagePath),
  };
}

export function sanitizeStorageSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
