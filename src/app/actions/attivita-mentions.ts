"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  ATTIVITA_MENTION_KINDS,
  collegamentiStillInText,
  specForKind,
  type AttivitaMentionHit,
  type AttivitaMentionKind,
  type PnAttivitaCollegamento,
} from "@/lib/promemorie-e-note/mention-tokens";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const searchSchema = z.object({
  kind: z.enum(ATTIVITA_MENTION_KINDS),
  q: z.string().trim().max(120).optional().default(""),
});

function sanitizeLike(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function asHits(
  rows: Array<{ id?: unknown; label?: unknown; hint?: unknown }>
): AttivitaMentionHit[] {
  return rows
    .map((r) => ({
      entityId: String(r.id ?? ""),
      label: String(r.label ?? "").trim(),
      hint: r.hint ? String(r.hint) : undefined,
    }))
    .filter((r) => r.entityId && r.label);
}

function filterHits(items: AttivitaMentionHit[], q: string): AttivitaMentionHit[] {
  const n = q.trim().toLowerCase();
  const list = !n
    ? items
    : items.filter(
        (i) =>
          i.label.toLowerCase().includes(n) ||
          (i.hint ?? "").toLowerCase().includes(n)
      );
  return list.slice(0, 40);
}

async function guardPn() {
  return requireAreaAccess("promemorie-e-note");
}

export function mapCollegamentoRow(
  r: Record<string, unknown>
): PnAttivitaCollegamento {
  return {
    id: String(r.id),
    kind: r.kind as AttivitaMentionKind,
    entityId: String(r.entity_id),
    entityLabel: String(r.entity_label ?? ""),
    token: String(r.token ?? ""),
    meta:
      r.meta && typeof r.meta === "object" && !Array.isArray(r.meta)
        ? (r.meta as Record<string, unknown>)
        : {},
  };
}

export async function loadCollegamentiByAttivitaIds(
  supabase: Supabase,
  ids: string[]
): Promise<Map<string, PnAttivitaCollegamento[]>> {
  const map = new Map<string, PnAttivitaCollegamento[]>();
  if (!ids.length) return map;
  const { data } = await supabase
    .from("pn_attivita_collegamenti")
    .select("id, attivita_id, kind, entity_id, entity_label, token, meta")
    .in("attivita_id", ids)
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const aid = String(r.attivita_id);
    const list = map.get(aid) ?? [];
    list.push(mapCollegamentoRow(r));
    map.set(aid, list);
  }
  return map;
}

export async function persistAttivitaCollegamenti(input: {
  supabase: Supabase;
  attivitaId: string;
  userId: string;
  descrizione: string;
  collegamenti: PnAttivitaCollegamento[];
}): Promise<PnAttivitaCollegamento[]> {
  const wanted = collegamentiStillInText(input.descrizione, input.collegamenti);
  const { data: existing } = await input.supabase
    .from("pn_attivita_collegamenti")
    .select("id, kind, entity_id")
    .eq("attivita_id", input.attivitaId)
    .is("deleted_at", null);
  const now = new Date().toISOString();
  const open = (existing ?? []) as Array<{
    id: string;
    kind: string;
    entity_id: string;
  }>;
  const wantedKeys = new Set(wanted.map((c) => `${c.kind}:${c.entityId}`));
  const toClose = open.filter(
    (r) => !wantedKeys.has(`${r.kind}:${r.entity_id}`)
  );
  if (toClose.length) {
    await input.supabase
      .from("pn_attivita_collegamenti")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
        updated_by: input.userId,
      })
      .in(
        "id",
        toClose.map((r) => r.id)
      );
  }
  const openKeys = new Set(open.map((r) => `${r.kind}:${r.entity_id}`));
  const toInsert = wanted.filter(
    (c) => !openKeys.has(`${c.kind}:${c.entityId}`)
  );
  if (toInsert.length) {
    await input.supabase.from("pn_attivita_collegamenti").insert(
      toInsert.map((c) => ({
        attivita_id: input.attivitaId,
        kind: c.kind,
        entity_id: c.entityId,
        entity_label: c.entityLabel,
        token: c.token,
        meta: c.meta ?? {},
        created_by: input.userId,
        updated_by: input.userId,
      }))
    );
  }
  const loaded = await loadCollegamentiByAttivitaIds(input.supabase, [
    input.attivitaId,
  ]);
  return loaded.get(input.attivitaId) ?? wanted;
}

