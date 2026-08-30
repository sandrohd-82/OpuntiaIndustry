"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  createWikiResearchSchema,
  mapWikiResearch,
  type WikiResearch,
} from "@/lib/ecosystem/wiki";
import { createClient } from "@/lib/supabase/server";
import type {
  PortaleRichiestaStato,
  WikiDocumentRequestRow,
  WikiResearchStatus,
  WikiScientificResearchRow,
} from "@/types/database";

async function guardWiki() {
  return requireAreaAccess("wikiopuntia");
}

async function getAuthContextForPortaleLeads() {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) return { auth: null };
  const ok =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "wikiopuntia");
  if (!ok) return { auth: null };
  return { auth };
}

export async function listWikiResearchAction(input: {
  archivio: boolean;
}): Promise<
  { success: true; items: WikiResearch[] } | { success: false; error: string }
> {
  await guardWiki();
  const supabase = await createClient();
  let q = supabase
    .from("wiki_scientific_research")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (input.archivio) {
    q = q.eq("status", "archived");
  } else {
    q = q.neq("status", "archived");
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as WikiScientificResearchRow[];
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: chunks } = await supabase
      .from("wiki_document_chunks")
      .select("research_id")
      .in("research_id", ids);
    for (const c of chunks ?? []) {
      const id = (c as { research_id: string | null }).research_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return {
    success: true,
    items: rows.map((r) => mapWikiResearch(r, counts.get(r.id) ?? 0)),
  };
}

export async function createWikiResearchAction(input: unknown): Promise<
  { success: true; item: WikiResearch } | { success: false; error: string }
> {
  const { auth } = await guardWiki();
  const parsed = createWikiResearchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const now = new Date();
  const publishedAt = new Date(
    Date.UTC(parsed.data.publishedYear, parsed.data.publishedMonth - 1, 1)
  ).toISOString();
  const isPublic = parsed.data.isPublic;
  const sendToWiki = Boolean(parsed.data.sendToWiki);
  const status = sendToWiki ? "published" : "draft";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wiki_scientific_research")
    .insert({
      title: parsed.data.title,
      abstract: parsed.data.abstract,
      slug: parsed.data.slug,
      plant_parts: parsed.data.plantParts,
      sectors: parsed.data.sectors,
      is_public: isPublic,
      is_most_searched: parsed.data.isMostSearched,
      is_evidence: parsed.data.isEvidence,
      published_year: parsed.data.publishedYear,
      published_month: parsed.data.publishedMonth,
      published_at: publishedAt,
      external_link: parsed.data.externalLink,
      authors: parsed.data.authors,
      keywords: parsed.data.keywords,
      category: parsed.data.category,
      ai_summary: parsed.data.aiSummary,
      public_url: parsed.data.publicUrl,
      storage_path: parsed.data.storagePath || null,
      pdf_available: Boolean(parsed.data.publicUrl || parsed.data.storagePath),
      status,
      published_at_portal: sendToWiki ? now.toISOString() : null,
      published_by: sendToWiki ? auth.userId : null,
      approved_at: sendToWiki ? now.toISOString() : null,
      approved_by: sendToWiki ? auth.userId : null,
      ingest_status: "pending",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }

  const row = data as WikiScientificResearchRow;
  await writeAuditLog({
    entity_type: "wiki_scientific_research",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata ricerca Wiki ${row.slug} (PDF ${isPublic ? "pubblico" : "con login"}${sendToWiki ? ", inviata a WikiOpuntia" : ""})`,
    payload: {
      slug: row.slug,
      title: row.title,
      is_public: isPublic,
      send_to_wiki: sendToWiki,
      plant_parts: parsed.data.plantParts,
      sectors: parsed.data.sectors,
    },
  });

  return { success: true, item: mapWikiResearch(row, 0) };
}

export async function setWikiResearchStatusAction(input: {
  id: string;
  status: WikiResearchStatus;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardWiki();
  if (!["draft", "published", "archived"].includes(input.status)) {
    return { success: false, error: "Stato non valido" };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("wiki_scientific_research")
    .select("id, status, versione, slug")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !current) {
    return { success: false, error: readError?.message ?? "Record non trovato" };
  }

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_by: auth.userId,
    versione: Number(current.versione ?? 1) + 1,
  };
  if (input.status === "published") {
    patch.published_at_portal = new Date().toISOString();
    patch.published_by = auth.userId;
    patch.approved_at = new Date().toISOString();
    patch.approved_by = auth.userId;
  }

  const { error } = await supabase
    .from("wiki_scientific_research")
    .update(patch)
    .eq("id", input.id);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "wiki_scientific_research",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary:
      input.status === "published"
        ? `Wiki ${current.slug}: inviata a WikiOpuntia`
        : `Wiki ${current.slug}: ${current.status} → ${input.status}`,
    payload: { from: current.status, to: input.status },
  });

  return { success: true };
}

/** Accesso PDF: pubblica = download libero; non pubblica = login + richiesta + email. */
export async function setWikiResearchDownloadAccessAction(input: {
  id: string;
  isPublic: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardWiki();
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("wiki_scientific_research")
    .select("id, versione, slug, is_public")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !current) {
    return { success: false, error: readError?.message ?? "Record non trovato" };
  }

  const { error } = await supabase
    .from("wiki_scientific_research")
    .update({
      is_public: input.isPublic,
      updated_by: auth.userId,
      versione: Number(current.versione ?? 1) + 1,
    })
    .eq("id", input.id);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "wiki_scientific_research",
    entity_id: input.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Wiki ${current.slug}: PDF ${input.isPublic ? "pubblico (download libero)" : "non pubblico (richiesta + email)"}`,
    payload: { is_public: input.isPublic },
  });

  return { success: true };
}

export type WikiDocumentRequestItem = WikiDocumentRequestRow & {
  research_title?: string;
  research_slug?: string;
};

export async function listWikiDocumentRequestsAction(): Promise<
  | { success: true; items: WikiDocumentRequestItem[] }
  | { success: false; error: string }
> {
  await guardWiki();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wiki_document_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as WikiDocumentRequestRow[];
  const researchIds = [...new Set(rows.map((r) => r.research_id))];
  const titles = new Map<string, { title: string; slug: string }>();
  if (researchIds.length) {
    const { data: papers } = await supabase
      .from("wiki_scientific_research")
      .select("id, title, slug")
      .in("id", researchIds);
    for (const p of papers ?? []) {
      const row = p as { id: string; title: string; slug: string };
      titles.set(row.id, { title: row.title, slug: row.slug });
    }
  }

  return {
    success: true,
    items: rows.map((r) => ({
      ...r,
      research_title: titles.get(r.research_id)?.title,
      research_slug: titles.get(r.research_id)?.slug,
    })),
  };
}

export async function markWikiDocumentRequestNotifiedAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardWiki();
  const supabase = await createClient();
  const { error } = await supabase
    .from("wiki_document_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "wiki_document_requests",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: "Richiesta PDF Wiki segnata come notificata",
  });
  return { success: true };
}

