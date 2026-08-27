"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { mapClienteRow } from "@/lib/amministrazione/clienti";
import {
  labelFornitoreTipologia,
  normalizeTipologie,
} from "@/lib/amministrazione/catalogo-offerta";
import { mapFornitoreRow } from "@/lib/amministrazione/fornitori";
import {
  formatEuroIt,
  formatSedeShare,
  isBasicAnagraficaKey,
  isBasicProductKey,
  pushFieldIfValue,
  type SchedaShareFieldOption,
  type SchedaSharePreview,
  type SchedaShareReferenteOption,
} from "@/lib/chat/scheda-share-fields";
import { pollCreateSchema } from "@/lib/chat/share";
import {
  TOPIC_MESSAGE_SELECT,
  mapTopicMessage,
  type TopicMessage,
} from "@/lib/chat/topics";
import { MESSAGE_SELECT, mapMessage, type ChatMessage } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/server";
import type {
  ClienteConsegnaAltraAziendaRow,
  ClienteRow,
  FornitoreRow,
  FornitoreTipologia,
} from "@/types/database";
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

const schedaPreviewSchema = z.object({
  entityType: z.enum([
    "cliente",
    "possibile_cliente",
    "fornitore",
    "prodotto",
    "prodotto_agri",
    "materia_prima",
  ]),
  entityId: z.string().uuid(),
});

async function resolveCatalogNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table:
    | "prodotti_propri"
    | "catalogo_prodotti_fornitore"
    | "catalogo_servizi"
    | "catalogo_contributi"
    | "materie_prime",
  ids: string[]
): Promise<string> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return "";
  const { data } = await supabase
    .from(table)
    .select("id, nome, codice")
    .in("id", unique)
    .is("deleted_at", null);
  const labels = ((data ?? []) as Array<{
    id: string;
    nome: string;
    codice: string | null;
  }>).map((r) =>
    r.codice ? `${r.nome} (${r.codice})` : r.nome
  );
  return labels.join(", ");
}

function formatConsegneShare(
  items: Array<{
    ragioneSociale: string;
    nazione: string;
    provincia: string;
    citta: string;
    cap: string;
    indirizzo: string;
  }>
): string {
  return items
    .map((c) => {
      const sede = formatSedeShare(c);
      return sede
        ? `${c.ragioneSociale} — ${sede}`
        : c.ragioneSociale;
    })
    .filter(Boolean)
    .join("\n");
}

async function loadSchedaReferenti(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tipo: "cliente" | "fornitore" | "cliente_possibile",
  entityId: string
): Promise<SchedaShareReferenteOption[]> {
  const junction =
    tipo === "cliente"
      ? { table: "clienti_referenti" as const, fk: "cliente_id" as const }
      : tipo === "fornitore"
        ? { table: "fornitori_referenti" as const, fk: "fornitore_id" as const }
        : {
            table: "clienti_possibili_referenti" as const,
            fk: "cliente_possibile_id" as const,
          };

  const { data: links } = await supabase
    .from(junction.table)
    .select("contatto_id")
    .eq(junction.fk, entityId);
  const ids = (links ?? []).map((r) => String((r as { contatto_id: string }).contatto_id));
  if (ids.length === 0) return [];

  const { data: contatti } = await supabase
    .from("rubrica_contatti")
    .select("id, nome, cognome, telefono, email, mansione")
    .in("id", ids)
    .is("deleted_at", null);

  return ((contatti ?? []) as Array<{
    id: string;
    nome: string | null;
    cognome: string | null;
    telefono: string | null;
    email: string | null;
    mansione: string | null;
  }>).map((r) => ({
    id: r.id,
    label: [r.nome, r.cognome].filter(Boolean).join(" ").trim() || "Referente",
    dettaglio: [r.mansione, r.telefono, r.email].filter(Boolean).join(" · "),
    defaultSelected: false,
  }));
}

/**
 * Anteprima campi condivisibili di una scheda (solo admin).
 * Snapshot per selezione checkbox → payload scheda in chat.
 */
