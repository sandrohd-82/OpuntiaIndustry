"use server";

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  legacyRemotePdfUrl,
  legacyResearchRoot,
  listLegacyWikiPapers,
  type LegacyWikiPaper,
} from "@/lib/wikiopuntia/legacy-catalog";
import {
  sanitizeStorageSegment,
  uploadWikiPdfPublic,
} from "@/lib/wikiopuntia/storage";

export type LegacySyncBatchResult = {
  success: true;
  total: number;
  offset: number;
  nextOffset: number;
  done: boolean;
  imported: number;
  updated: number;
  skipped: number;
  pdfOk: number;
  errors: string[];
};

async function resolvePdfBytes(
  paper: LegacyWikiPaper
): Promise<{ bytes: Buffer; source: "disk" | "remote" } | null> {
  const local = path.join(legacyResearchRoot(), paper.path, paper.file);
  try {
    await access(local);
    return { bytes: await readFile(local), source: "disk" };
  } catch {
    /* prova URL storico */
  }
  try {
    const res = await fetch(legacyRemotePdfUrl(paper), {
      redirect: "follow",
      headers: { Accept: "application/pdf,*/*" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    return { bytes: buf, source: "remote" };
  } catch {
    return null;
  }
}

export async function syncLegacyWikiArchiveAction(input: {
  offset?: number;
  limit?: number;
}): Promise<LegacySyncBatchResult | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("wikiopuntia");
  const papers = listLegacyWikiPapers();
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(8, Math.max(1, input.limit ?? 4));
  const slice = papers.slice(offset, offset + limit);
  const supabase = await createClient();

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let pdfOk = 0;
  const errors: string[] = [];

  for (const paper of slice) {
    try {
      const { data: existing } = await supabase
        .from("wiki_scientific_research")
        .select("id, public_url, versione")
        .eq("legacy_id", paper.legacyId)
        .is("deleted_at", null)
        .maybeSingle();

      const pdf = await resolvePdfBytes(paper);
      let publicUrl = "";
      let storagePath = "";
      if (pdf) {
        const dest = `legacy/${paper.legacyId}/${sanitizeStorageSegment(paper.file)}`;
        const uploaded = await uploadWikiPdfPublic({
          bytes: pdf.bytes,
          storagePath: dest,
        });
        publicUrl = uploaded.publicUrl;
        storagePath = uploaded.storagePath;
        pdfOk += 1;
      }

      const publishedAt = new Date(
        Date.UTC(paper.publishedYear, paper.publishedMonth - 1, 1)
      ).toISOString();

      const payload = {
        legacy_id: paper.legacyId,
        title: paper.title,
        abstract: paper.abstract,
        slug: paper.slug,
        plant_parts: paper.plantParts,
        sectors: paper.sectors,
        is_most_searched: paper.isMostSearched,
        is_evidence: paper.isEvidence,
        published_year: paper.publishedYear,
        published_month: paper.publishedMonth,
        published_at: publishedAt,
        external_link: paper.link,
        category: paper.category,
        legacy_path: paper.path,
        legacy_file: paper.file,
        public_url: publicUrl || existing?.public_url || "",
        storage_path: storagePath || null,
        pdf_available: Boolean(publicUrl || existing?.public_url),
        is_public: !paper.closed,
        status: paper.closed ? ("draft" as const) : ("published" as const),
        published_at_portal: paper.closed ? null : new Date().toISOString(),
        published_by: paper.closed ? null : auth.userId,
        approved_at: paper.closed ? null : new Date().toISOString(),
        approved_by: paper.closed ? null : auth.userId,
        ingest_status: "pending" as const,
        updated_by: auth.userId,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("wiki_scientific_research")
          .update({
            ...payload,
            versione: Number(existing.versione ?? 1) + 1,
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        updated += 1;
        await writeAuditLog({
          entity_type: "wiki_scientific_research",
          entity_id: existing.id,
          action: "update",
          actor_id: auth.userId,
          summary: `Sync archivio legacy #${paper.legacyId}`,
          payload: {
            slug: paper.slug,
            pdf: Boolean(publicUrl),
            is_public: !paper.closed,
            plant_parts: paper.plantParts,
            sectors: paper.sectors,
          },
        });
      } else {
        const { data, error } = await supabase
          .from("wiki_scientific_research")
          .insert({
            ...payload,
            versione: 1,
            created_by: auth.userId,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Insert fallito");
        imported += 1;
        await writeAuditLog({
          entity_type: "wiki_scientific_research",
          entity_id: data.id,
          action: "create",
          actor_id: auth.userId,
          summary: `Import archivio legacy #${paper.legacyId} — ${paper.title.slice(0, 80)}`,
          payload: {
            slug: paper.slug,
            pdf: Boolean(publicUrl),
            is_public: !paper.closed,
            plant_parts: paper.plantParts,
            sectors: paper.sectors,
          },
        });
      }
    } catch (err) {
      skipped += 1;
      errors.push(
        `#${paper.legacyId} ${paper.file}: ${err instanceof Error ? err.message : "errore"}`
      );
    }
  }

  const nextOffset = offset + slice.length;
  return {
    success: true,
    total: papers.length,
    offset,
    nextOffset,
    done: nextOffset >= papers.length,
    imported,
    updated,
    skipped,
    pdfOk,
    errors,
  };
}
