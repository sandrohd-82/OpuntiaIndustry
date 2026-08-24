"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  allegatoKindFromMime,
  createRicercaSchema,
  isPrintableAllegatoKind,
  mapRicerca,
  parseMentionIds,
  type RsAllegato,
  type RsChatLink,
  type RsLink,
  type RsMention,
  type RsReport,
  type RsRicerca,
  type RsTipo,
} from "@/lib/ricerca-sviluppo/types";
import { createClient } from "@/lib/supabase/server";

async function guard() {
  return requireAreaAccess("ricerca-sviluppo");
}

export async function listRicercheAction(input: {
  /** Se omesso: entrambe le tipologie (archivio scientifico unificato). */
  tipo?: RsTipo | null;
  archivio: boolean;
}): Promise<
  { success: true; items: RsRicerca[] } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  let q = supabase
    .from("rs_ricerche")
    .select(
      "id, tipo, titolo, descrizione, stato, versione, approved_at, approved_by, created_at, updated_at, created_by"
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (input.tipo) {
    q = q.eq("tipo", input.tipo);
  }

  if (input.archivio) {
    q = q.eq("stato", "archiviato");
  } else {
    q = q.neq("stato", "archiviato");
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) =>
      mapRicerca(r as Parameters<typeof mapRicerca>[0])
    ),
  };
}

export async function createRicercaAction(input: {
  tipo: RsTipo;
  titolo: string;
  descrizione?: string;
}): Promise<
  { success: true; item: RsRicerca } | { success: false; error: string }
