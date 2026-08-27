"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import {
  classifyTopicAttachment,
  countsToSortedList,
  type TopicAttachmentKind,
} from "@/lib/chat/topic-info";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type TopicInfoMember = {
  userId: string;
  name: string;
  email: string;
  ruolo: "owner" | "member";
  joinedAt: string;
  /** Messaggi inviati (testo, vocale, allegato = 1). */
  numMess: number;
  attachments: Array<{ kind: TopicAttachmentKind; label: string; count: number }>;
};

export type TopicInfoView = {
  topicId: string;
  titolo: string;
  createdAt: string;
  createdById: string | null;
  createdByName: string;
  members: TopicInfoMember[];
};

function displayName(row: {
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const n =
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.full_name?.trim();
  return n || row.email || "Utente";
}

/**
 * Info generale argomento: metadati + NumMess e breakdown allegati per membro.
 * Rispetta RLS (history_visible_from) sui messaggi.
 */
export async function getChatTopicInfoAction(
  topicId: string
): Promise<
  | { success: true; info: TopicInfoView }
  | { success: false; error: string }
> {
  await requireAreaAccess("chat");
  const idParsed = z.string().uuid().safeParse(topicId);
  if (!idParsed.success) {
    return { success: false, error: "Argomento non valido." };
  }

  const supabase = await createClient();

  const { data: topic, error: topicErr } = await supabase
    .from("chat_topics")
    .select("id, titolo, created_at, created_by")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (topicErr || !topic) {
    return {
      success: false,
      error: topicErr?.message ?? "Argomento non trovato o non autorizzato.",
    };
  }

  const { data: memberRows, error: memErr } = await supabase
    .from("chat_topic_members")
    .select("user_id, ruolo, created_at")
    .eq("topic_id", idParsed.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  const members = (memberRows ?? []) as Array<{
    user_id: string;
    ruolo: "owner" | "member";
    created_at: string;
  }>;
  const memberIds = members.map((m) => m.user_id);
  const createdById = (topic as { created_by: string | null }).created_by;
  const profileIds = [...new Set([...memberIds, createdById].filter(Boolean))] as string[];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, first_name, last_name")
    .in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileMap = new Map<
    string,
    {
      id: string;
      email: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }
  >();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>) {
    profileMap.set(p.id, p);
  }

  let { data: messages, error: msgErr } = await supabase
    .from("chat_topic_messages")
    .select(
      "sender_id, message_kind, file_type, file_name, file_url, audio_url, payload"
    )
    .eq("topic_id", idParsed.data)
    .is("deleted_at", null);

  if (
    msgErr &&
    (msgErr.message.includes("message_kind") ||
      msgErr.message.includes("payload"))
  ) {
    const legacy = await supabase
      .from("chat_topic_messages")
      .select("sender_id, file_type, file_name, file_url, audio_url")
      .eq("topic_id", idParsed.data)
      .is("deleted_at", null);
    messages = legacy.data;
    msgErr = legacy.error;
  }

  if (msgErr) {
    return { success: false, error: msgErr.message };
  }

  const numMess = new Map<string, number>();
  const attach = new Map<string, Map<TopicAttachmentKind, number>>();

  for (const raw of messages ?? []) {
    const row = raw as {
      sender_id: string;
      message_kind?: string | null;
      file_type?: string | null;
      file_name?: string | null;
      file_url?: string | null;
      audio_url?: string | null;
      payload?: Record<string, unknown> | null;
    };
    numMess.set(row.sender_id, (numMess.get(row.sender_id) ?? 0) + 1);
    const kind = classifyTopicAttachment(row);
    if (!kind) continue;
    let bucket = attach.get(row.sender_id);
    if (!bucket) {
      bucket = new Map();
      attach.set(row.sender_id, bucket);
    }
    bucket.set(kind, (bucket.get(kind) ?? 0) + 1);
  }

  const createdByName = createdById
    ? displayName(profileMap.get(createdById) ?? { email: null })
    : "—";

  const infoMembers: TopicInfoMember[] = members.map((m) => {
    const p = profileMap.get(m.user_id);
    return {
      userId: m.user_id,
      name: displayName(p ?? { email: null }),
      email: p?.email ?? "",
      ruolo: m.ruolo,
      joinedAt: m.created_at,
      numMess: numMess.get(m.user_id) ?? 0,
      attachments: countsToSortedList(attach.get(m.user_id) ?? new Map()),
    };
  });

  // Ordina: più messaggi prima, poi nome
  infoMembers.sort(
    (a, b) => b.numMess - a.numMess || a.name.localeCompare(b.name, "it")
  );

  return {
    success: true,
    info: {
      topicId: String((topic as { id: string }).id),
      titolo: String((topic as { titolo: string }).titolo),
      createdAt: String((topic as { created_at: string }).created_at),
      createdById,
      createdByName,
      members: infoMembers,
    },
  };
}
