"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { pollCreateSchema } from "@/lib/chat/share";
import {
  TOPIC_MESSAGE_SELECT,
  mapTopicMessage,
  type TopicMessage,
} from "@/lib/chat/topics";
import { MESSAGE_SELECT, mapMessage, type ChatMessage } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const voteSchema = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export type ChatPollCreatedMessage = ChatMessage | TopicMessage;

/**
 * Crea sondaggio + messaggio chat (1:1 o argomento; 1 voto a testa).
 */
export async function createChatPollAction(
  raw: unknown
): Promise<
  | { success: true; message: ChatPollCreatedMessage; pollId: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  const parsed = pollCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati sondaggio non validi." };
  }

  const supabase = await createClient();
  const options = parsed.data.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 1) {
    return { success: false, error: "Serve almeno una risposta." };
  }

  const topicId = parsed.data.topicId;
  const conversationId = parsed.data.conversationId;

  if (topicId) {
    const { data: msg, error: msgErr } = await supabase
      .from("chat_topic_messages")
      .insert({
        topic_id: topicId,
        sender_id: auth.userId,
        content: parsed.data.titolo,
        status: "sent",
        is_read: false,
        message_kind: "poll",
        payload: {},
      })
      .select(TOPIC_MESSAGE_SELECT)
      .single();

    if (msgErr || !msg) {
      return {
        success: false,
        error: msgErr?.message ?? "Messaggio non creato.",
      };
    }

    const messageId = String((msg as { id: string }).id);

    const { data: poll, error: pollErr } = await supabase
      .from("chat_polls")
      .insert({
        message_id: messageId,
        topic_id: topicId,
        titolo: parsed.data.titolo,
        stato: "aperto",
        versione: 1,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();

    if (pollErr || !poll) {
      await supabase
        .from("chat_topic_messages")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: auth.userId,
        })
        .eq("id", messageId);
      return {
        success: false,
        error: pollErr?.message ?? "Sondaggio non creato.",
      };
    }

    const pollId = String((poll as { id: string }).id);
    const { error: optErr } = await supabase.from("chat_poll_options").insert(
      options.map((label, i) => ({
        poll_id: pollId,
        label,
        sort_order: i,
        created_by: auth.userId,
      }))
    );
    if (optErr) {
      return { success: false, error: optErr.message };
    }

    await supabase
      .from("chat_topic_messages")
      .update({ payload: { pollId } })
      .eq("id", messageId);

    await writeAuditLog({
      entity_type: "chat_polls",
      entity_id: pollId,
      action: "create",
      actor_id: auth.userId,
      summary: `Sondaggio argomento: ${parsed.data.titolo}`,
      payload: { options: options.length, topicId },
    });

    const mapped = mapTopicMessage({
      ...(msg as Parameters<typeof mapTopicMessage>[0]),
      payload: { pollId },
      message_kind: "poll",
    });

    return { success: true, message: mapped, pollId };
  }

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: auth.userId,
      content: parsed.data.titolo,
      status: "sent",
      is_read: false,
      message_kind: "poll",
      payload: {},
    })
    .select(MESSAGE_SELECT)
    .single();

  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non creato." };
  }

  const messageId = String((msg as { id: string }).id);

  const { data: poll, error: pollErr } = await supabase
    .from("chat_polls")
    .insert({
      message_id: messageId,
      conversation_id: conversationId,
      titolo: parsed.data.titolo,
      stato: "aperto",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();

  if (pollErr || !poll) {
    await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId })
      .eq("id", messageId);
    return { success: false, error: pollErr?.message ?? "Sondaggio non creato." };
  }

  const pollId = String((poll as { id: string }).id);
  const { error: optErr } = await supabase.from("chat_poll_options").insert(
    options.map((label, i) => ({
      poll_id: pollId,
      label,
      sort_order: i,
      created_by: auth.userId,
    }))
  );
  if (optErr) {
    return { success: false, error: optErr.message };
  }

  await supabase
    .from("messages")
    .update({ payload: { pollId } })
    .eq("id", messageId);

  await writeAuditLog({
    entity_type: "chat_polls",
    entity_id: pollId,
    action: "create",
    actor_id: auth.userId,
    summary: `Sondaggio chat: ${parsed.data.titolo}`,
    payload: { options: options.length, conversationId },
  });

  const mapped = mapMessage({
    ...(msg as Parameters<typeof mapMessage>[0]),
    payload: { pollId },
    message_kind: "poll",
  });

  return { success: true, message: mapped, pollId };
}

