"use server";

import { notFound, redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  createAttivitaSchema,
  createClientePossibileSchema,
  createNotaSchema,
  createPromemoriaSchema,
  type ClientePossibile,
  type PnAttivita,
  type PnNota,
  type PnPromemoria,
} from "@/lib/promemorie-e-note/types";
import { createClient } from "@/lib/supabase/server";

async function guardPn() {
  return requireAreaAccess("promemorie-e-note");
}

async function guardAdmin() {
  return requireAreaAccess("amministrazione");
}

async function guardPnOrAdmin() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  const ok =
    userCanAccessArea(auth.areas, "promemorie-e-note") ||
    userCanAccessArea(auth.areas, "amministrazione");
  if (!ok) notFound();
  return { auth };
}

function parseMentionIdsFromText(
  text: string,
  peers: { id: string; name: string }[]
): string[] {
  const ids = new Set<string>();
  const re = /@([^\s@]+(?:\s+[^\s@]+)?)/g;
  let m: RegExpExecArray | null;
  const lower = peers.map((p) => ({
    id: p.id,
    name: p.name.trim().toLowerCase(),
  }));
  while ((m = re.exec(text)) !== null) {
    const token = (m[1] ?? "").trim().toLowerCase();
    const hit =
      lower.find((p) => p.name === token) ||
      lower.find((p) => p.name.startsWith(token));
    if (hit) ids.add(hit.id);
  }
  return [...ids];
}

// —— Promemoria ——
export async function listPromemoriaAction(): Promise<
  { success: true; items: PnPromemoria[] } | { success: false; error: string }
> {
  await guardPn();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pn_promemoria")
    .select("id, titolo, descrizione, due_at, stato, created_at")
    .is("deleted_at", null)
    .neq("stato", "archiviato")
    .order("due_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      titolo: String(r.titolo),
      descrizione: String(r.descrizione ?? ""),
      dueAt: String(r.due_at),
      stato: r.stato as PnPromemoria["stato"],
      createdAt: String(r.created_at),
    })),
  };
}

export async function createPromemoriaAction(input: unknown): Promise<
  { success: true; item: PnPromemoria } | { success: false; error: string }
> {
  const { auth } = await guardPn();
  const parsed = createPromemoriaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pn_promemoria")
    .insert({
      titolo: parsed.data.titolo,
      descrizione: parsed.data.descrizione ?? "",
      due_at: parsed.data.dueAt,
      stato: "attivo",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, titolo, descrizione, due_at, stato, created_at")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item: PnPromemoria = {
    id: String(data.id),
    titolo: String(data.titolo),
    descrizione: String(data.descrizione ?? ""),
    dueAt: String(data.due_at),
    stato: data.stato as PnPromemoria["stato"],
    createdAt: String(data.created_at),
  };
  await writeAuditLog({
    entity_type: "pn_promemoria",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Promemoria: ${item.titolo}`,
    payload: {},
  });
  return { success: true, item };
}

export async function completePromemoriaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardPn();
  const supabase = await createClient();
  const { error } = await supabase
    .from("pn_promemoria")
    .update({ stato: "completato", updated_by: auth.userId })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// —— Attività ——
export async function listAttivitaPnAction(): Promise<
  { success: true; items: PnAttivita[] } | { success: false; error: string }
> {
  await guardPn();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pn_attivita")
    .select("id, titolo, descrizione, luogo, due_at, stato, created_at")
    .is("deleted_at", null)
    .neq("stato", "archiviata")
    .order("due_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  const ids = (data ?? []).map((r) => String(r.id));
  const mentions = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: m } = await supabase
      .from("pn_attivita_mentions")
      .select("attivita_id, user_id")
      .in("attivita_id", ids)
      .is("deleted_at", null);
    for (const row of m ?? []) {
      const aid = String(row.attivita_id);
      const list = mentions.get(aid) ?? [];
      list.push(String(row.user_id));
      mentions.set(aid, list);
    }
  }
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      titolo: String(r.titolo),
      descrizione: String(r.descrizione ?? ""),
      luogo: String(r.luogo ?? ""),
      dueAt: String(r.due_at),
      stato: r.stato as PnAttivita["stato"],
      mentionUserIds: mentions.get(String(r.id)) ?? [],
      createdAt: String(r.created_at),
    })),
  };
}

export async function createAttivitaPnAction(input: {
  titolo: string;
  descrizione?: string;
  luogo?: string;
  dueAt: string;
  mentionUserIds?: string[];
  peers?: { id: string; name: string }[];
}): Promise<
  { success: true; item: PnAttivita } | { success: false; error: string }
> {
  const { auth } = await guardPn();
  const parsed = createAttivitaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pn_attivita")
    .insert({
      titolo: parsed.data.titolo,
      descrizione: parsed.data.descrizione ?? "",
      luogo: parsed.data.luogo ?? "",
      due_at: parsed.data.dueAt,
      stato: "pianificata",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, titolo, descrizione, luogo, due_at, stato, created_at")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const mentionIds = new Set([
    ...(parsed.data.mentionUserIds ?? []),
    ...parseMentionIdsFromText(
      `${parsed.data.titolo} ${parsed.data.descrizione}`,
      input.peers ?? []
    ),
  ]);
  if (mentionIds.size > 0) {
    await supabase.from("pn_attivita_mentions").insert(
      [...mentionIds].map((user_id) => ({
        attivita_id: data.id,
        user_id,
        created_by: auth.userId,
      }))
    );
  }
  const item: PnAttivita = {
    id: String(data.id),
    titolo: String(data.titolo),
    descrizione: String(data.descrizione ?? ""),
    luogo: String(data.luogo ?? ""),
    dueAt: String(data.due_at),
    stato: data.stato as PnAttivita["stato"],
    mentionUserIds: [...mentionIds],
    createdAt: String(data.created_at),
  };
  await writeAuditLog({
    entity_type: "pn_attivita",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Attività: ${item.titolo}`,
    payload: { mentions: item.mentionUserIds.length },
  });
  return { success: true, item };
}

// —— Note ——
export async function listNotePnAction(input?: {
  entityType?: string | null;
  entityId?: string | null;
}): Promise<
  { success: true; items: PnNota[] } | { success: false; error: string }
> {
  await guardPnOrAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("pn_note")
    .select(
      "id, titolo, body, colore, due_at, entity_type, entity_id, entity_label, stato, created_at"
    )
    .is("deleted_at", null)
    .eq("stato", "attiva")
    .order("created_at", { ascending: false });
  if (input?.entityType && input?.entityId) {
    q = q
      .eq("entity_type", input.entityType)
      .eq("entity_id", input.entityId);
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      titolo: String(r.titolo ?? ""),
      body: String(r.body ?? ""),
      colore: r.colore as PnNota["colore"],
      dueAt: r.due_at ? String(r.due_at) : null,
      entityType: (r.entity_type as PnNota["entityType"]) ?? null,
      entityId: r.entity_id ? String(r.entity_id) : null,
      entityLabel: String(r.entity_label ?? ""),
      stato: r.stato as PnNota["stato"],
      createdAt: String(r.created_at),
    })),
  };
}

