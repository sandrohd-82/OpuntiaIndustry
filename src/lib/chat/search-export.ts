import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { loadProfiles } from "@/lib/chat/queries";
import { listActiveTopics } from "@/lib/chat/topic-api";
import { chatDayKey, chatDayLabel } from "@/lib/chat/day-headers";

export const chatFilterSchema = z.object({
  query: z.string().max(500).default(""),
  dateFrom: z.string().max(32).optional().default(""),
  dateTo: z.string().max(32).optional().default(""),
  senderIds: z.array(z.string().uuid()).max(80).default([]),
  scope: z.enum(["open", "all"]).default("open"),
  openKind: z.enum(["direct", "topic"]).nullable().default(null),
  openId: z.string().uuid().nullable().default(null),
  includeText: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  includeAttachments: z.boolean().default(true),
  includeDayHeaders: z.boolean().default(true),
  includeSenderName: z.boolean().default(true),
});

export type ChatFilterInput = z.infer<typeof chatFilterSchema>;

export type ChatHitKind = "direct" | "topic";

export type ChatSearchHit = {
  id: string;
  kind: ChatHitKind;
  threadId: string;
  threadTitle: string;
  senderId: string;
  senderName: string;
  content: string;
  transcriptText: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileType: string | null;
  audioUrl: string | null;
  createdAt: string;
  href: string;
};

export type ChatParticipantOption = {
  id: string;
  name: string;
};

export type ChatPrintableAttachment = {
  messageId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  kind: "image" | "pdf" | "office" | "text";
  senderName: string;
  createdAt: string;
  threadTitle: string;
};

const PRINTABLE_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "rtf",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
]);

/** Classifica allegati stampabili (img/pdf/doc/…). */
export function classifyPrintableAttachment(
  fileName: string | null | undefined,
  fileType: string | null | undefined
): ChatPrintableAttachment["kind"] | null {
  const mime = (fileType ?? "").toLowerCase();
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("msword") ||
    mime.includes("officedocument.wordprocessing") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["doc", "docx", "xls", "xlsx", "rtf"].includes(ext)
  ) {
    return "office";
  }
  if (
    mime.startsWith("text/") ||
    ["txt", "csv"].includes(ext) ||
    PRINTABLE_EXT.has(ext)
  ) {
    if (["txt", "csv", "rtf"].includes(ext) || mime.startsWith("text/")) {
      return "text";
    }
  }
  if (PRINTABLE_EXT.has(ext)) {
    if (ext === "pdf") return "pdf";
    if (["doc", "docx", "xls", "xlsx"].includes(ext)) return "office";
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return "image";
    return "text";
  }
  return null;
}

export function isPrintableAttachment(
  fileName: string | null | undefined,
  fileType: string | null | undefined,
  fileUrl: string | null | undefined
): boolean {
  if (!fileUrl) return false;
  return classifyPrintableAttachment(fileName, fileType) !== null;
}

