"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import {
  codiceMansioneFromNome,
  mansioniAffini,
  normalizeMansioneNome,
} from "@/lib/rubrica/mansioni-affinita";
import {
  createRubricaContattoSchema,
  createRubricaMansioneSchema,
  createRubricaTimelineSchema,
  type RubricaAziendaTipo,
  type RubricaContatto,
  type RubricaMansione,
  type RubricaModalita,
  type RubricaTimelineItem,
} from "@/lib/rubrica/types";
import { resolveScopeMode } from "@/lib/auth/data-scope-enforce";
import { resolveWebmailAccountVisibility } from "@/lib/webmail/account-access";
import { createClient } from "@/lib/supabase/server";

async function guard() {
  return requireAreaAccess("amministrazione");
}

async function guardRubricaAnagrafica() {
  return requireAnyAreaAccess([
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
}

const CONTATTO_SELECT =
  "id, nome, cognome, telefono, email, rapporto, azienda_tipo, azienda_id, azienda_label, mansione_id, mansione, note, created_at, updated_at";

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
    mansioneId: r.mansione_id ? String(r.mansione_id) : null,
    mansione: String(r.mansione ?? ""),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapMansione(r: Record<string, unknown>): RubricaMansione {
  return {
    id: String(r.id),
    codice: String(r.codice ?? ""),
    nome: String(r.nome ?? ""),
    documentoStato: r.documento_stato === "bozza" ? "bozza" : "approvato",
    versione: Number(r.versione ?? 1),
  };
}

async function resolveMansione(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mansioneId: string | null | undefined,
  mansioneNome: string
): Promise<{ id: string | null; nome: string }> {
  if (mansioneId) {
    const { data } = await supabase
      .from("rubrica_mansioni")
      .select("id, nome")
      .eq("id", mansioneId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      return { id: String(data.id), nome: String(data.nome) };
    }
  }
  const nome = mansioneNome.trim();
  if (!nome) return { id: null, nome: "" };
  const { data } = await supabase
    .from("rubrica_mansioni")
    .select("id, nome")
    .is("deleted_at", null)
    .ilike("nome", nome)
    .maybeSingle();
  if (data) return { id: String(data.id), nome: String(data.nome) };
  return { id: null, nome };
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

export async function listRubricaMansioniAction(): Promise<
  { success: true; items: RubricaMansione[] } | { success: false; error: string }
> {
  await guardRubricaAnagrafica();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_mansioni")
    .select("id, codice, nome, documento_stato, versione")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => mapMansione(r as Record<string, unknown>)),
  };
}

export async function createRubricaMansioneAction(input: unknown): Promise<
  | { success: true; item: RubricaMansione }
  | {
      success: false;
      error: string;
      affini?: Array<{ id: string; nome: string; affinita: number }>;
    }
> {
  const { auth } = await guardRubricaAnagrafica();
  const parsed = createRubricaMansioneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Nome mansione non valido.",
    };
  }
  const nome = parsed.data.nome.trim();
  const supabase = await createClient();
  const { data: esistenti, error: listErr } = await supabase
    .from("rubrica_mansioni")
    .select("id, codice, nome")
    .is("deleted_at", null);
  if (listErr) return { success: false, error: listErr.message };
  const catalog = (esistenti ?? []) as Array<{
    id: string;
    codice: string;
    nome: string;
  }>;
  const exact = catalog.find(
    (m) => normalizeMansioneNome(m.nome) === normalizeMansioneNome(nome)
  );
  if (exact) {
    return {
      success: false,
      error: "Questa mansione è già in elenco.",
      affini: [{ id: exact.id, nome: exact.nome, affinita: 100 }],
    };
  }
  const affini = mansioniAffini(nome, catalog);
  if (affini.length > 0 && !parsed.data.confermaAffinita) {
    return {
      success: false,
      error: "Ci sono mansioni con affinità maggiore del 75%.",
      affini,
    };
  }

  let codice = codiceMansioneFromNome(nome);
  if (catalog.some((m) => m.codice.toLowerCase() === codice)) {
    codice = `${codice}-${crypto.randomUUID().slice(0, 4)}`;
  }

  const { data, error } = await supabase
    .from("rubrica_mansioni")
    .insert({
      codice,
      nome,
      documento_stato: "approvato",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice, nome, documento_stato, versione")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Mansione non salvata." };
  }
  const item = mapMansione(data as Record<string, unknown>);
  await writeAuditLog({
    entity_type: "rubrica_mansioni",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Rubrica mansione: ${item.nome}`,
    payload: { codice: item.codice, conferma_affinita: parsed.data.confermaAffinita },
  });
  return { success: true, item };
}

export async function listRubricaContattiAction(input?: {
  query?: string;
  mansioneId?: string | null;
  senzaMansione?: boolean;
  skipScope?: boolean;
}): Promise<
  { success: true; items: RubricaContatto[] } | { success: false; error: string }
> {
  await guardRubricaAnagrafica();
  const supabase = await createClient();
  const scope = input?.skipScope
    ? null
    : await resolveScopeMode("anagrafiche_clienti");
  let q = supabase
    .from("rubrica_contatti")
    .select(CONTATTO_SELECT)
    .is("deleted_at", null);
  if (scope && !scope.skip && scope.mode === "proprie") {
    q = q.eq("created_by", scope.userId);
  }
  if (input?.mansioneId) {
    q = q.eq("mansione_id", input.mansioneId);
  } else if (input?.senzaMansione) {
    q = q.is("mansione_id", null);
  }
  q = q
    .order("cognome", { ascending: true })
    .order("nome", { ascending: true })
    .limit(500);
  const query = input?.query?.trim();
  if (query) {
    q = q.or(
      `nome.ilike.%${query}%,cognome.ilike.%${query}%,email.ilike.%${query}%,telefono.ilike.%${query}%,azienda_label.ilike.%${query}%,mansione.ilike.%${query}%`
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
  const { auth } = await guardRubricaAnagrafica();
  const parsed = createRubricaContattoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const d = parsed.data;
  const aziendaTipo = d.aziendaTipo ?? "nessuna";
  let aziendaId = d.aziendaId ?? null;
  let aziendaLabel = d.aziendaLabel ?? "";

  if (aziendaTipo === "nessuna") {
    aziendaId = null;
    aziendaLabel = "";
  } else if (aziendaTipo === "agrinsicilia") {
    aziendaId = null;
    if (!aziendaLabel.trim()) aziendaLabel = "Agrinsicilia";
  } else if (aziendaId) {
    // collegato: ok, mansione resta facoltativa
  } else if (!aziendaLabel.trim()) {
    // tipo scelto ma azienda non ancora selezionata → permesso (completa dopo)
    aziendaId = null;
  }

  const supabase = await createClient();
  const mansione = await resolveMansione(
    supabase,
    d.mansioneId,
    d.mansione ?? ""
  );
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .insert({
      nome: d.nome,
      cognome: d.cognome,
      telefono: d.telefono,
      email: d.email ?? "",
      rapporto: d.rapporto,
      azienda_tipo: aziendaTipo,
      azienda_id: aziendaId,
      azienda_label: aziendaLabel,
      mansione_id: mansione.id,
      mansione: mansione.nome,
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
  if (aziendaTipo === "fornitore" && aziendaId) {
    await supabase.from("fornitori_referenti").insert({
      fornitore_id: aziendaId,
      contatto_id: item.id,
      created_by: auth.userId,
    });
  } else if (aziendaTipo === "cliente" && aziendaId) {
    await supabase.from("clienti_referenti").insert({
      cliente_id: aziendaId,
      contatto_id: item.id,
      created_by: auth.userId,
    });
  } else if (aziendaTipo === "cliente_possibile" && aziendaId) {
    await supabase.from("clienti_possibili_referenti").insert({
      cliente_possibile_id: aziendaId,
      contatto_id: item.id,
      created_by: auth.userId,
    });
  }
  await writeAuditLog({
    entity_type: "rubrica_contatti",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Rubrica: ${item.nome} ${item.cognome}`,
    payload: {
      azienda_tipo: item.aziendaTipo,
      mansione_id: item.mansioneId,
    },
  });
  return { success: true, item };
}

