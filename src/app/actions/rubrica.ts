"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  createRubricaContattoSchema,
  createRubricaTimelineSchema,
  type RubricaAziendaTipo,
  type RubricaContatto,
  type RubricaModalita,
  type RubricaTimelineItem,
} from "@/lib/rubrica/types";
import { createClient } from "@/lib/supabase/server";

async function guard() {
  return requireAreaAccess("amministrazione");
}

const CONTATTO_SELECT =
  "id, nome, cognome, telefono, email, rapporto, azienda_tipo, azienda_id, azienda_label, mansione, note, created_at, updated_at";

function mapContatto(r: Record<string, unknown>): RubricaContatto {
  return {
    id: String(r.id),
    nome: String(r.nome ?? ""),
    cognome: String(r.cognome ?? ""),
    telefono: String(r.telefono ?? ""),
    email: String(r.email ?? ""),
    rapporto: r.rapporto as RubricaContatto["rapporto"],
    aziendaTipo: r.azienda_tipo as RubricaAziendaTipo,
    aziendaId: r.azienda_id ? String(r.azienda_id) : null,
    aziendaLabel: String(r.azienda_label ?? ""),
    mansione: String(r.mansione ?? ""),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTimeline(r: Record<string, unknown>): RubricaTimelineItem {
  return {
    id: String(r.id),
    contattoId: String(r.contatto_id),
    occurredAt: String(r.occurred_at),
    riassunto: String(r.riassunto ?? ""),
    argomenti: String(r.argomenti ?? ""),
    descrizione: String(r.descrizione ?? ""),
    modalita: r.modalita as RubricaModalita,
    mapsUrl: String(r.maps_url ?? ""),
    webmailMessageId: r.webmail_message_id
      ? String(r.webmail_message_id)
      : null,
    linkedPromemoriaId: r.linked_promemoria_id
      ? String(r.linked_promemoria_id)
      : null,
    linkedAttivitaId: r.linked_attivita_id
      ? String(r.linked_attivita_id)
      : null,
    linkedNotaId: r.linked_nota_id ? String(r.linked_nota_id) : null,
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at),
  };
}

export async function listRubricaContattiAction(input?: {
  query?: string;
}): Promise<
  { success: true; items: RubricaContatto[] } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  let q = supabase
    .from("rubrica_contatti")
    .select(CONTATTO_SELECT)
    .is("deleted_at", null)
    .order("cognome", { ascending: true })
    .order("nome", { ascending: true })
    .limit(500);
  const query = input?.query?.trim();
  if (query) {
    q = q.or(
      `nome.ilike.%${query}%,cognome.ilike.%${query}%,email.ilike.%${query}%,telefono.ilike.%${query}%,azienda_label.ilike.%${query}%`
    );
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => mapContatto(r as Record<string, unknown>)),
  };
}

export async function createRubricaContattoAction(input: unknown): Promise<
  | { success: true; item: RubricaContatto }
  | { success: false; error: string }