export async function persistAttivitaMentions(input: {
  supabase: Supabase;
  attivitaId: string;
  userId: string;
  userIds: string[];
}): Promise<string[]> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  const { data: existing } = await input.supabase
    .from("pn_attivita_mentions")
    .select("id, user_id")
    .eq("attivita_id", input.attivitaId)
    .is("deleted_at", null);
  const open = (existing ?? []) as Array<{ id: string; user_id: string }>;
  const wanted = new Set(ids);
  const now = new Date().toISOString();
  const toClose = open.filter((r) => !wanted.has(r.user_id));
  if (toClose.length) {
    await input.supabase
      .from("pn_attivita_mentions")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
      })
      .in(
        "id",
        toClose.map((r) => r.id)
      );
  }
  const have = new Set(open.map((r) => r.user_id));
  const toInsert = ids.filter((id) => !have.has(id));
  if (toInsert.length) {
    await input.supabase.from("pn_attivita_mentions").insert(
      toInsert.map((user_id) => ({
        attivita_id: input.attivitaId,
        user_id,
        created_by: input.userId,
      }))
    );
  }
  return ids;
}

export function operatorIdsFromCollegamenti(
  collegamenti: PnAttivitaCollegamento[]
): string[] {
  return collegamenti
    .filter((c) => c.kind === "operatore")
    .map((c) => c.entityId);
}

export async function searchAttivitaMentionAction(input: unknown): Promise<
  | { success: true; items: AttivitaMentionHit[] }
  | { success: false; error: string }
> {
  await guardPn();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const q = sanitizeLike(parsed.data.q);
  const kind = parsed.data.kind;
  try {
    const items = await searchByKind(kind, q);
    return { success: true, items };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Ricerca non riuscita",
    };
  }
}