export async function voteChatPollAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("chat");
  const parsed = voteSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Voto non valido." };

  const supabase = await createClient();
  const { error } = await supabase.from("chat_poll_votes").insert({
    poll_id: parsed.data.pollId,
    option_id: parsed.data.optionId,
    user_id: auth.userId,
    created_by: auth.userId,
  });
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Hai già votato questo sondaggio." };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

export type ChatPollView = {
  id: string;
  titolo: string;
  stato: "aperto" | "chiuso";
  options: Array<{ id: string; label: string; votes: number }>;
  totalVotes: number;
  participantCount: number;
  myOptionId: string | null;
};

export async function getChatPollViewAction(
  pollId: string
): Promise<
  | { success: true; poll: ChatPollView }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  const supabase = await createClient();

  const { data: poll, error } = await supabase
    .from("chat_polls")
    .select("id, titolo, stato, conversation_id, topic_id")
    .eq("id", pollId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !poll) {
    return { success: false, error: error?.message ?? "Sondaggio non trovato." };
  }

  const conversationId = (poll as { conversation_id: string | null })
    .conversation_id;
  const topicId = (poll as { topic_id: string | null }).topic_id;

  const { data: options } = await supabase
    .from("chat_poll_options")
    .select("id, label, sort_order")
    .eq("poll_id", pollId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const { data: votes } = await supabase
    .from("chat_poll_votes")
    .select("option_id, user_id")
    .eq("poll_id", pollId)
    .is("deleted_at", null);

  const voteRows = (votes ?? []) as Array<{ option_id: string; user_id: string }>;
  const counts = new Map<string, number>();
  let myOptionId: string | null = null;
  for (const v of voteRows) {
    counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
    if (v.user_id === auth.userId) myOptionId = v.option_id;
  }

  let participantCount = 2;
  if (topicId) {
    const { count } = await supabase
      .from("chat_topic_members")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topicId)
      .is("deleted_at", null);
    participantCount = Math.max(count ?? 1, 1);
  } else if (conversationId) {
    participantCount = 2;
  }

  return {
    success: true,
    poll: {
      id: String((poll as { id: string }).id),
      titolo: String((poll as { titolo: string }).titolo),
      stato: (poll as { stato: "aperto" | "chiuso" }).stato,
      options: ((options ?? []) as Array<{ id: string; label: string }>).map(
        (o) => ({
          id: o.id,
          label: o.label,
          votes: counts.get(o.id) ?? 0,
        })
      ),
      totalVotes: voteRows.length,
      participantCount,
      myOptionId,
    },
  };
}

const schedaSearchSchema = z.object({
  entityType: z.enum([
    "cliente",
    "possibile_cliente",
    "fornitore",
    "prodotto",
    "prodotto_agri",
    "materia_prima",
  ]),
  query: z.string().max(120).default(""),
});

export type SchedaSearchHit = {
  id: string;
  title: string;
  subtitle: string;
};