> {
  const { auth } = await guard();
  const parsed = createRubricaContattoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const d = parsed.data;
  let aziendaId = d.aziendaId ?? null;
  let aziendaLabel = d.aziendaLabel ?? "";
  if (d.aziendaTipo === "agrinsicilia") {
    aziendaId = null;
    if (!aziendaLabel.trim()) aziendaLabel = "Agrinsicilia";
  } else if (!aziendaId && !aziendaLabel.trim()) {
    return {
      success: false,
      error: "Seleziona un’azienda o indica la ragione sociale.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .insert({
      nome: d.nome,
      cognome: d.cognome,
      telefono: d.telefono ?? "",
      email: d.email ?? "",
      rapporto: d.rapporto,
      azienda_tipo: d.aziendaTipo,
      azienda_id: aziendaId,
      azienda_label: aziendaLabel,
      mansione: d.mansione ?? "",
      note: d.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(CONTATTO_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item = mapContatto(data as Record<string, unknown>);
  await writeAuditLog({
    entity_type: "rubrica_contatti",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Rubrica: ${item.nome} ${item.cognome}`,
    payload: { azienda_tipo: item.aziendaTipo },
  });
  return { success: true, item };
}

export async function listAziendeRubricaPickerAction(
  tipo: RubricaAziendaTipo
): Promise<
  | { success: true; items: { id: string; label: string }[] }
  | { success: false; error: string }
> {
  await guard();
  if (tipo === "agrinsicilia") {
    return { success: true, items: [{ id: "agrinsicilia", label: "Agrinsicilia" }] };
  }
  const supabase = await createClient();
  if (tipo === "cliente") {
    const { data, error } = await supabase
      .from("clienti")
      .select("id, ragione_sociale, codice_targa")
      .is("deleted_at", null)
      .order("ragione_sociale")
      .limit(400);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      items: (data ?? []).map((r) => ({
        id: String(r.id),
        label: `${r.codice_targa} — ${r.ragione_sociale}`,
      })),
    };
  }
  if (tipo === "fornitore") {
    const { data, error } = await supabase
      .from("fornitori")
      .select("id, ragione_sociale, codice_targa")
      .is("deleted_at", null)
      .order("ragione_sociale")
      .limit(400);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      items: (data ?? []).map((r) => ({
        id: String(r.id),
        label: `${r.codice_targa} — ${r.ragione_sociale}`,
      })),
    };
  }
  const { data, error } = await supabase
    .from("clienti_possibili")
    .select("id, ragione_sociale")
    .is("deleted_at", null)
    .neq("stato", "scartato")
    .order("ragione_sociale")
    .limit(400);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      label: String(r.ragione_sociale),
    })),
  };
}

export async function listRubricaTimelineAction(
  contattoId: string
): Promise<
  | { success: true; items: RubricaTimelineItem[] }
  | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_timeline")
    .select(
      "id, contatto_id, occurred_at, riassunto, argomenti, descrizione, modalita, maps_url, webmail_message_id, linked_promemoria_id, linked_attivita_id, linked_nota_id, created_by, created_at"
    )
    .eq("contatto_id", contattoId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => mapTimeline(r as Record<string, unknown>)),
  };
}

export async function createRubricaTimelineAction(input: unknown): Promise<
  | { success: true; item: RubricaTimelineItem }
  | { success: false; error: string }
> {
  const { auth } = await guard();
  const parsed = createRubricaTimelineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const d = parsed.data;
  if (d.modalita === "incontro" && !d.mapsUrl?.trim()) {
    return {
      success: false,
      error: "Per un incontro indica il link Maps della posizione.",
    };
  }
  if (d.modalita === "mail" && !d.webmailMessageId) {
    // allow empty for now — user can add link later; soft requirement
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_timeline")
    .insert({
      contatto_id: d.contattoId,
      occurred_at: d.occurredAt,
      riassunto: d.riassunto,
      argomenti: d.argomenti ?? "",
      descrizione: d.descrizione ?? "",
      modalita: d.modalita,
      maps_url: d.mapsUrl ?? "",
      webmail_message_id: d.webmailMessageId ?? null,
      linked_promemoria_id: d.linkedPromemoriaId ?? null,
      linked_attivita_id: d.linkedAttivitaId ?? null,
      linked_nota_id: d.linkedNotaId ?? null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, contatto_id, occurred_at, riassunto, argomenti, descrizione, modalita, maps_url, webmail_message_id, linked_promemoria_id, linked_attivita_id, linked_nota_id, created_by, created_at"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item = mapTimeline(data as Record<string, unknown>);
  await writeAuditLog({
    entity_type: "rubrica_timeline",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Timeline rubrica (${item.modalita}): ${item.riassunto.slice(0, 80)}`,
    payload: { contatto_id: item.contattoId },
  });
  return { success: true, item };
}

export async function listWebmailMessagesLiteAction(input?: {
  query?: string;
}): Promise<
  | { success: true; items: { id: string; label: string }[] }
  | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  // Best-effort: tabella webmail_messages se presente
  let q = supabase
    .from("webmail_messaggi")
    .select("id, subject, from_address, received_at")
    .order("received_at", { ascending: false })
    .limit(40);
  const query = input?.query?.trim();
  if (query) {
    q = q.or(`subject.ilike.%${query}%,from_address.ilike.%${query}%`);
  }
  const { data, error } = await q;
  if (error) {
    // tabella assente o permessi: non bloccare la timeline
    return { success: true, items: [] };
  }
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      label: `${String(r.subject || "(senza oggetto)")} — ${String(r.from_address || "")}`,
    })),
  };
}