export async function listAziendeRubricaPickerAction(
  tipo: RubricaAziendaTipo
): Promise<
  | { success: true; items: { id: string; label: string }[] }
  | { success: false; error: string }
> {
  await guardRubricaAnagrafica();
  if (tipo === "nessuna") {
    return { success: true, items: [] };
  }
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
  const { auth } = await guard();
  const vis = await resolveWebmailAccountVisibility(auth);
  if (vis.mode === "granted" && vis.ids.length === 0) {
    return { success: true, items: [] };
  }
  const supabase = await createClient();
  let q = supabase
    .from("webmail_messaggi")
    .select("id, subject, from_address, received_at")
    .order("received_at", { ascending: false })
    .limit(40);
  if (vis.mode === "granted") q = q.in("account_id", vis.ids);
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

export type EntityReferentiTipo =
  | "cliente"
  | "fornitore"
  | "cliente_possibile";

function junctionFor(tipo: EntityReferentiTipo) {
  if (tipo === "cliente") {
    return {
      table: "clienti_referenti" as const,
      fk: "cliente_id" as const,
      aziendaTipo: "cliente" as const,
    };
  }
  if (tipo === "fornitore") {
    return {
      table: "fornitori_referenti" as const,
      fk: "fornitore_id" as const,
      aziendaTipo: "fornitore" as const,
    };
  }
  return {
    table: "clienti_possibili_referenti" as const,
    fk: "cliente_possibile_id" as const,
    aziendaTipo: "cliente_possibile" as const,
  };
}

export async function listEntityReferentiAction(input: {
  tipo: EntityReferentiTipo;
  entityId: string;
}): Promise<
  { success: true; items: RubricaContatto[] } | { success: false; error: string }
> {
  await guard();
  const j = junctionFor(input.tipo);
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from(j.table)
    .select("contatto_id")
    .eq(j.fk, input.entityId);
  if (error) return { success: false, error: error.message };
  const ids = (links ?? []).map((r) => String(r.contatto_id));
  if (ids.length === 0) return { success: true, items: [] };
  const { data: contatti, error: e3 } = await supabase
    .from("rubrica_contatti")
    .select(CONTATTO_SELECT)
    .in("id", ids)
    .is("deleted_at", null);
  if (e3) return { success: false, error: e3.message };
  return {
    success: true,
    items: (contatti ?? []).map((r) =>
      mapContatto(r as Record<string, unknown>)
    ),
  };
}

/** Sostituisce i referenti collegati all’anagrafica e aggiorna azienda sul contatto. */
export async function syncEntityReferentiAction(input: {
  tipo: EntityReferentiTipo;
  entityId: string;
  entityLabel: string;
  contattoIds: string[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const j = junctionFor(input.tipo);
  const ids = [...new Set(input.contattoIds.filter(Boolean))];
  const supabase = await createClient();

  const { error: delErr } = await supabase
    .from(j.table)
    .delete()
    .eq(j.fk, input.entityId);
  if (delErr) return { success: false, error: delErr.message };

  if (ids.length > 0) {
    const { error: insErr } = await supabase.from(j.table).insert(
      ids.map((contatto_id) => ({
        [j.fk]: input.entityId,
        contatto_id,
        created_by: auth.userId,
      }))
    );
    if (insErr) return { success: false, error: insErr.message };

    await supabase
      .from("rubrica_contatti")
      .update({
        azienda_tipo: j.aziendaTipo,
        azienda_id: input.entityId,
        azienda_label: input.entityLabel,
        updated_by: auth.userId,
      })
      .in("id", ids)
      .is("deleted_at", null);
  }

  await writeAuditLog({
    entity_type: j.table,
    entity_id: input.entityId,
    action: "sync_referenti",
    actor_id: auth.userId,
    summary: `Referenti ${input.tipo}: ${ids.length}`,
    payload: { contatto_ids: ids },
  });
  return { success: true };
}

/** Aggiunge un referente all’anagrafica senza sostituire gli altri. */
export async function linkEntityReferenteAction(input: {
  tipo: EntityReferentiTipo;
  entityId: string;
  entityLabel: string;
  contattoId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const j = junctionFor(input.tipo);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from(j.table)
    .select("contatto_id")
    .eq(j.fk, input.entityId)
    .eq("contatto_id", input.contattoId)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from(j.table).insert({
      [j.fk]: input.entityId,
      contatto_id: input.contattoId,
      created_by: auth.userId,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      return { success: false, error: error.message };
    }
  }
  await supabase
    .from("rubrica_contatti")
    .update({
      azienda_tipo: j.aziendaTipo,
      azienda_id: input.entityId,
      azienda_label: input.entityLabel,
      updated_by: auth.userId,
    })
    .eq("id", input.contattoId)
    .is("deleted_at", null);
  return { success: true };
}