export async function listPortaleRichiesteAction(input?: {
  origine?: "opuntiaitalia" | "wikiopuntia";
}): Promise<
  | { success: true; items: import("@/types/database").PortaleRichiestaContattoRow[] }
  | { success: false; error: string }
> {
  const { auth } = await getAuthContextForPortaleLeads();
  if (!auth) return { success: false, error: "Permesso negato" };
  const supabase = await createClient();
  let q = supabase
    .from("portale_richieste_contatto")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (input?.origine) {
    q = q.eq("origine", input.origine);
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []) as import("@/types/database").PortaleRichiestaContattoRow[],
  };
}

export async function setPortaleRichiestaStatoAction(input: {
  id: string;
  stato: PortaleRichiestaStato;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await getAuthContextForPortaleLeads();
  if (!auth) return { success: false, error: "Permesso negato" };
  if (!["nuova", "presa_in_carico", "chiusa"].includes(input.stato)) {
    return { success: false, error: "Stato non valido" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("portale_richieste_contatto")
    .update({ stato: input.stato, updated_by: auth.userId })
    .eq("id", input.id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "portale_richieste_contatto",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Lead portale → ${input.stato}`,
  });
  return { success: true };
}

export async function listPortaleNewsletterAction(): Promise<
  | {
      success: true;
      items: import("@/types/database").PortaleNewsletterIscrittoRow[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portale_newsletter_iscritti")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []) as import("@/types/database").PortaleNewsletterIscrittoRow[],
  };
}