export async function createNotaPnAction(input: unknown): Promise<
  { success: true; item: PnNota } | { success: false; error: string }
> {
  const { auth } = await guardPnOrAdmin();
  const parsed = createNotaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pn_note")
    .insert({
      titolo: parsed.data.titolo ?? "",
      body: parsed.data.body,
      colore: parsed.data.colore ?? "giallo",
      due_at: parsed.data.dueAt || null,
      entity_type: parsed.data.entityType ?? null,
      entity_id: parsed.data.entityId ?? null,
      entity_label: parsed.data.entityLabel ?? "",
      stato: "attiva",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, titolo, body, colore, due_at, entity_type, entity_id, entity_label, stato, created_at"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item: PnNota = {
    id: String(data.id),
    titolo: String(data.titolo ?? ""),
    body: String(data.body ?? ""),
    colore: data.colore as PnNota["colore"],
    dueAt: data.due_at ? String(data.due_at) : null,
    entityType: (data.entity_type as PnNota["entityType"]) ?? null,
    entityId: data.entity_id ? String(data.entity_id) : null,
    entityLabel: String(data.entity_label ?? ""),
    stato: data.stato as PnNota["stato"],
    createdAt: String(data.created_at),
  };
  await writeAuditLog({
    entity_type: "pn_note",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Nota collegata a ${item.entityType ?? "libera"}`,
    payload: { entity_id: item.entityId },
  });
  return { success: true, item };
}

// —— Possibili clienti ——
export async function listClientiPossibiliAction(): Promise<
  | { success: true; items: ClientePossibile[] }
  | { success: false; error: string }
> {
  await guardAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_possibili")
    .select(
      "id, ragione_sociale, referente, telefono, email, note_interne, stato, cliente_id, created_at, updated_at"
    )
    .is("deleted_at", null)
    .neq("stato", "scartato")
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      ragioneSociale: String(r.ragione_sociale),
      referente: String(r.referente ?? ""),
      telefono: String(r.telefono ?? ""),
      email: String(r.email ?? ""),
      noteInterne: String(r.note_interne ?? ""),
      stato: r.stato as ClientePossibile["stato"],
      clienteId: r.cliente_id ? String(r.cliente_id) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
  };
}

export async function createClientePossibileAction(input: unknown): Promise<
  | { success: true; item: ClientePossibile }
  | { success: false; error: string }
> {
  const { auth } = await guardAdmin();
  const parsed = createClientePossibileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_possibili")
    .insert({
      ragione_sociale: parsed.data.ragioneSociale,
      referente: parsed.data.referente ?? "",
      telefono: parsed.data.telefono ?? "",
      email: parsed.data.email ?? "",
      note_interne: parsed.data.noteInterne ?? "",
      stato: "da_valutare",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, ragione_sociale, referente, telefono, email, note_interne, stato, cliente_id, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item: ClientePossibile = {
    id: String(data.id),
    ragioneSociale: String(data.ragione_sociale),
    referente: String(data.referente ?? ""),
    telefono: String(data.telefono ?? ""),
    email: String(data.email ?? ""),
    noteInterne: String(data.note_interne ?? ""),
    stato: data.stato as ClientePossibile["stato"],
    clienteId: data.cliente_id ? String(data.cliente_id) : null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
  await writeAuditLog({
    entity_type: "clienti_possibili",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Possibile cliente: ${item.ragioneSociale}`,
    payload: {},
  });
  return { success: true, item };
}