export async function getChatSchedaSharePreviewAction(
  raw: unknown
): Promise<
  | { success: true; preview: SchedaSharePreview }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("chat");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo admin può condividere schede." };
  }
  const parsed = schedaPreviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Scheda non valida." };
  }

  const supabase = await createClient();
  const { entityType, entityId } = parsed.data;
  const fields: SchedaShareFieldOption[] = [];
  let title = "";
  let subtitle = "";
  let referenti: SchedaShareReferenteOption[] = [];
  let price: SchedaSharePreview["price"] = null;

  if (entityType === "cliente" || entityType === "fornitore") {
    const table = entityType === "cliente" ? "clienti" : "fornitori";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Scheda non trovata." };
    }

    if (entityType === "cliente") {
      const c = mapClienteRow(data as ClienteRow);
      title = c.ragioneSociale;
      subtitle = `${c.codiceTarga} · ${c.partitaIva}`.trim();
      pushFieldIfValue(
        fields,
        "codice_targa",
        "Codice",
        c.codiceTarga,
        isBasicAnagraficaKey("codice_targa")
      );
      pushFieldIfValue(
        fields,
        "partita_iva",
        "P. IVA",
        c.partitaIva,
        true
      );
      pushFieldIfValue(
        fields,
        "codice_fiscale",
        "Codice fiscale",
        c.codiceFiscale,
        true
      );
      pushFieldIfValue(fields, "email", "Email", c.email, true);
      pushFieldIfValue(fields, "telefono", "Telefono", c.telefono, true);
      pushFieldIfValue(fields, "pec", "PEC", c.pec, false);
      pushFieldIfValue(fields, "sdi", "Codice SDI", c.sdiCode, false);
      pushFieldIfValue(fields, "sito", "Sito web", c.sitoWeb, false);
      pushFieldIfValue(
        fields,
        "sede_amm",
        "Sede amministrativa",
        formatSedeShare(c.sedeAmministrativa),
        false
      );
      pushFieldIfValue(
        fields,
        "sede_mag",
        "Sede magazzino",
        formatSedeShare(c.sedeMagazzino),
        false
      );
      pushFieldIfValue(
        fields,
        "consegne",
        "Consegne altra azienda",
        formatConsegneShare(c.consegneAltraAzienda),
        false
      );
      const prodottiLabel = await resolveCatalogNames(
        supabase,
        "prodotti_propri",
        c.prodottiAcquistati
      );
      pushFieldIfValue(
        fields,
        "prodotti_acquistati",
        "Prodotti Agrinsicilia",
        prodottiLabel,
        false
      );

      referenti = await loadSchedaReferenti(supabase, "cliente", entityId);
    } else {
      const f = mapFornitoreRow(data as FornitoreRow);
      title = f.ragioneSociale;
      subtitle = `${f.codiceTarga} · ${f.partitaIva}`.trim();
      pushFieldIfValue(
        fields,
        "codice_targa",
        "Codice",
        f.codiceTarga,
        true
      );
      pushFieldIfValue(fields, "partita_iva", "P. IVA", f.partitaIva, true);
      pushFieldIfValue(
        fields,
        "codice_fiscale",
        "Codice fiscale",
        f.codiceFiscale,
        true
      );
      pushFieldIfValue(fields, "email", "Email", f.email, true);
      pushFieldIfValue(fields, "telefono", "Telefono", f.telefono, true);
      pushFieldIfValue(fields, "pec", "PEC", f.pec, false);
      pushFieldIfValue(fields, "sdi", "Codice SDI", f.sdiCode, false);
      pushFieldIfValue(fields, "sito", "Sito web", f.sitoWeb, false);
      pushFieldIfValue(
        fields,
        "sede_amm",
        "Sede amministrativa",
        formatSedeShare(f.sedeAmministrativa),
        false
      );
      pushFieldIfValue(
        fields,
        "sede_mag",
        "Sede magazzino",
        formatSedeShare(f.sedeMagazzino),
        false
      );
      const tipLabels = normalizeTipologie(f.tipologie as FornitoreTipologia[])
        .map(labelFornitoreTipologia)
        .join(", ");
      pushFieldIfValue(fields, "tipologie", "Tipologie", tipLabels, false);
      pushFieldIfValue(
        fields,
        "servizi_offerti",
        "Servizi offerti",
        await resolveCatalogNames(supabase, "catalogo_servizi", f.serviziOfferti),
        false
      );
      pushFieldIfValue(
        fields,
        "prodotti_fornitore",
        "Prodotti offerti",
        await resolveCatalogNames(
          supabase,
          "catalogo_prodotti_fornitore",
          f.prodottiFornitore
        ),
        false
      );
      pushFieldIfValue(
        fields,
        "contributi_offerti",
        "Contributi",
        await resolveCatalogNames(
          supabase,
          "catalogo_contributi",
          f.contributiOfferti
        ),
        false
      );
      pushFieldIfValue(
        fields,
        "materie_prime",
        "Materie prime",
        await resolveCatalogNames(supabase, "materie_prime", f.prodottiAcquistati),
        false
      );
      pushFieldIfValue(
        fields,
        "bio_codice",
        "Codice bio",
        f.bioCodice,
        false
      );

      referenti = await loadSchedaReferenti(supabase, "fornitore", entityId);
    }
  } else if (entityType === "possibile_cliente") {
    const { data, error } = await supabase
      .from("clienti_possibili")
      .select("*")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Scheda non trovata." };
    }
    const r = data as Record<string, unknown>;
    title = String(r.ragione_sociale ?? "");
    subtitle = String(r.partita_iva ?? r.citta ?? "");
    pushFieldIfValue(
      fields,
      "partita_iva",
      "P. IVA",
      String(r.partita_iva ?? ""),
      true
    );
    pushFieldIfValue(
      fields,
      "codice_fiscale",
      "Codice fiscale",
      String(r.codice_fiscale ?? ""),
      true
    );
    pushFieldIfValue(fields, "email", "Email", String(r.email ?? ""), true);
    pushFieldIfValue(
      fields,
      "telefono",
      "Telefono",
      String(r.telefono ?? ""),
      true
    );
    pushFieldIfValue(fields, "pec", "PEC", String(r.pec ?? ""), false);
    pushFieldIfValue(
      fields,
      "sdi",
      "Codice SDI",
      String(r.sdi_code ?? ""),
      false
    );
    pushFieldIfValue(
      fields,
      "sito",
      "Sito web",
      String(r.sito_web ?? ""),
      false
    );
    pushFieldIfValue(
      fields,
      "sede_amm",
      "Sede amministrativa",
      formatSedeShare({
        nazione: String(r.sede_amm_nazione ?? ""),
        provincia: String(r.sede_amm_provincia ?? ""),
        citta: String(r.sede_amm_citta ?? ""),
        cap: String(r.sede_amm_cap ?? ""),
        indirizzo: String(r.sede_amm_indirizzo ?? ""),
      }),
      false
    );
    pushFieldIfValue(
      fields,
      "sede_mag",
      "Sede magazzino",
      formatSedeShare({
        nazione: String(r.sede_mag_nazione ?? ""),
        provincia: String(r.sede_mag_provincia ?? ""),
        citta: String(r.sede_mag_citta ?? ""),
        cap: String(r.sede_mag_cap ?? ""),
        indirizzo: String(r.sede_mag_indirizzo ?? ""),
      }),
      false
    );
    const rawConsegne = Array.isArray(r.consegne_altra_azienda)
      ? (r.consegne_altra_azienda as ClienteConsegnaAltraAziendaRow[])
      : [];
    pushFieldIfValue(
      fields,
      "consegne",
      "Consegne altra azienda",
      formatConsegneShare(
        rawConsegne.map((c) => ({
          ragioneSociale: String(
            (c as { ragione_sociale?: string }).ragione_sociale ??
              (c as { ragioneSociale?: string }).ragioneSociale ??
              ""
          ),
          nazione: String(
            (c as { nazione?: string }).nazione ?? ""
          ),
          provincia: String(
            (c as { provincia?: string }).provincia ?? ""
          ),
          citta: String((c as { citta?: string }).citta ?? ""),
          cap: String((c as { cap?: string }).cap ?? ""),
          indirizzo: String(
            (c as { indirizzo?: string }).indirizzo ?? ""
          ),
        }))
      ),
      false
    );
    const prodottiIds = Array.isArray(r.prodotti_interessati)
      ? (r.prodotti_interessati as string[])
      : [];
    pushFieldIfValue(
      fields,
      "prodotti_interessati",
      "Prodotti interessati",
      await resolveCatalogNames(supabase, "prodotti_propri", prodottiIds),
      false
    );

    referenti = await loadSchedaReferenti(
      supabase,
      "cliente_possibile",
      entityId
    );
  } else if (entityType === "prodotto") {
    const { data, error } = await supabase
      .from("catalogo_prodotti_fornitore")
      .select("id, codice, nome, note, is_bio, prezzo_unitario_medio")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Scheda non trovata." };
    }
    const row = data as {
      codice: string;
      nome: string;
      note: string | null;
      is_bio: boolean;
      prezzo_unitario_medio: number | null;
    };
    title = row.nome;
    subtitle = row.codice;
    pushFieldIfValue(fields, "codice", "Codice", row.codice, isBasicProductKey("codice"));
    pushFieldIfValue(fields, "nome", "Nome", row.nome, isBasicProductKey("nome"));
    pushFieldIfValue(fields, "note", "Note", row.note ?? "", false);
    pushFieldIfValue(
      fields,
      "bio",
      "Biologico",
      row.is_bio ? "Sì" : "No",
      false
    );
    if (row.prezzo_unitario_medio != null) {
      price = {
        label: "Prezzo medio unitario",
        value: formatEuroIt(Number(row.prezzo_unitario_medio)),
        defaultSelected: false,
      };
    }
  } else if (entityType === "prodotto_agri") {
    const { data, error } = await supabase
      .from("prodotti_propri")
      .select("id, codice, nome, note, is_bio, prezzo_listino")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Scheda non trovata." };
    }
    const row = data as {
      codice: string;
      nome: string;
      note: string | null;
      is_bio: boolean;
      prezzo_listino: number | null;
    };
    title = row.nome;
    subtitle = row.codice;
    pushFieldIfValue(fields, "codice", "Codice", row.codice, true);
    pushFieldIfValue(fields, "nome", "Nome", row.nome, true);
    pushFieldIfValue(fields, "note", "Note", row.note ?? "", false);
    pushFieldIfValue(
      fields,
      "bio",
      "Biologico",
      row.is_bio ? "Sì" : "No",
      false
    );
    if (row.prezzo_listino != null) {
      price = {
        label: "Prezzo listino",
        value: formatEuroIt(Number(row.prezzo_listino)),
        defaultSelected: false,
      };
    }
  } else if (entityType === "materia_prima") {
    const { data, error } = await supabase
      .from("materie_prime")
      .select("id, codice, nome, note, is_bio, bio_codice")
      .eq("id", entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Scheda non trovata." };
    }
    const row = data as {
      codice: string;
      nome: string;
      note: string | null;
      is_bio: boolean;
      bio_codice: string | null;
    };
    title = row.nome;
    subtitle = row.codice;
    pushFieldIfValue(fields, "codice", "Codice", row.codice, true);
    pushFieldIfValue(fields, "nome", "Nome", row.nome, true);
    pushFieldIfValue(fields, "note", "Note", row.note ?? "", false);
    pushFieldIfValue(
      fields,
      "bio",
      "Biologico",
      row.is_bio ? "Sì" : "No",
      false
    );
    pushFieldIfValue(
      fields,
      "bio_codice",
      "Codice bio",
      row.bio_codice ?? "",
      false
    );
  }

  if (!title.trim()) {
    return { success: false, error: "Scheda senza titolo." };
  }

  await writeAuditLog({
    entity_type: "chat_scheda_share_preview",
    entity_id: entityId,
    action: "read",
    actor_id: auth.userId,
    summary: `Anteprima scheda chat: ${entityType}`,
    payload: { entityType, fieldCount: fields.length },
  });

  return {
    success: true,
    preview: {
      entityType,
      entityId,
      title: title.trim(),
      subtitle: subtitle.trim(),
      fields,
      referenti,
      price,
    },
  };
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