/** Ricerca schede gestionali (solo admin). */
export async function searchChatSchedaAction(
  raw: unknown
): Promise<
  | { success: true; hits: SchedaSearchHit[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo admin può condividere schede." };
  }
  const parsed = schedaSearchSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Ricerca non valida." };

  const supabase = await createClient();
  const q = parsed.data.query.trim();
  const hits: SchedaSearchHit[] = [];

  if (parsed.data.entityType === "cliente") {
    let query = supabase
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, codice_targa")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(
        `ragione_sociale.ilike.%${q}%,partita_iva.ilike.%${q}%,codice_targa.ilike.%${q}%`
      );
    }
    const { data } = await query;
    for (const r of data ?? []) {
      const row = r as {
        id: string;
        ragione_sociale: string;
        partita_iva: string | null;
        codice_targa: string;
      };
      hits.push({
        id: row.id,
        title: row.ragione_sociale,
        subtitle: `${row.codice_targa} · ${row.partita_iva ?? ""}`.trim(),
      });
    }
  } else if (parsed.data.entityType === "fornitore") {
    let query = supabase
      .from("fornitori")
      .select("id, ragione_sociale, partita_iva, codice_targa")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(
        `ragione_sociale.ilike.%${q}%,partita_iva.ilike.%${q}%,codice_targa.ilike.%${q}%`
      );
    }
    const { data } = await query;
    for (const r of data ?? []) {
      const row = r as {
        id: string;
        ragione_sociale: string;
        partita_iva: string | null;
        codice_targa: string;
      };
      hits.push({
        id: row.id,
        title: row.ragione_sociale,
        subtitle: `${row.codice_targa} · ${row.partita_iva ?? ""}`.trim(),
      });
    }
  } else if (parsed.data.entityType === "possibile_cliente") {
    let query = supabase
      .from("clienti_possibili")
      .select("id, ragione_sociale, citta")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(`ragione_sociale.ilike.%${q}%,citta.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error) {
      for (const r of data ?? []) {
        const row = r as {
          id: string;
          ragione_sociale: string;
          citta: string | null;
        };
        hits.push({
          id: row.id,
          title: row.ragione_sociale,
          subtitle: row.citta ?? "",
        });
      }
    }
  } else if (parsed.data.entityType === "prodotto") {
    // Prodotti acquistati (catalogo Pr / fornitori)
    let query = supabase
      .from("catalogo_prodotti_fornitore")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(`nome.ilike.%${q}%,codice.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error) {
      for (const r of data ?? []) {
        const row = r as {
          id: string;
          codice: string;
          nome: string;
        };
        hits.push({
          id: row.id,
          title: row.nome,
          subtitle: row.codice,
        });
      }
    }
  } else if (parsed.data.entityType === "prodotto_agri") {
    // Prodotti Agrinsicilia (prodotti propri)
    let query = supabase
      .from("prodotti_propri")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(`nome.ilike.%${q}%,codice.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error) {
      for (const r of data ?? []) {
        const row = r as {
          id: string;
          codice: string;
          nome: string;
        };
        hits.push({
          id: row.id,
          title: row.nome,
          subtitle: row.codice,
        });
      }
    }
  } else if (parsed.data.entityType === "materia_prima") {
    let query = supabase
      .from("materie_prime")
      .select("id, nome, codice")
      .is("deleted_at", null)
      .limit(30);
    if (q) {
      query = query.or(`nome.ilike.%${q}%,codice.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error) {
      for (const r of data ?? []) {
        const row = r as { id: string; nome: string; codice: string | null };
        hits.push({
          id: row.id,
          title: row.nome,
          subtitle: row.codice ?? "",
        });
      }
    }
  }

  return { success: true, hits };
}

export async function listGestionaleRubricaForChatAction(
  query: string
): Promise<
  | {
      success: true;
      contacts: Array<{
        id: string;
        name: string;
        phone: string;
        email: string;
      }>;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo admin può usare la rubrica gestionale." };
  }
  const supabase = await createClient();
  const q = query.trim();
  let req = supabase
    .from("rubrica_contatti")
    .select("id, nome, cognome, telefono, email")
    .is("deleted_at", null)
    .limit(40);
  if (q) {
    req = req.or(
      `nome.ilike.%${q}%,cognome.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`
    );
  }
  const { data, error } = await req;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    contacts: ((data ?? []) as Array<{
      id: string;
      nome: string | null;
      cognome: string | null;
      telefono: string | null;
      email: string | null;
    }>).map((c) => ({
      id: c.id,
      name: [c.nome, c.cognome].filter(Boolean).join(" ").trim() || "Contatto",
      phone: c.telefono ?? "",
      email: c.email ?? "",
    })),
  };
}