async function searchByKind(
  kind: AttivitaMentionKind,
  q: string
): Promise<AttivitaMentionHit[]> {
  const service = createServiceClient();
  const like = q ? `%${q}%` : null;

  if (kind === "operatore") {
    let query = service
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(80);
    if (like) {
      query = query.or(
        `full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => {
        const name =
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
          String(r.full_name ?? "").trim() ||
          String(r.email ?? "");
        return { id: r.id, label: name, hint: r.email };
      })
    ).slice(0, 40);
  }

  if (kind === "fornitore") {
    let query = service
      .from("fornitori")
      .select("id, ragione_sociale, partita_iva")
      .is("deleted_at", null)
      .order("ragione_sociale", { ascending: true })
      .limit(40);
    if (like) query = query.ilike("ragione_sociale", like);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.ragione_sociale,
        hint: r.partita_iva,
      }))
    );
  }

  if (kind === "rubrica") {
    let query = service
      .from("rubrica_contatti")
      .select("id, nome, cognome, azienda_label, email")
      .is("deleted_at", null)
      .order("cognome", { ascending: true })
      .limit(40);
    if (like) {
      query = query.or(
        `nome.ilike.${like},cognome.ilike.${like},azienda_label.ilike.${like},email.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.nome ?? ""} ${r.cognome ?? ""}`.trim(),
        hint: [r.azienda_label, r.email].filter(Boolean).join(" · "),
      }))
    );
  }

  if (kind === "materia_prima") {
    let query = service
      .from("materie_prime")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(40);
    if (like) query = query.or(`codice.ilike.${like},nome.ilike.${like}`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.nome,
        hint: r.codice,
      }))
    );
  }

  if (kind === "servizio") {
    let query = service
      .from("catalogo_servizi")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(40);
    if (like) query = query.or(`codice.ilike.${like},nome.ilike.${like}`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.nome,
        hint: r.codice,
      }))
    );
  }

  if (kind === "prodotto") {
    let query = service
      .from("catalogo_prodotti_fornitore")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(40);
    if (like) query = query.or(`codice.ilike.${like},nome.ilike.${like}`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.nome,
        hint: r.codice,
      }))
    );
  }

  if (kind === "prodotto_agrinsicilia") {
    let query = service
      .from("prodotti_propri")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(40);
    if (like) query = query.or(`codice.ilike.${like},nome.ilike.${like}`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.nome,
        hint: r.codice,
      }))
    );
  }

  if (kind === "cliente") {
    let query = service
      .from("clienti")
      .select("id, ragione_sociale, codice_targa")
      .is("deleted_at", null)
      .order("ragione_sociale", { ascending: true })
      .limit(40);
    if (like) {
      query = query.or(
        `ragione_sociale.ilike.${like},codice_targa.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.ragione_sociale,
        hint: r.codice_targa,
      }))
    );
  }

  if (kind === "cliente_possibile") {
    let query = service
      .from("clienti_possibili")
      .select("id, ragione_sociale")
      .is("deleted_at", null)
      .order("ragione_sociale", { ascending: true })
      .limit(40);
    if (like) query = query.ilike("ragione_sociale", like);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.ragione_sociale,
      }))
    );
  }

  if (kind === "preventivo") {
    let query = service
      .from("preventivi")
      .select("id, numero_interno, cliente_ragione_sociale")
      .is("deleted_at", null)
      .order("data_preventivo", { ascending: false })
      .limit(40);
    if (like) {
      query = query.or(
        `numero_interno.ilike.${like},cliente_ragione_sociale.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.numero_interno,
        hint: r.cliente_ragione_sociale,
      }))
    );
  }

  if (kind === "ordine") {
    let query = service
      .from("ordini")
      .select("id, numero_interno, cliente_ragione_sociale, stato")
      .is("deleted_at", null)
      .order("data_ordine", { ascending: false })
      .limit(40);
    if (like) {
      query = query.or(
        `numero_interno.ilike.${like},cliente_ragione_sociale.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.numero_interno,
        hint: `${r.cliente_ragione_sociale ?? ""} · ${r.stato ?? ""}`.trim(),
      }))
    );
  }

  if (kind === "campionatura") {
    let query = service
      .from("campionature")
      .select("id, numero_interno, cliente_ragione_sociale")
      .is("deleted_at", null)
      .order("data_invio", { ascending: false })
      .limit(40);
    if (like) {
      query = query.or(
        `numero_interno.ilike.${like},cliente_ragione_sociale.ilike.${like}`
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return asHits(
      (data ?? []).map((r) => ({
        id: r.id,
        label: r.numero_interno,
        hint: r.cliente_ragione_sociale,
      }))
    );
  }

  return [];
}

export async function searchAttivitaMentionMailsAction(input: {
  q?: string;
}): Promise<
  | { success: true; items: AttivitaMentionHit[] }
  | { success: false; error: string }
> {
  await guardPn();
  const auth = await getAuthContext();
  if (!auth || !userCanAccessArea(auth.areas, "webmail")) {
    return { success: false, error: "Serve l’accesso Webmail per collegare una mail." };
  }
  const q = sanitizeLike(input.q ?? "");
  const service = createServiceClient();
  let query = service
    .from("webmail_messaggi")
    .select("id, subject, from_address, account_id, received_at")
    .order("received_at", { ascending: false })
    .limit(40);
  if (q) {
    query = query.or(`subject.ilike.%${q}%,from_address.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      entityId: String(r.id),
      label: String(r.subject || "(senza oggetto)"),
      hint: String(r.from_address || ""),
      meta: { accountId: r.account_id },
    })),
  };
}

export async function searchAttivitaMentionAziendeAction(input: {
  kind: "cliente" | "cliente_possibile";
  q?: string;
}): Promise<
  | { success: true; items: AttivitaMentionHit[] }
  | { success: false; error: string }
> {
  return searchAttivitaMentionAction({
    kind: input.kind,
    q: input.q ?? "",
  });
}

export type MentionCasella = {
  key: string;
  label: string;
  email: string;
  accountId: string | null;
};

function pushEmail(
  out: MentionCasella[],
  seen: Set<string>,
  email: string,
  label: string,
  accountId: string | null = null
) {
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@") || seen.has(e)) return;
  seen.add(e);
  out.push({
    key: e,
    label: label.trim() || e,
    email: e,
    accountId,
  });
}

export async function listAttivitaMentionCaselleAction(input: {
  aziendaTipo: "cliente" | "cliente_possibile";
  aziendaId: string;
}): Promise<
  { success: true; items: MentionCasella[] } | { success: false; error: string }
> {
  await guardPn();
  const parsed = z
    .object({
      aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
      aziendaId: z.string().uuid(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Azienda non valida" };
  }
  const service = createServiceClient();
  const items: MentionCasella[] = [];
  const seen = new Set<string>();

  if (parsed.data.aziendaTipo === "cliente") {
    const { data } = await service
      .from("clienti")
      .select("ragione_sociale, email, pec, email_generiche")
      .eq("id", parsed.data.aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      const name = String(data.ragione_sociale ?? "Azienda");
      pushEmail(items, seen, String(data.email ?? ""), `${name} (email)`);
      pushEmail(items, seen, String(data.pec ?? ""), `${name} (PEC)`);
      for (const extra of data.email_generiche ?? []) {
        pushEmail(items, seen, String(extra), `${name} (altra)`);
      }
    }
  } else {
    const { data } = await service
      .from("clienti_possibili")
      .select("ragione_sociale, email, pec, email_generiche")
      .eq("id", parsed.data.aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      const name = String(data.ragione_sociale ?? "Azienda");
      pushEmail(items, seen, String(data.email ?? ""), `${name} (email)`);
      pushEmail(items, seen, String(data.pec ?? ""), `${name} (PEC)`);
      for (const extra of data.email_generiche ?? []) {
        pushEmail(items, seen, String(extra), `${name} (altra)`);
      }
    }
  }

  const { data: refs } = await service
    .from("rubrica_contatti")
    .select("nome, cognome, email")
    .eq("azienda_tipo", parsed.data.aziendaTipo)
    .eq("azienda_id", parsed.data.aziendaId)
    .is("deleted_at", null)
    .limit(80);
  for (const r of refs ?? []) {
    const nome = `${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "Referente";
    pushEmail(items, seen, String(r.email ?? ""), nome);
  }

  const { data: accounts } = await service
    .from("webmail_accounts")
    .select("id, label, email_address")
    .is("deleted_at", null);
  for (const a of accounts ?? []) {
    const email = String(a.email_address ?? "").toLowerCase();
    if (!email) continue;
    const hit = items.find((i) => i.email === email);
    if (hit) {
      hit.accountId = String(a.id);
      hit.label = `${hit.label} · casella ${a.label || email}`;
    }
  }

  return { success: true, items };
}

export async function listAttivitaMentionMailsByCasellaAction(input: {
  email: string;
  accountId?: string | null;
}): Promise<
  | { success: true; items: AttivitaMentionHit[] }
  | { success: false; error: string }
> {
  await guardPn();
  const email = sanitizeLike(input.email).toLowerCase();
  if (!email.includes("@")) {
    return { success: false, error: "Email casella non valida" };
  }
  const service = createServiceClient();
  let query = service
    .from("webmail_messaggi")
    .select("id, subject, from_address, to_addresses, account_id, received_at")
    .order("received_at", { ascending: false })
    .limit(60);
  if (input.accountId) {
    query = query.eq("account_id", input.accountId);
  } else {
    query = query.or(
      `from_address.ilike.%${email}%,to_addresses.cs.{"${email}"}`
    );
  }
  const { data, error } = await query;
  if (error) {
    const fallback = await service
      .from("webmail_messaggi")
      .select("id, subject, from_address, account_id, received_at")
      .ilike("from_address", `%${email}%`)
      .order("received_at", { ascending: false })
      .limit(60);
    if (fallback.error) return { success: false, error: fallback.error.message };
    return {
      success: true,
      items: (fallback.data ?? []).map((r) => ({
        entityId: String(r.id),
        label: String(r.subject || "(senza oggetto)"),
        hint: String(r.from_address || ""),
        meta: { accountId: r.account_id, email },
      })),
    };
  }
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      entityId: String(r.id),
      label: String(r.subject || "(senza oggetto)"),
      hint: String(r.from_address || ""),
      meta: { accountId: r.account_id, email },
    })),
  };
}

export async function auditCollegamentiChange(input: {
  attivitaId: string;
  userId: string;
  titolo: string;
  collegamenti: PnAttivitaCollegamento[];
  action: "create" | "update";
}) {
  await writeAuditLog({
    entity_type: "pn_attivita",
    entity_id: input.attivitaId,
    action: input.action,
    actor_id: input.userId,
    summary:
      input.action === "create"
        ? `Attività: ${input.titolo}`
        : `Attività aggiornata: ${input.titolo}`,
    payload: {
      collegamenti: input.collegamenti.map((c) => ({
        kind: c.kind,
        entity_id: c.entityId,
        token: c.token,
        prefix: specForKind(c.kind).prefix,
      })),
    },
  });
}

export { filterHits };
