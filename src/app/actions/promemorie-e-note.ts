"use server";

import { notFound, redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  consegneToDb,
  emptySede,
  normalizeClienteInput,
  validateClienteFiscali,
  type ClienteInput,
  type ConsegnaAltraAzienda,
} from "@/lib/amministrazione/clienti";
import {
  createAttivitaSchema,
  createClientePossibileSchema,
  createNotaSchema,
  createPromemoriaSchema,
  updateNotaSchema,
  type ClientePossibile,
  type PnAttivita,
  type PnNota,
  type PnPromemoria,
} from "@/lib/promemorie-e-note/types";
import { createClient } from "@/lib/supabase/server";
import type { ClienteConsegnaAltraAziendaRow } from "@/types/database";

const CLIENTI_POSSIBILI_SELECT =
  "id, ragione_sociale, partita_iva, codice_fiscale, is_privato, email, pec, sdi_code, telefono, sito_web, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo, sede_mag_nazione, sede_mag_provincia, sede_mag_citta, sede_mag_cap, sede_mag_indirizzo, prodotti_interessati, consegne_altra_azienda, referente, note_interne, stato, cliente_id, created_at, updated_at";

function mapConsegnaLead(
  row: ClienteConsegnaAltraAziendaRow | Record<string, unknown>
): ConsegnaAltraAzienda {
  const r = row as ClienteConsegnaAltraAziendaRow;
  return {
    ragioneSociale: String(r.ragione_sociale ?? ""),
    nazione: String(r.nazione ?? ""),
    provincia: String(r.provincia ?? ""),
    citta: String(r.citta ?? ""),
    cap: String(r.cap ?? ""),
    indirizzo: String(r.indirizzo ?? ""),
  };
}