> {
  const { auth } = await guard();
  const parsed = createRicercaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rs_ricerche")
    .insert({
      tipo: parsed.data.tipo,
      titolo: parsed.data.titolo,
      descrizione: parsed.data.descrizione ?? "",
      stato: "in_corso",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, tipo, titolo, descrizione, stato, versione, approved_at, approved_by, created_at, updated_at, created_by"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item = mapRicerca(data as Parameters<typeof mapRicerca>[0]);
  await writeAuditLog({
    entity_type: "rs_ricerche",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Nuova ricerca R&S: ${item.titolo}`,
    payload: { tipo: item.tipo, stato: item.stato },
  });
  return { success: true, item };
}

export async function getRicercaAction(
  id: string
): Promise<
  { success: true; item: RsRicerca } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rs_ricerche")
    .select(
      "id, tipo, titolo, descrizione, stato, versione, approved_at, approved_by, created_at, updated_at, created_by"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Ricerca non trovata" };
  return {
    success: true,
    item: mapRicerca(data as Parameters<typeof mapRicerca>[0]),
  };
}

export async function archiveRicercaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rs_ricerche")
    .update({
      stato: "archiviato",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "rs_ricerche",
    entity_id: id,
    action: "archive",
    actor_id: auth.userId,
    summary: "Ricerca R&S archiviata",
    payload: {},
  });
  return { success: true };
}

export async function softDeleteRicercaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rs_ricerche")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "rs_ricerche",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Ricerca R&S soft-delete",
    payload: {},
  });
  return { success: true };
}

async function loadReportChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportIds: string[]
): Promise<{
  mentions: Map<string, RsMention[]>;
  chatLinks: Map<string, RsChatLink[]>;
  links: Map<string, RsLink[]>;
  allegati: Map<string, RsAllegato[]>;
}> {
  const mentions = new Map<string, RsMention[]>();
  const chatLinks = new Map<string, RsChatLink[]>();
  const links = new Map<string, RsLink[]>();
  const allegati = new Map<string, RsAllegato[]>();
  if (reportIds.length === 0) {
    return { mentions, chatLinks, links, allegati };
  }

  const [mRes, cRes, lRes, aRes] = await Promise.all([
    supabase
      .from("rs_report_mentions")
      .select("id, report_id, user_id")
      .in("report_id", reportIds)
      .is("deleted_at", null),
    supabase
      .from("rs_report_chat_links")
      .select("id, report_id, link_kind, link_id, label")
      .in("report_id", reportIds)
      .is("deleted_at", null),
    supabase
      .from("rs_report_links")
      .select("id, report_id, kind, url, label, place_text")
      .in("report_id", reportIds)
      .is("deleted_at", null),
    supabase
      .from("rs_report_allegati")
      .select(
        "id, report_id, storage_path, file_name, mime_type, kind, size_bytes, include_in_print, created_at"
      )
      .in("report_id", reportIds)
      .is("deleted_at", null),
  ]);

  for (const row of mRes.data ?? []) {
    const r = row as { id: string; report_id: string; user_id: string };
    const list = mentions.get(r.report_id) ?? [];
    list.push({ id: r.id, userId: r.user_id });
    mentions.set(r.report_id, list);
  }
  for (const row of cRes.data ?? []) {
    const r = row as {
      id: string;
      report_id: string;
      link_kind: "conversation" | "topic";
      link_id: string;
      label: string;
    };
    const list = chatLinks.get(r.report_id) ?? [];
    list.push({
      id: r.id,
      linkKind: r.link_kind,
      linkId: r.link_id,
      label: r.label,
    });
    chatLinks.set(r.report_id, list);
  }
  for (const row of lRes.data ?? []) {
    const r = row as {
      id: string;
      report_id: string;
      kind: "url" | "maps";
      url: string;
      label: string;
      place_text: string;
    };
    const list = links.get(r.report_id) ?? [];
    list.push({
      id: r.id,
      kind: r.kind,
      url: r.url,
      label: r.label,
      placeText: r.place_text,
    });
    links.set(r.report_id, list);
  }
  for (const row of aRes.data ?? []) {
    const r = row as {
      id: string;
      report_id: string;
      storage_path: string;
      file_name: string;
      mime_type: string;
      kind: RsAllegato["kind"];
      size_bytes: number;
      include_in_print: boolean;
      created_at: string;
    };
    const list = allegati.get(r.report_id) ?? [];
    list.push({
      id: r.id,
      reportId: r.report_id,
      storagePath: r.storage_path,
      fileName: r.file_name,
      mimeType: r.mime_type,
      kind: r.kind,
      sizeBytes: Number(r.size_bytes) || 0,
      includeInPrint: Boolean(r.include_in_print),
      createdAt: r.created_at,
    });
    allegati.set(r.report_id, list);
  }

  return { mentions, chatLinks, links, allegati };
}

export async function listReportsAction(input: {
  ricercaId: string;
  from?: string | null;
  to?: string | null;
}): Promise<
  { success: true; items: RsReport[] } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  let q = supabase
    .from("rs_report_giornalieri")
    .select(
      "id, ricerca_id, report_date, body_text, stato, versione, created_at, updated_at, created_by"
    )
    .eq("ricerca_id", input.ricercaId)
    .is("deleted_at", null)
    .order("report_date", { ascending: false });

  if (input.from) q = q.gte("report_date", input.from);
  if (input.to) q = q.lte("report_date", input.to);

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = data ?? [];
  const ids = rows.map((r) => (r as { id: string }).id);
  const children = await loadReportChildren(supabase, ids);

  const items: RsReport[] = rows.map((raw) => {
    const r = raw as {
      id: string;
      ricerca_id: string;
      report_date: string;
      body_text: string;
      stato: RsReport["stato"];
      versione: number;
      created_at: string;
      updated_at: string;
      created_by: string | null;
    };
    return {
      id: r.id,
      ricercaId: r.ricerca_id,
      reportDate: r.report_date,
      bodyText: r.body_text ?? "",
      stato: r.stato,
      versione: r.versione,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by,
      mentions: children.mentions.get(r.id) ?? [],
      chatLinks: children.chatLinks.get(r.id) ?? [],
      links: children.links.get(r.id) ?? [],
      allegati: children.allegati.get(r.id) ?? [],
    };
  });

  return { success: true, items };
}

export async function upsertReportAction(input: {
  ricercaId: string;
  reportDate: string;
  bodyText: string;
  mentionUserIds?: string[];
  peers?: { id: string; name: string }[];
  chatLinks?: Array<{
    linkKind: "conversation" | "topic";
    linkId: string;
    label: string;
  }>;
  links?: Array<{
    kind: "url" | "maps";
    url: string;
    label: string;
    placeText?: string;
  }>;
}): Promise<
  { success: true; item: RsReport } | { success: false; error: string }
> {
  const { auth } = await guard();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
    return { success: false, error: "Data non valida" };
  }
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("rs_report_giornalieri")
    .select("id, versione")
    .eq("ricerca_id", input.ricercaId)
    .eq("report_date", input.reportDate)
    .is("deleted_at", null)
    .maybeSingle();

  let reportId: string;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("rs_report_giornalieri")
      .update({
        body_text: input.bodyText,
        versione: (existing.versione ?? 1) + 1,
        updated_by: auth.userId,
      })
      .eq("id", existing.id)
      .select(
        "id, ricerca_id, report_date, body_text, stato, versione, created_at, updated_at, created_by"
      )
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito" };
    }
    reportId = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("rs_report_giornalieri")
      .insert({
        ricerca_id: input.ricercaId,
        report_date: input.reportDate,
        body_text: input.bodyText,
        stato: "bozza",
        versione: 1,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select(
        "id, ricerca_id, report_date, body_text, stato, versione, created_at, updated_at, created_by"
      )
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Creazione fallita" };
    }
    reportId = data.id as string;
  }

  const mentionIds = new Set<string>([
    ...(input.mentionUserIds ?? []),
    ...parseMentionIds(input.bodyText, input.peers ?? []),
  ]);

  // Soft-replace mentions
  await supabase
    .from("rs_report_mentions")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
    })
    .eq("report_id", reportId)
    .is("deleted_at", null);

  if (mentionIds.size > 0) {
    await supabase.from("rs_report_mentions").insert(
      [...mentionIds].map((user_id) => ({
        report_id: reportId,
        user_id,
        created_by: auth.userId,
      }))
    );
  }

  if (input.chatLinks && input.chatLinks.length > 0) {
    await supabase.from("rs_report_chat_links").insert(
      input.chatLinks.map((l) => ({
        report_id: reportId,
        link_kind: l.linkKind,
        link_id: l.linkId,
        label: l.label.slice(0, 200),
        created_by: auth.userId,
      }))
    );
  }

  if (input.links && input.links.length > 0) {
    await supabase.from("rs_report_links").insert(
      input.links
        .filter((l) => l.url.trim() || l.placeText?.trim())
        .map((l) => ({
          report_id: reportId,
          kind: l.kind,
          url: l.url.trim(),
          label: l.label.slice(0, 200),
          place_text: (l.placeText ?? "").slice(0, 500),
          created_by: auth.userId,
        }))
    );
  }

  await writeAuditLog({
    entity_type: "rs_report_giornalieri",
    entity_id: reportId,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Report R&S ${input.reportDate}`,
    payload: { ricerca_id: input.ricercaId },
  });

  const listed = await listReportsAction({
    ricercaId: input.ricercaId,
    from: input.reportDate,
    to: input.reportDate,
  });
  if (!listed.success || !listed.items[0]) {
    return { success: false, error: "Report salvato ma non ricaricabile" };
  }
  return { success: true, item: listed.items[0] };
}

export async function uploadReportAllegatoAction(input: {
  reportId: string;
  fileName: string;
  mimeType: string;
  base64: string;
  includeInPrint?: boolean;
}): Promise<
  { success: true; allegato: RsAllegato } | { success: false; error: string }
> {
  const { auth } = await guard();
  const supabase = await createClient();
  const kind = allegatoKindFromMime(input.mimeType, input.fileName);
  const buf = Buffer.from(input.base64, "base64");
  if (buf.length > 50 * 1024 * 1024) {
    return { success: false, error: "File troppo grande (max 50MB)" };
  }
  const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${input.reportId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("rs-allegati")
    .upload(path, buf, {
      contentType: input.mimeType || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { success: false, error: upErr.message };

  const include =
    input.includeInPrint ?? isPrintableAllegatoKind(kind);

  const { data, error } = await supabase
    .from("rs_report_allegati")
    .insert({
      report_id: input.reportId,
      storage_path: path,
      file_name: input.fileName.slice(0, 255),
      mime_type: input.mimeType || "application/octet-stream",
      kind,
      size_bytes: buf.length,
      include_in_print: kind === "video" || kind === "audio" ? false : include,
      created_by: auth.userId,
    })
    .select(
      "id, report_id, storage_path, file_name, mime_type, kind, size_bytes, include_in_print, created_at"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Metadati allegato falliti" };
  }

  const row = data as {
    id: string;
    report_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string;
    kind: RsAllegato["kind"];
    size_bytes: number;
    include_in_print: boolean;
    created_at: string;
  };

  await writeAuditLog({
    entity_type: "rs_report_allegati",
    entity_id: row.id,
    action: "upload",
    actor_id: auth.userId,
    summary: `Allegato R&S: ${row.file_name}`,
    payload: { kind: row.kind, report_id: input.reportId },
  });

  return {
    success: true,
    allegato: {
      id: row.id,
      reportId: row.report_id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      kind: row.kind,
      sizeBytes: Number(row.size_bytes) || 0,
      includeInPrint: Boolean(row.include_in_print),
      createdAt: row.created_at,
    },
  };
}

export async function setAllegatoIncludeInPrintAction(input: {
  allegatoId: string;
  includeInPrint: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("rs_report_allegati")
    .select("kind")
    .eq("id", input.allegatoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Allegato non trovato" };
  const kind = (row as { kind: string }).kind;
  if (kind === "video" || kind === "audio") {
    return {
      success: false,
      error: "Video e audio non sono includibili in stampa",
    };
  }
  const { error } = await supabase
    .from("rs_report_allegati")
    .update({ include_in_print: input.includeInPrint })
    .eq("id", input.allegatoId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "rs_report_allegati",
    entity_id: input.allegatoId,
    action: "toggle_print",
    actor_id: auth.userId,
    summary: `include_in_print=${input.includeInPrint}`,
    payload: {},
  });
  return { success: true };
}

export async function getAllegatoSignedUrlAction(
  storagePath: string
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("rs-allegati")
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? "URL non disponibile" };
  }
  return { success: true, url: data.signedUrl };
}

export async function listChatLinkOptionsAction(): Promise<
  | {
      success: true;
      topics: { id: string; label: string }[];
      conversations: { id: string; label: string }[];
    }
  | { success: false; error: string }
> {
  const { auth } = await guard();
  const supabase = await createClient();
  const [topics, convs] = await Promise.all([
    supabase
      .from("chat_topics")
      .select("id, titolo")
      .is("deleted_at", null)
      .eq("stato", "attivo")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("conversations")
      .select("id, customer_id, producer_id")
      .is("deleted_at", null)
      .or(`customer_id.eq.${auth.userId},producer_id.eq.${auth.userId}`)
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  return {
    success: true,
    topics: (topics.data ?? []).map((t) => {
      const r = t as { id: string; titolo: string };
      return { id: r.id, label: r.titolo };
    }),
    conversations: (convs.data ?? []).map((c) => {
      const r = c as { id: string };
      return { id: r.id, label: `Chat ${r.id.slice(0, 8)}…` };
    }),
  };
}
