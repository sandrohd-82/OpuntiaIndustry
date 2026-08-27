"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const addMembersSchema = z.object({
  topicId: z.string().uuid(),
  members: z
    .array(
      z.object({
        userId: z.string().uuid(),
        /** true = vede tutta la cronologia; false = solo da ingresso */
        seeHistory: z.boolean(),
        displayName: z.string().trim().max(200).optional(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Aggiunge membri a un argomento con scelta storia per utente (ISO 9001 audit).
 */
export async function addChatTopicMembersAction(
  raw: unknown
): Promise<
  | { success: true; added: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  const parsed = addMembersSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati invito non validi." };
  }

  const supabase = await createClient();
  const ids = parsed.data.members.map((m) => m.userId);
  const seeHistory = parsed.data.members.map((m) => m.seeHistory);

  const { data, error } = await supabase.rpc("add_chat_topic_members", {
    p_topic_id: parsed.data.topicId,
    p_member_ids: ids,
    p_see_history: seeHistory,
  });

  if (error) {
    if (error.message.includes("not_participant")) {
      return {
        success: false,
        error: "Non sei un partecipante di questo argomento.",
      };
    }
    if (
      error.message.includes("add_chat_topic_members") ||
      error.code === "PGRST202"
    ) {
      return {
        success: false,
        error:
          "Migrazione non applicata: esegui 20260827140000_chat_topic_history_visible_from.sql.",
      };
    }
    return { success: false, error: error.message };
  }

  const added = Number(data ?? 0);

  await writeAuditLog({
    entity_type: "chat_topic_members",
    entity_id: parsed.data.topicId,
    action: "invite",
    actor_id: auth.userId,
    summary: `Invito ${added} membro/i all’argomento`,
    payload: {
      topicId: parsed.data.topicId,
      members: parsed.data.members.map((m) => ({
        userId: m.userId,
        seeHistory: m.seeHistory,
        displayName: m.displayName ?? null,
      })),
      added,
    },
  });

  return { success: true, added };
}

/** Conta messaggi non cancellati (per decidere se chiedere la storia). */
export async function countTopicMessagesAction(
  topicId: string
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  await requireAreaAccess("chat");
  const idParsed = z.string().uuid().safeParse(topicId);
  if (!idParsed.success) {
    return { success: false, error: "Argomento non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_topic_message_count", {
    p_topic_id: idParsed.data,
  });
  if (error) {
    // Fallback se RPC non ancora applicata
    const fallback = await supabase
      .from("chat_topic_messages")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", idParsed.data)
      .is("deleted_at", null);
    if (fallback.error) return { success: false, error: fallback.error.message };
    return { success: true, count: fallback.count ?? 0 };
  }
  return { success: true, count: Number(data ?? 0) };
}

/** Id utenti già membri attivi. */
export async function listTopicMemberIdsAction(
  topicId: string
): Promise<
  | { success: true; memberIds: string[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("chat");
  const idParsed = z.string().uuid().safeParse(topicId);
  if (!idParsed.success) {
    return { success: false, error: "Argomento non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_topic_members")
    .select("user_id")
    .eq("topic_id", idParsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    memberIds: ((data ?? []) as Array<{ user_id: string }>).map(
      (r) => r.user_id
    ),
  };
}

export type TopicMemberListItem = {
  userId: string;
  name: string;
  email: string;
  ruolo: string;
};

/** Membri attivi con nome (per gestione / rimozione). */
export async function listTopicMembersAction(
  topicId: string
): Promise<
  | { success: true; members: TopicMemberListItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("chat");
  const idParsed = z.string().uuid().safeParse(topicId);
  if (!idParsed.success) {
    return { success: false, error: "Argomento non valido." };
  }
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("chat_topic_members")
    .select("user_id, ruolo")
    .eq("topic_id", idParsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const memberRows = (rows ?? []) as Array<{ user_id: string; ruolo: string }>;
  const ids = memberRows.map((r) => r.user_id);
  if (ids.length === 0) return { success: true, members: [] };

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, first_name, last_name")
    .in("id", ids);
  if (pErr) return { success: false, error: pErr.message };

  const byId = new Map(
    ((profiles ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>).map((p) => [p.id, p])
  );

  return {
    success: true,
    members: memberRows.map((r) => {
      const p = byId.get(r.user_id);
      const name =
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        p?.full_name?.trim() ||
        p?.email ||
        "Utente";
      return {
        userId: r.user_id,
        name,
        email: p?.email ?? "",
        ruolo: r.ruolo || "member",
      };
    }),
  };
}

const removeMemberSchema = z.object({
  topicId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * Soft-remove membro: perde accesso all’argomento (ISO 9001 audit).
 */
export async function removeChatTopicMemberAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("chat");
  const parsed = removeMemberSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati rimozione non validi." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_chat_topic_member", {
    p_topic_id: parsed.data.topicId,
    p_user_id: parsed.data.userId,
  });

  if (error) {
    if (error.message.includes("not_participant")) {
      return {
        success: false,
        error: "Non sei un partecipante di questo argomento.",
      };
    }
    if (
      error.message.includes("remove_chat_topic_member") ||
      error.code === "PGRST202"
    ) {
      return {
        success: false,
        error:
          "Migrazione non applicata: esegui 20260827170000_chat_topic_remove_member.sql.",
      };
    }
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "Membro non trovato o già rimosso." };
  }

  await writeAuditLog({
    entity_type: "chat_topic_members",
    entity_id: parsed.data.topicId,
    action: "remove",
    actor_id: auth.userId,
    summary:
      parsed.data.userId === auth.userId
        ? "Uscita dall’argomento"
        : "Rimozione membro dall’argomento",
    payload: {
      topicId: parsed.data.topicId,
      removedUserId: parsed.data.userId,
      self: parsed.data.userId === auth.userId,
    },
  });

  return { success: true };
}