function mapClientePossibileRow(r: Record<string, unknown>): ClientePossibile {
  const rawConsegne = Array.isArray(r.consegne_altra_azienda)
    ? r.consegne_altra_azienda
    : [];
  const prodotti = Array.isArray(r.prodotti_interessati)
    ? (r.prodotti_interessati as string[])
    : [];
  return {
    id: String(r.id),
    ragioneSociale: String(r.ragione_sociale ?? ""),
    partitaIva: String(r.partita_iva ?? ""),
    codiceFiscale: String(r.codice_fiscale ?? ""),
    isPrivato: Boolean(r.is_privato),
    email: String(r.email ?? ""),
    pec: String(r.pec ?? ""),
    sdiCode: String(r.sdi_code ?? ""),
    telefono: String(r.telefono ?? ""),
    sitoWeb: String(r.sito_web ?? ""),
    sedeAmministrativa: {
      nazione: String(r.sede_amm_nazione ?? ""),
      provincia: String(r.sede_amm_provincia ?? ""),
      citta: String(r.sede_amm_citta ?? ""),
      cap: String(r.sede_amm_cap ?? ""),
      indirizzo: String(r.sede_amm_indirizzo ?? ""),
    },
    sedeMagazzino: {
      nazione: String(r.sede_mag_nazione ?? ""),
      provincia: String(r.sede_mag_provincia ?? ""),
      citta: String(r.sede_mag_citta ?? ""),
      cap: String(r.sede_mag_cap ?? ""),
      indirizzo: String(r.sede_mag_indirizzo ?? ""),
    },
    consegneAltraAzienda: rawConsegne.map((c) =>
      mapConsegnaLead(c as ClienteConsegnaAltraAziendaRow)
    ),
    prodottiInteressati: prodotti.map(String).filter(Boolean),
    referente: String(r.referente ?? ""),
    noteInterne: String(r.note_interne ?? ""),
    stato: r.stato as ClientePossibile["stato"],
    clienteId: r.cliente_id ? String(r.cliente_id) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

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
      "id, titolo, body, colore, due_at, entity_type, entity_id, entity_label, linked_promemoria_id, linked_attivita_id, stato, created_at"
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
      linkedPromemoriaId: r.linked_promemoria_id
        ? String(r.linked_promemoria_id)
        : null,
      linkedAttivitaId: r.linked_attivita_id
        ? String(r.linked_attivita_id)
        : null,
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
  const d = parsed.data;
  const dueAt = d.dueAt || null;
  const titoloBase =
    (d.titolo || "").trim() || d.body.trim().slice(0, 80) || "Nota";

  let linkedPromemoriaId = d.linkedPromemoriaId ?? null;
  let linkedAttivitaId = d.linkedAttivitaId ?? null;

  if (d.createPromemoria && !linkedPromemoriaId) {
    const due =
      dueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: p, error: pe } = await supabase
      .from("pn_promemoria")
      .insert({
        titolo: titoloBase,
        descrizione: d.body,
        due_at: due,
        stato: "attivo",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (pe || !p) {
      return {
        success: false,
        error: pe?.message ?? "Creazione promemoria fallita",
      };
    }
    linkedPromemoriaId = String(p.id);
    await writeAuditLog({
      entity_type: "pn_promemoria",
      entity_id: linkedPromemoriaId,
      action: "create",
      actor_id: auth.userId,
      summary: `Promemoria da nota: ${titoloBase}`,
      payload: { from_nota: true },
    });
  }

  if (d.createAttivita && !linkedAttivitaId) {
    const due =
      dueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: a, error: ae } = await supabase
      .from("pn_attivita")
      .insert({
        titolo: titoloBase,
        descrizione: d.body,
        luogo: "",
        due_at: due,
        stato: "pianificata",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (ae || !a) {
      return {
        success: false,
        error: ae?.message ?? "Creazione evento fallita",
      };
    }
    linkedAttivitaId = String(a.id);
    await writeAuditLog({
      entity_type: "pn_attivita",
      entity_id: linkedAttivitaId,
      action: "create",
      actor_id: auth.userId,
      summary: `Evento da nota: ${titoloBase}`,
      payload: { from_nota: true },
    });
  }

  const { data, error } = await supabase
    .from("pn_note")
    .insert({
      titolo: d.titolo ?? "",
      body: d.body,
      colore: d.colore ?? "giallo",
      due_at: dueAt,
      entity_type: d.entityType ?? null,
      entity_id: d.entityId ?? null,
      entity_label: d.entityLabel ?? "",
      linked_promemoria_id: linkedPromemoriaId,
      linked_attivita_id: linkedAttivitaId,
      stato: "attiva",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, titolo, body, colore, due_at, entity_type, entity_id, entity_label, linked_promemoria_id, linked_attivita_id, stato, created_at"
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
    linkedPromemoriaId: data.linked_promemoria_id
      ? String(data.linked_promemoria_id)
      : null,
    linkedAttivitaId: data.linked_attivita_id
      ? String(data.linked_attivita_id)
      : null,
    stato: data.stato as PnNota["stato"],
    createdAt: String(data.created_at),
  };
  await writeAuditLog({
    entity_type: "pn_note",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Nota collegata a ${item.entityType ?? "libera"}`,
    payload: {
      entity_id: item.entityId,
      due_at: item.dueAt,
      linked_promemoria_id: item.linkedPromemoriaId,
      linked_attivita_id: item.linkedAttivitaId,
    },
  });
  return { success: true, item };
}

function mapPnNotaRow(r: Record<string, unknown>): PnNota {
  return {
    id: String(r.id),
    titolo: String(r.titolo ?? ""),
    body: String(r.body ?? ""),
    colore: r.colore as PnNota["colore"],
    dueAt: r.due_at ? String(r.due_at) : null,
    entityType: (r.entity_type as PnNota["entityType"]) ?? null,
    entityId: r.entity_id ? String(r.entity_id) : null,
    entityLabel: String(r.entity_label ?? ""),
    linkedPromemoriaId: r.linked_promemoria_id
      ? String(r.linked_promemoria_id)
      : null,
    linkedAttivitaId: r.linked_attivita_id
      ? String(r.linked_attivita_id)
      : null,
    stato: r.stato as PnNota["stato"],
    createdAt: String(r.created_at),
  };
}

const PN_NOTE_SELECT =
  "id, titolo, body, colore, due_at, entity_type, entity_id, entity_label, linked_promemoria_id, linked_attivita_id, stato, created_at";

export async function updateNotaPnAction(input: unknown): Promise<
  { success: true; item: PnNota } | { success: false; error: string }
> {
  const { auth } = await guardPnOrAdmin();
  const parsed = updateNotaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const d = parsed.data;

  const { data: existing, error: exErr } = await supabase
    .from("pn_note")
    .select("id, body, versione, linked_promemoria_id, linked_attivita_id")
    .eq("id", d.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (exErr || !existing) {
    return { success: false, error: exErr?.message ?? "Nota non trovata" };
  }

  const dueAt = d.dueAt || null;
  const titoloBase =
    (d.titolo || "").trim() || d.body.trim().slice(0, 80) || "Nota";

  let linkedPromemoriaId =
    d.linkedPromemoriaId !== undefined
      ? d.linkedPromemoriaId
      : existing.linked_promemoria_id
        ? String(existing.linked_promemoria_id)
        : null;
  let linkedAttivitaId =
    d.linkedAttivitaId !== undefined
      ? d.linkedAttivitaId
      : existing.linked_attivita_id
        ? String(existing.linked_attivita_id)
        : null;

  if (d.createPromemoria && !linkedPromemoriaId) {
    const due =
      dueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: p, error: pe } = await supabase
      .from("pn_promemoria")
      .insert({
        titolo: titoloBase,
        descrizione: d.body,
        due_at: due,
        stato: "attivo",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (pe || !p) {
      return {
        success: false,
        error: pe?.message ?? "Creazione promemoria fallita",
      };
    }
    linkedPromemoriaId = String(p.id);
    await writeAuditLog({
      entity_type: "pn_promemoria",
      entity_id: linkedPromemoriaId,
      action: "create",
      actor_id: auth.userId,
      summary: `Promemoria da modifica nota: ${titoloBase}`,
      payload: { from_nota: d.id },
    });
  }

  if (d.createAttivita && !linkedAttivitaId) {
    const due =
      dueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: a, error: ae } = await supabase
      .from("pn_attivita")
      .insert({
        titolo: titoloBase,
        descrizione: d.body,
        luogo: "",
        due_at: due,
        stato: "pianificata",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (ae || !a) {
      return {
        success: false,
        error: ae?.message ?? "Creazione evento fallita",
      };
    }
    linkedAttivitaId = String(a.id);
    await writeAuditLog({
      entity_type: "pn_attivita",
      entity_id: linkedAttivitaId,
      action: "create",
      actor_id: auth.userId,
      summary: `Evento da modifica nota: ${titoloBase}`,
      payload: { from_nota: d.id },
    });
  }

  const nextVersione = Number(existing.versione ?? 1) + 1;
  const { data, error } = await supabase
    .from("pn_note")
    .update({
      titolo: d.titolo ?? "",
      body: d.body,
      colore: d.colore ?? "giallo",
      due_at: dueAt,
      linked_promemoria_id: linkedPromemoriaId,
      linked_attivita_id: linkedAttivitaId,
      versione: nextVersione,
      updated_by: auth.userId,
    })
    .eq("id", d.id)
    .is("deleted_at", null)
    .select(PN_NOTE_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const item = mapPnNotaRow(data as Record<string, unknown>);
  await writeAuditLog({
    entity_type: "pn_note",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Nota aggiornata (v${nextVersione})`,
    payload: {
      versione: nextVersione,
      due_at: item.dueAt,
      linked_promemoria_id: item.linkedPromemoriaId,
      linked_attivita_id: item.linkedAttivitaId,
      previous_body_preview: String(existing.body ?? "").slice(0, 200),
    },
  });
  return { success: true, item };
}

// —— Possibili clienti ——
export async function listClientiPossibiliAction(): Promise<
  | { success: true; items: ClientePossibile[]; noteCounts: Record<string, number> }
  | { success: false; error: string }
> {
  await guardAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_possibili")
    .select(CLIENTI_POSSIBILI_SELECT)
    .is("deleted_at", null)
    .neq("stato", "scartato")
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  const items = (data ?? []).map((r) =>
    mapClientePossibileRow(r as Record<string, unknown>)
  );
  const noteCounts: Record<string, number> = {};
  if (items.length > 0) {
    const { data: noteRows } = await supabase
      .from("pn_note")
      .select("entity_id")
      .eq("entity_type", "cliente_possibile")
      .is("deleted_at", null)
      .eq("stato", "attiva")
      .in(
        "entity_id",
        items.map((i) => i.id)
      );
    for (const row of noteRows ?? []) {
      const id = row.entity_id ? String(row.entity_id) : "";
      if (!id) continue;
      noteCounts[id] = (noteCounts[id] ?? 0) + 1;
    }
  }
  return { success: true, items, noteCounts };
}

/** Accetta ClienteInput dal form (prodottiAcquistati → prodotti_interessati). */
export async function createClientePossibileAction(
  input: ClienteInput | unknown
): Promise<
  | { success: true; item: ClientePossibile }
  | { success: false; error: string }
> {
  const { auth } = await guardAdmin();
  const asCliente = input as ClienteInput;
  const merged = {
    ...asCliente,
    prodottiInteressati:
      asCliente.prodottiAcquistati ??
      (input as { prodottiInteressati?: string[] }).prodottiInteressati ??
      [],
    sedeMagazzino: asCliente.sedeMagazzino ?? emptySede(),
  };
  const parsed = createClientePossibileSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const normalized = normalizeClienteInput({
    ragioneSociale: parsed.data.ragioneSociale,
    partitaIva: parsed.data.partitaIva ?? "",
    codiceFiscale: parsed.data.codiceFiscale ?? "",
    isPrivato: parsed.data.isPrivato ?? false,
    email: parsed.data.email,
    pec: parsed.data.pec,
    sdiCode: parsed.data.sdiCode,
    telefono: parsed.data.telefono,
    sitoWeb: parsed.data.sitoWeb,
    sedeAmministrativa: parsed.data.sedeAmministrativa,
    sedeMagazzino: parsed.data.sedeMagazzino ?? emptySede(),
    consegneAltraAzienda: parsed.data.consegneAltraAzienda ?? [],
    prodottiAcquistati:
      parsed.data.prodottiAcquistati ??
      parsed.data.prodottiInteressati ??
      [],
  });
  const fiscalErr = validateClienteFiscali({
    ...normalized,
    isPrivato: false,
  });
  if (fiscalErr) return { success: false, error: fiscalErr };
  // Sedi facoltative sul lead: se aperte e parziali, già validate dal form

  const referenteIds = (
    (input as { referenteIds?: string[] }).referenteIds ?? []
  ).filter(Boolean);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_possibili")
    .insert({
      ragione_sociale: normalized.ragioneSociale,
      partita_iva: normalized.partitaIva,
      codice_fiscale: normalized.codiceFiscale,
      is_privato: false,
      email: normalized.email ?? "",
      pec: normalized.pec ?? "",
      sdi_code: normalized.sdiCode ?? "",
      telefono: normalized.telefono ?? "",
      sito_web: normalized.sitoWeb ?? "",
      sede_amm_nazione: normalized.sedeAmministrativa.nazione,
      sede_amm_provincia: normalized.sedeAmministrativa.provincia,
      sede_amm_citta: normalized.sedeAmministrativa.citta,
      sede_amm_cap: normalized.sedeAmministrativa.cap,
      sede_amm_indirizzo: normalized.sedeAmministrativa.indirizzo,
      sede_mag_nazione: normalized.sedeMagazzino.nazione,
      sede_mag_provincia: normalized.sedeMagazzino.provincia,
      sede_mag_citta: normalized.sedeMagazzino.citta,
      sede_mag_cap: normalized.sedeMagazzino.cap,
      sede_mag_indirizzo: normalized.sedeMagazzino.indirizzo,
      prodotti_interessati: [],
      consegne_altra_azienda: consegneToDb(normalized.consegneAltraAzienda),
      referente: parsed.data.referente ?? "",
      note_interne: parsed.data.noteInterne ?? "",
      stato: "da_valutare",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(CLIENTI_POSSIBILI_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita" };
  }
  const item = mapClientePossibileRow(data as Record<string, unknown>);

  if (referenteIds.length > 0) {
    await supabase.from("clienti_possibili_referenti").insert(
      referenteIds.map((contatto_id) => ({
        cliente_possibile_id: item.id,
        contatto_id,
        created_by: auth.userId,
      }))
    );
    await supabase
      .from("rubrica_contatti")
      .update({
        azienda_tipo: "cliente_possibile",
        azienda_id: item.id,
        azienda_label: item.ragioneSociale,
        updated_by: auth.userId,
      })
      .in("id", referenteIds)
      .is("deleted_at", null);
  }

  await writeAuditLog({
    entity_type: "clienti_possibili",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Possibile cliente: ${item.ragioneSociale}`,
    payload: { referenti: referenteIds.length },
  });
  return { success: true, item };
}

export async function updateClientePossibileAction(
  id: string,
  input: ClienteInput | unknown
): Promise<
  | { success: true; item: ClientePossibile }
  | { success: false; error: string }
> {
  const { auth } = await guardAdmin();
  const asCliente = input as ClienteInput;
  const merged = {
    ...asCliente,
    prodottiInteressati: asCliente.prodottiAcquistati ?? [],
    sedeMagazzino: asCliente.sedeMagazzino ?? emptySede(),
  };
  const parsed = createClientePossibileSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const normalized = normalizeClienteInput({
    ragioneSociale: parsed.data.ragioneSociale,
    partitaIva: parsed.data.partitaIva ?? "",
    codiceFiscale: parsed.data.codiceFiscale ?? "",
    isPrivato: false,
    email: parsed.data.email,
    pec: parsed.data.pec,
    sdiCode: parsed.data.sdiCode,
    telefono: parsed.data.telefono,
    sitoWeb: parsed.data.sitoWeb,
    sedeAmministrativa: parsed.data.sedeAmministrativa,
    sedeMagazzino: parsed.data.sedeMagazzino ?? emptySede(),
    consegneAltraAzienda: parsed.data.consegneAltraAzienda ?? [],
    prodottiAcquistati: [],
  });
  const fiscalErr = validateClienteFiscali({ ...normalized, isPrivato: false });
  if (fiscalErr) return { success: false, error: fiscalErr };

  const referenteIds = (
    (input as { referenteIds?: string[] }).referenteIds ?? []
  ).filter(Boolean);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_possibili")
    .update({
      ragione_sociale: normalized.ragioneSociale,
      partita_iva: normalized.partitaIva,
      codice_fiscale: normalized.codiceFiscale,
      is_privato: false,
      email: normalized.email ?? "",
      pec: normalized.pec ?? "",
      sdi_code: normalized.sdiCode ?? "",
      telefono: normalized.telefono ?? "",
      sito_web: normalized.sitoWeb ?? "",
      sede_amm_nazione: normalized.sedeAmministrativa.nazione,
      sede_amm_provincia: normalized.sedeAmministrativa.provincia,
      sede_amm_citta: normalized.sedeAmministrativa.citta,
      sede_amm_cap: normalized.sedeAmministrativa.cap,
      sede_amm_indirizzo: normalized.sedeAmministrativa.indirizzo,
      sede_mag_nazione: normalized.sedeMagazzino.nazione,
      sede_mag_provincia: normalized.sedeMagazzino.provincia,
      sede_mag_citta: normalized.sedeMagazzino.citta,
      sede_mag_cap: normalized.sedeMagazzino.cap,
      sede_mag_indirizzo: normalized.sedeMagazzino.indirizzo,
      consegne_altra_azienda: consegneToDb(normalized.consegneAltraAzienda),
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(CLIENTI_POSSIBILI_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const item = mapClientePossibileRow(data as Record<string, unknown>);

  await supabase.from("clienti_possibili_referenti").delete().eq("cliente_possibile_id", id);
  if (referenteIds.length > 0) {
    await supabase.from("clienti_possibili_referenti").insert(
      referenteIds.map((contatto_id) => ({
        cliente_possibile_id: id,
        contatto_id,
        created_by: auth.userId,
      }))
    );
    await supabase
      .from("rubrica_contatti")
      .update({
        azienda_tipo: "cliente_possibile",
        azienda_id: id,
        azienda_label: item.ragioneSociale,
        updated_by: auth.userId,
      })
      .in("id", referenteIds)
      .is("deleted_at", null);
  }

  await writeAuditLog({
    entity_type: "clienti_possibili",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Possibile cliente aggiornato: ${item.ragioneSociale}`,
    payload: { referenti: referenteIds.length },
  });
  return { success: true, item };
}
