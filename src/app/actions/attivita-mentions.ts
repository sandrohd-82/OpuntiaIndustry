"use server";

import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  ATTIVITA_MENTION_KINDS,
  type AttivitaMentionHit,
  type AttivitaMentionKind,
} from "@/lib/promemorie-e-note/mention-tokens";
import type { PnNotaAllegato } from "@/lib/promemorie-e-note/types";
import { createServiceClient } from "@/lib/supabase/server";
import { WEBMAIL_ALLEGATI_BUCKET } from "@/lib/webmail/html-render";
import { z } from "zod";

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

async function guardMention() {
  return requireAnyAreaAccess([
    "promemorie-e-note",
    "amministrazione",
    "commerciale",
  ]);
}

export async function searchAttivitaMentionAction(input: unknown): Promise<
  | { success: true; items: AttivitaMentionHit[] }
  | { success: false; error: string }
> {
  await guardMention();
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
  await guardMention();
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
  await guardMention();
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
  await guardMention();
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

export async function loadWebmailAllegatiPerNotaAction(
  messaggioId: string
): Promise<
  | { success: true; allegati: PnNotaAllegato[]; subject: string }
  | { success: false; error: string }
> {
  await guardMention();
  if (!z.string().uuid().safeParse(messaggioId).success) {
    return { success: false, error: "Mail non valida." };
  }
  const service = createServiceClient();
  const { data: msg } = await service
    .from("webmail_messaggi")
    .select("id, subject")
    .eq("id", messaggioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!msg) return { success: false, error: "Mail non trovata." };

  const { data: rows, error } = await service
    .from("webmail_messaggi_allegati")
    .select(
      "id, filename, mime_type, is_inline, storage_bucket, storage_path"
    )
    .eq("messaggio_id", messaggioId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const allegati: PnNotaAllegato[] = [];
  for (const r of rows ?? []) {
    if (r.is_inline) continue;
    const path = String(r.storage_path ?? "").trim();
    if (!path) continue;
    const bucket = String(r.storage_bucket || WEBMAIL_ALLEGATI_BUCKET);
    const { data: signed } = await service.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    const mime = String(r.mime_type ?? "").toLowerCase();
    const kind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.includes("pdf")
          ? "pdf"
          : "doc";
    allegati.push({
      id: String(r.id),
      kind,
      label: String(r.filename || "Allegato"),
      url: (signed?.signedUrl ?? "").slice(0, 2000),
      storagePath: path,
    });
  }
  return {
    success: true,
    allegati,
    subject: String(msg.subject ?? ""),
  };
}