export function listPrintableAttachmentsFromHits(
  hits: ChatSearchHit[]
): ChatPrintableAttachment[] {
  const out: ChatPrintableAttachment[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (!h.fileUrl || !h.fileName) continue;
    const kind = classifyPrintableAttachment(h.fileName, h.fileType);
    if (!kind) continue;
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push({
      messageId: h.id,
      fileName: h.fileName,
      fileUrl: h.fileUrl,
      fileType: h.fileType ?? "",
      kind,
      senderName: h.senderName,
      createdAt: h.createdAt,
      threadTitle: h.threadTitle,
    });
  }
  return out.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function transcriptLabel(hit: ChatSearchHit): string {
  if (hit.audioUrl) return "[Tr. Nota vocale]";
  const ft = (hit.fileType ?? "").toLowerCase();
  if (ft.startsWith("video/")) return "[Tr. Video]";
  return "[Tr. Nota vocale]";
}

const RESULT_LIMIT = 400;

function dayBounds(from: string, to: string): { gte?: string; lte?: string } {
  const out: { gte?: string; lte?: string } = {};
  if (from.trim()) out.gte = `${from.trim()}T00:00:00.000`;
  if (to.trim()) out.lte = `${to.trim()}T23:59:59.999`;
  return out;
}

/** Estrae token @utente dalla query (es. "@Mario Rossi ciao" → ["Mario Rossi"]). */
export function extractAtMentions(query: string): string[] {
  const out: string[] = [];
  const re = /@([^\s@,;]+(?:\s+[^\s@,;]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const token = m[1]?.trim();
    if (token) out.push(token);
  }
  return out;
}

/** Testo libero senza i token @. */
export function stripAtMentions(query: string): string {
  return query.replace(/@[^\s@,;]+(?:\s+[^\s@,;]+)?/g, " ").replace(/\s+/g, " ").trim();
}

function matchesText(
  hit: {
    content: string;
    transcriptText: string | null;
    fileName: string | null;
  },
  needle: string,
  opts: Pick<
    ChatFilterInput,
    "includeText" | "includeTranscripts" | "includeAttachments"
  >
): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  if (opts.includeText && hit.content.toLowerCase().includes(n)) return true;
  if (
    opts.includeTranscripts &&
    hit.transcriptText &&
    hit.transcriptText.toLowerCase().includes(n)
  ) {
    return true;
  }
  if (
    opts.includeAttachments &&
    hit.fileName &&
    hit.fileName.toLowerCase().includes(n)
  ) {
    return true;
  }
  return false;
}

function resolveAtSenderIds(
  mentions: string[],
  participants: ChatParticipantOption[]
): string[] {
  if (mentions.length === 0) return [];
  const ids = new Set<string>();
  for (const mention of mentions) {
    const m = mention.toLowerCase();
    for (const p of participants) {
      if (p.name.toLowerCase().includes(m) || m.includes(p.name.toLowerCase())) {
        ids.add(p.id);
      }
    }
  }
  return [...ids];
}

export async function listChatFilterParticipants(
  supabase: SupabaseClient,
  userId: string,
  filter: Pick<ChatFilterInput, "scope" | "openKind" | "openId">
): Promise<ChatParticipantOption[]> {
  const ids = new Set<string>([userId]);

  if (filter.scope === "open" && filter.openId && filter.openKind === "direct") {
    const { data } = await supabase
      .from("conversations")
      .select("customer_id, producer_id")
      .eq("id", filter.openId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      ids.add(String((data as { customer_id: string }).customer_id));
      ids.add(String((data as { producer_id: string }).producer_id));
    }
  } else if (
    filter.scope === "open" &&
    filter.openId &&
    filter.openKind === "topic"
  ) {
    const { data } = await supabase
      .from("chat_topic_members")
      .select("user_id")
      .eq("topic_id", filter.openId)
      .is("deleted_at", null);
    for (const row of data ?? []) {
      ids.add(String((row as { user_id: string }).user_id));
    }
  } else {
    const { data: convs } = await supabase
      .from("conversations")
      .select("customer_id, producer_id")
      .is("deleted_at", null)
      .or(`customer_id.eq.${userId},producer_id.eq.${userId}`);
    for (const row of convs ?? []) {
      ids.add(String((row as { customer_id: string }).customer_id));
      ids.add(String((row as { producer_id: string }).producer_id));
    }
    const { data: members } = await supabase
      .from("chat_topic_members")
      .select("user_id")
      .eq("user_id", userId)
      .is("deleted_at", null);
    // Also load co-members of my topics
    const myTopics = await listActiveTopics(supabase);
    if (myTopics.length > 0) {
      const { data: allMembers } = await supabase
        .from("chat_topic_members")
        .select("user_id")
        .in(
          "topic_id",
          myTopics.map((t) => t.id)
        )
        .is("deleted_at", null);
      for (const row of allMembers ?? []) {
        ids.add(String((row as { user_id: string }).user_id));
      }
    }
    void members;
  }

  const profiles = await loadProfiles(supabase, [...ids]);
  return [...ids]
    .map((id) => {
      const p = profiles.get(id);
      const name =
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        p?.full_name?.trim() ||
        p?.email ||
        id.slice(0, 8);
      return { id, name };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

async function conversationTitles(
  supabase: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("conversations")
    .select("id, customer_id, producer_id")
    .in("id", ids)
    .is("deleted_at", null);
  const peerIds: string[] = [];
  const rows = (data ?? []) as {
    id: string;
    customer_id: string;
    producer_id: string;
  }[];
  for (const r of rows) {
    peerIds.push(r.customer_id === userId ? r.producer_id : r.customer_id);
  }
  const profiles = await loadProfiles(supabase, peerIds);
  for (const r of rows) {
    const peer = r.customer_id === userId ? r.producer_id : r.customer_id;
    const p = profiles.get(peer);
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      p?.full_name?.trim() ||
      p?.email ||
      "Chat diretta";
    map.set(r.id, name);
  }
  return map;
}

async function topicTitles(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("chat_topics")
    .select("id, titolo")
    .in("id", ids)
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const r = row as { id: string; titolo: string };
    map.set(r.id, r.titolo);
  }
  return map;
}

export async function searchChatMessages(
  supabase: SupabaseClient,
  userId: string,
  raw: unknown
): Promise<ChatSearchHit[]> {
  const parsed = chatFilterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Filtri non validi.");
  }
  const filter = parsed.data;

  if (filter.scope === "open" && (!filter.openId || !filter.openKind)) {
    throw new Error("Nessuna chat aperta: scegli «Tutte le chat» oppure apri un thread.");
  }

  const participants = await listChatFilterParticipants(supabase, userId, filter);
  const mentions = extractAtMentions(filter.query);
  const freeText = stripAtMentions(filter.query);
  const atIds = resolveAtSenderIds(mentions, participants);

  let senderFilter = [...filter.senderIds];
  if (atIds.length > 0) {
    if (senderFilter.length === 0) senderFilter = atIds;
    else senderFilter = senderFilter.filter((id) => atIds.includes(id));
  }

  const bounds = dayBounds(filter.dateFrom, filter.dateTo);
  const hits: ChatSearchHit[] = [];

  // --- Dirette ---
  let directIds: string[] = [];
  if (filter.scope === "open" && filter.openKind === "direct" && filter.openId) {
    directIds = [filter.openId];
  } else if (filter.scope === "all") {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .is("deleted_at", null)
      .or(`customer_id.eq.${userId},producer_id.eq.${userId}`);
    directIds = (data ?? []).map((r) => String((r as { id: string }).id));
  }

  if (directIds.length > 0) {
    let q = supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, content, created_at, audio_url, file_url, file_type, file_name, transcript_text, transcript_status"
      )
      .in("conversation_id", directIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
    if (bounds.gte) q = q.gte("created_at", bounds.gte);
    if (bounds.lte) q = q.lte("created_at", bounds.lte);
    if (senderFilter.length > 0) q = q.in("sender_id", senderFilter);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const titles = await conversationTitles(supabase, userId, directIds);
    const senderIds = [
      ...new Set((data ?? []).map((r) => String((r as { sender_id: string }).sender_id))),
    ];
    const profiles = await loadProfiles(supabase, senderIds);

    for (const row of data ?? []) {
      const r = row as {
        id: string;
        conversation_id: string;
        sender_id: string;
        content: string;
        created_at: string;
        audio_url: string | null;
        file_url: string | null;
        file_type: string | null;
        file_name: string | null;
        transcript_text: string | null;
        transcript_status: string | null;
      };
      const transcript =
        r.transcript_status === "done" && r.transcript_text
          ? r.transcript_text
          : null;
      const candidate = {
        content: r.content ?? "",
        transcriptText: transcript,
        fileName: r.file_name,
      };
      if (!matchesText(candidate, freeText, filter)) continue;
      if (!filter.includeText && !filter.includeTranscripts && !filter.includeAttachments) {
        continue;
      }
      if (
        freeText === "" &&
        !filter.includeText &&
        !(filter.includeTranscripts && transcript) &&
        !(filter.includeAttachments && r.file_name)
      ) {
        // still include if any content type enabled and message has it
      }
      const skipEmpty =
        !candidate.content &&
        !(filter.includeTranscripts && transcript) &&
        !(filter.includeAttachments && r.file_name) &&
        !r.audio_url;
      if (skipEmpty && !r.audio_url && !r.file_url) continue;

      const p = profiles.get(r.sender_id);
      const senderName =
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        p?.full_name?.trim() ||
        p?.email ||
        r.sender_id.slice(0, 8);

      hits.push({
        id: r.id,
        kind: "direct",
        threadId: r.conversation_id,
        threadTitle: titles.get(r.conversation_id) ?? "Chat diretta",
        senderId: r.sender_id,
        senderName,
        content: candidate.content,
        transcriptText: filter.includeTranscripts ? transcript : null,
        fileName: filter.includeAttachments ? r.file_name : null,
        fileUrl: filter.includeAttachments ? r.file_url : null,
        fileType: filter.includeAttachments ? r.file_type : null,
        audioUrl: r.audio_url,
        createdAt: r.created_at,
        href: `/app/chat/thread/${r.conversation_id}`,
      });
    }
  }

  // --- Argomenti ---
  let topicIds: string[] = [];
  if (filter.scope === "open" && filter.openKind === "topic" && filter.openId) {
    topicIds = [filter.openId];
  } else if (filter.scope === "all") {
    const topics = await listActiveTopics(supabase);
    topicIds = topics.map((t) => t.id);
  }

  if (topicIds.length > 0) {
    let q = supabase
      .from("chat_topic_messages")
      .select(
        "id, topic_id, sender_id, content, created_at, audio_url, file_url, file_type, file_name"
      )
      .in("topic_id", topicIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT);
    if (bounds.gte) q = q.gte("created_at", bounds.gte);
    if (bounds.lte) q = q.lte("created_at", bounds.lte);
    if (senderFilter.length > 0) q = q.in("sender_id", senderFilter);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const titles = await topicTitles(supabase, topicIds);
    const senderIds = [
      ...new Set((data ?? []).map((r) => String((r as { sender_id: string }).sender_id))),
    ];
    const profiles = await loadProfiles(supabase, senderIds);

    for (const row of data ?? []) {
      const r = row as {
        id: string;
        topic_id: string;
        sender_id: string;
        content: string;
        created_at: string;
        audio_url: string | null;
        file_url: string | null;
        file_type: string | null;
        file_name: string | null;
      };
      const candidate = {
        content: r.content ?? "",
        transcriptText: null as string | null,
        fileName: r.file_name,
      };
      if (!matchesText(candidate, freeText, {
        ...filter,
        includeTranscripts: false,
      })) {
        continue;
      }
      if (!candidate.content && !(filter.includeAttachments && r.file_name)) {
        continue;
      }

      const p = profiles.get(r.sender_id);
      const senderName =
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        p?.full_name?.trim() ||
        p?.email ||
        r.sender_id.slice(0, 8);

      hits.push({
        id: r.id,
        kind: "topic",
        threadId: r.topic_id,
        threadTitle: titles.get(r.topic_id) ?? "Argomento",
        senderId: r.sender_id,
        senderName,
        content: candidate.content,
        transcriptText: null,
        fileName: filter.includeAttachments ? r.file_name : null,
        fileUrl: filter.includeAttachments ? r.file_url : null,
        fileType: filter.includeAttachments ? r.file_type : null,
        audioUrl: r.audio_url,
        createdAt: r.created_at,
        href: `/app/chat/argomento/${r.topic_id}`,
      });
    }
  }

  hits.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return hits.slice(0, RESULT_LIMIT);
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 48);
}

async function fetchImageDataUrl(
  url: string
): Promise<{ dataUrl: string; format: "JPEG" | "PNG"; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 8 * 1024 * 1024) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("img failed"));
      img.src = dataUrl;
    });
    const mime = blob.type.toLowerCase();
    const format: "JPEG" | "PNG" =
      mime.includes("png") || dataUrl.startsWith("data:image/png")
        ? "PNG"
        : "JPEG";
    return { dataUrl, format, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

/**
 * Genera PDF chat (documento v1) e avvia il download.
 * Allegati stampabili selezionati: immagini incorporate; pdf/doc → pagina con link.
 */
export async function downloadChatPdf(
  hits: ChatSearchHit[],
  filter: ChatFilterInput,
  meta: {
    exportedBy: string;
    version?: string;
    selectedPrintableIds?: string[];
  }
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const selected = new Set(meta.selectedPrintableIds ?? []);
  const printables = listPrintableAttachmentsFromHits(hits).filter((a) =>
    selected.has(a.messageId)
  );

  const version = meta.version ?? "v1";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("OpuntiaIndustry — Export chat", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const stamp = new Date().toLocaleString("it-IT");
  const lines = [
    `Documento ${version} · Generato: ${stamp}`,
    `Esportato da: ${meta.exportedBy}`,
    `Ambito: ${filter.scope === "open" ? "Chat aperta" : "Tutte le chat"}`,
    filter.dateFrom || filter.dateTo
      ? `Periodo: ${filter.dateFrom || "…"} → ${filter.dateTo || "…"}`
      : "Periodo: tutti",
    `Messaggi: ${hits.length}`,
    `Allegati stampabili inclusi: ${printables.length}`,
  ];
  for (const line of lines) {
    ensureSpace(14);
    doc.text(line, margin, y);
    y += 12;
  }
  y += 8;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setTextColor(20);

  const ordered = [...hits].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let lastDay = "";
  let printableIndex = 0;
  const printablePageRef = new Map<string, number>();

  for (const hit of ordered) {
    const day = chatDayKey(hit.createdAt);
    if (filter.includeDayHeaders && day && day !== lastDay) {
      lastDay = day;
      ensureSpace(28);
      doc.setFont("times", "italic");
      doc.setFontSize(10);
      doc.setTextColor(120);
      const label = chatDayLabel(hit.createdAt);
      const tw = doc.getTextWidth(label);
      doc.text(label, margin + (maxW - tw) / 2, y);
      y += 16;
      doc.setTextColor(20);
    }

    const time = new Date(hit.createdAt).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const headerParts = [
      `[${hit.kind === "direct" ? "1:1" : "Arg."}] ${hit.threadTitle}`,
      filter.includeSenderName ? hit.senderName : null,
      time,
    ].filter(Boolean);
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(headerParts.join(" · "), margin, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const bodyParts: string[] = [];
    if (filter.includeText && hit.content.trim()) {
      bodyParts.push(hit.content.trim());
    }
    if (filter.includeTranscripts && hit.transcriptText?.trim()) {
      bodyParts.push(
        `${transcriptLabel(hit)} ${hit.transcriptText.trim()}`
      );
    }
    if (hit.audioUrl && !hit.transcriptText && filter.includeTranscripts) {
      bodyParts.push("[Nota vocale senza trascrizione]");
    }

    if (filter.includeAttachments && hit.fileName && hit.fileUrl) {
      const printable = isPrintableAttachment(
        hit.fileName,
        hit.fileType,
        hit.fileUrl
      );
      if (printable && selected.has(hit.id)) {
        printableIndex += 1;
        printablePageRef.set(hit.id, printableIndex);
        bodyParts.push(
          `[Allegato stampabile #${printableIndex}] ${hit.fileName}`
        );
      } else if (!printable) {
        bodyParts.push(`[Allegato] ${hit.fileName}`);
      } else {
        bodyParts.push(`[Allegato escluso] ${hit.fileName}`);
      }
    } else if (filter.includeAttachments && hit.fileName) {
      bodyParts.push(`[Allegato] ${hit.fileName}`);
    }

    const body = bodyParts.join("\n") || "(vuoto)";
    const wrapped = doc.splitTextToSize(body, maxW) as string[];
    for (const line of wrapped) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 12;
    }
    y += 8;
  }

  // Append printable attachment pages
  for (const att of printables) {
    doc.addPage();
    y = margin;
    const n = printablePageRef.get(att.messageId) ?? 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Allegato stampabile #${n}`, margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`File: ${att.fileName}`, margin, y);
    y += 14;
    doc.text(`Tipo: ${att.kind} · ${att.fileType || "n/d"}`, margin, y);
    y += 14;
    doc.text(`Da: ${att.senderName} · Chat: ${att.threadTitle}`, margin, y);
    y += 14;
    doc.setTextColor(30, 80, 160);
    doc.textWithLink("Apri allegato originale", margin, y, { url: att.fileUrl });
    doc.setTextColor(20);
    y += 24;

    if (att.kind === "image") {
      const img = await fetchImageDataUrl(att.fileUrl);
      if (img) {
        const maxImgH = pageH - y - margin;
        let drawW = maxW;
        let drawH = (img.h / img.w) * drawW;
        if (drawH > maxImgH) {
          drawH = maxImgH;
          drawW = (img.w / img.h) * drawH;
        }
        try {
          doc.addImage(
            img.dataUrl,
            img.format,
            margin,
            y,
            drawW,
            drawH
          );
        } catch {
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text("(Anteprima immagine non incorporabile)", margin, y);
          doc.setTextColor(20);
        }
      } else {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("(Impossibile caricare l’immagine)", margin, y);
        doc.setTextColor(20);
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(80);
      const note =
        att.kind === "pdf"
          ? "Documento PDF: apri il link sopra per visualizzare il contenuto completo."
          : att.kind === "office"
            ? "Documento Office: apri il link sopra (non incorporabile direttamente nel PDF)."
            : "File di testo: apri il link sopra per il contenuto completo.";
      const wrap = doc.splitTextToSize(note, maxW) as string[];
      for (const line of wrap) {
        doc.text(line, margin, y);
        y += 12;
      }
      doc.setTextColor(20);
    }
  }

  const scopeName =
    filter.scope === "open" && filter.openId
      ? filter.openKind === "topic"
        ? `argomento_${filter.openId.slice(0, 8)}`
        : `diretta_${filter.openId.slice(0, 8)}`
      : "tutte";
  doc.save(
    `chat_export_${safeFilenamePart(scopeName)}_${safeFilenamePart(stamp)}.pdf`
  );
}
