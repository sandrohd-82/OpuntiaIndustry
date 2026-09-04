"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { slugPosto } from "@/lib/produzione/aree-posti";
import {
  eventoLineaCatalogoInputSchema,
  eventoLineaLabel,
  macchinarioInputSchema,
  macchinarioStatoSchema,
  normalizeIotStato,
  ricambioInputSchema,
  type AttivitaOrigine,
  type EventoLinea,
  type EventoLineaCatalogo,
  type EventoLineaMacchina,
  type EventoLineaTipo,
  type MacchinarioAttivita,
  type MacchinarioRicambio,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";
import { createClient } from "@/lib/supabase/server";

type MacchinaRow = {
  id: string;
  area_id: string;
  codice: string;
  nome: string;
  descrizione: string;
  iot_collegato: boolean;
  stato_iot: ProduzioneMacchinario["statoIot"];
  stato_note: string;
  stato_at: string | null;
  attivo: boolean;
  sort_order: number;
  note: string;
};

type RicambioRow = {
  id: string;
  macchinario_id: string;
  articolo: string;
  nome_dettaglio: string;
  azienda_venditrice: string;
  presente: boolean;
  scaffale: string;
  quantita: number;
  unita: string;
  soglia_minima: number;
  note: string;
};

function mapMacchina(row: MacchinaRow): ProduzioneMacchinario {
  return {
    id: row.id,
    areaId: row.area_id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    iotCollegato: Boolean(row.iot_collegato),
    statoIot: row.stato_iot,
    statoNote: row.stato_note ?? "",
    statoAt: row.stato_at,
    attivo: Boolean(row.attivo),
    sortOrder: row.sort_order ?? 0,
    note: row.note ?? "",
  };
}

function mapRicambio(row: RicambioRow): MacchinarioRicambio {
  return {
    id: row.id,
    macchinarioId: row.macchinario_id,
    articolo: row.articolo,
    nomeDettaglio: row.nome_dettaglio,
    aziendaVenditrice: row.azienda_venditrice ?? "",
    presente: Boolean(row.presente),
    scaffale: row.scaffale ?? "",
    quantita: row.quantita ?? 0,
    unita: row.unita || "pz",
    sogliaMinima: row.soglia_minima ?? 0,
    note: row.note ?? "",
  };
}

const MACCHINA_COLS =
  "id, area_id, codice, nome, descrizione, iot_collegato, stato_iot, stato_note, stato_at, attivo, sort_order, note";
const RICAMBIO_COLS =
  "id, macchinario_id, articolo, nome_dettaglio, azienda_venditrice, presente, scaffale, quantita, unita, soglia_minima, note";

export async function listMacchinariByAreaIdsAction(
  areaIds: string[]
): Promise<
  | { success: true; items: ProduzioneMacchinario[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  if (!areaIds.length) return { success: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_macchinari")
    .select(MACCHINA_COLS)
    .is("deleted_at", null)
    .in("area_id", areaIds)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: ((data ?? []) as MacchinaRow[]).map(mapMacchina) };
}

export async function createMacchinarioAction(
  raw: unknown
): Promise<
  { success: true; item: ProduzioneMacchinario } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = macchinarioInputSchema.safeParse({
    ...(raw as object),
    codice: slugPosto(String((raw as { codice?: string })?.codice ?? "")),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_macchinari")
    .insert({
      area_id: v.areaId,
      codice: v.codice.toLowerCase(),
      nome: v.nome.trim(),
      descrizione: v.descrizione ?? "",
      iot_collegato: v.iotCollegato ?? false,
      stato_iot: v.iotCollegato ? "spento" : "no_iot",
      sort_order: v.sortOrder ?? 100,
      note: v.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(MACCHINA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito" };
  }
  const item = mapMacchina(data as MacchinaRow);
  await writeAuditLog({
    entity_type: "produzione_macchinari",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato macchinario ${item.codice}`,
    payload: { area_id: item.areaId, nome: item.nome },
  });
  return { success: true, item };
}

export async function updateMacchinarioStatoAction(
  id: string,
  raw: unknown
): Promise<
  { success: true; item: ProduzioneMacchinario } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = macchinarioStatoSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Stato non valido" };
  }
  const statoIot = normalizeIotStato(parsed.data.iotCollegato, parsed.data.statoIot);
  if (statoIot === "arresto" && !parsed.data.statoNote.trim()) {
    return { success: false, error: "In arresto per problema: indica la causa (non conformità)." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_macchinari")
    .update({
      iot_collegato: parsed.data.iotCollegato,
      stato_iot: statoIot,
      stato_note: parsed.data.statoNote ?? "",
      stato_at: new Date().toISOString(),
      stato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(MACCHINA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento stato fallito" };
  }
  const item = mapMacchina(data as MacchinaRow);
  await writeAuditLog({
    entity_type: "produzione_macchinari",
    entity_id: item.id,
    action: "stato_iot",
    actor_id: auth.userId,
    summary: `Stato ${item.nome}: ${item.statoIot}`,
    payload: {
      iot_collegato: item.iotCollegato,
      stato_iot: item.statoIot,
      stato_note: item.statoNote,
    },
  });
  return { success: true, item };
}

export async function listRicambiAction(
  macchinarioId: string
): Promise<
  { success: true; items: MacchinarioRicambio[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_macchinario_ricambi")
    .select(RICAMBIO_COLS)
    .eq("macchinario_id", macchinarioId)
    .is("deleted_at", null)
    .order("articolo", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: ((data ?? []) as RicambioRow[]).map(mapRicambio) };
}

export async function upsertRicambioAction(
  raw: unknown,
  id?: string
): Promise<
  { success: true; item: MacchinarioRicambio } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = ricambioInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const v = parsed.data;
  if (v.presente && v.quantita <= 0) {
    return { success: false, error: "Se il ricambio è presente, indica i pezzi in scaffale." };
  }
  if (v.presente && !v.scaffale.trim()) {
    return { success: false, error: "Se il ricambio è presente, indica lo scaffale." };
  }
  const supabase = await createClient();
  const payload = {
    macchinario_id: v.macchinarioId,
    articolo: v.articolo.trim(),
    nome_dettaglio: v.nomeDettaglio.trim(),
    azienda_venditrice: v.aziendaVenditrice ?? "",
    presente: v.presente,
    scaffale: v.presente ? v.scaffale ?? "" : "",
    quantita: v.presente ? v.quantita : 0,
    unita: v.unita || "pz",
    soglia_minima: v.sogliaMinima ?? 0,
    note: v.note ?? "",
    updated_by: auth.userId,
  };
  if (id) {
    const { data, error } = await supabase
      .from("produzione_macchinario_ricambi")
      .update(payload)
      .eq("id", id)
      .is("deleted_at", null)
      .select(RICAMBIO_COLS)
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento ricambio fallito" };
    }
    await writeAuditLog({
      entity_type: "produzione_macchinario_ricambi",
      entity_id: id,
      action: "update",
      actor_id: auth.userId,
      summary: `Aggiornato ricambio ${v.articolo}`,
      payload: { presente: v.presente, quantita: payload.quantita },
    });
    return { success: true, item: mapRicambio(data as RicambioRow) };
  }
  const { data, error } = await supabase
    .from("produzione_macchinario_ricambi")
    .insert({ ...payload, created_by: auth.userId })
    .select(RICAMBIO_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio ricambio fallito" };
  }
  const item = mapRicambio(data as RicambioRow);
  await writeAuditLog({
    entity_type: "produzione_macchinario_ricambi",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato ricambio ${item.articolo}`,
  });
  return { success: true, item };
}

export async function softDeleteRicambioAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_macchinario_ricambi")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "produzione_macchinario_ricambi",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete ricambio",
  });
  return { success: true };
}

function actorNome(auth: { profile: { full_name?: string | null; email?: string } }): string {
  return auth.profile.full_name?.trim() || auth.profile.email || "Operatore";
}

async function confirmEventoOffAndMaybeClose(input: {
  areaId: string;
  macchinarioId: string;
  eventoLineaId?: string | null;
  viaIot: boolean;
  actorId: string;
  now: string;
}) {
  const supabase = await createClient();
  let eventoId = input.eventoLineaId ?? null;
  if (!eventoId) {
    const aperto = await getEventoLineaApertoAction(input.areaId);
    if (aperto.success && aperto.evento) eventoId = aperto.evento.id;
  }
  if (!eventoId) return;
  await supabase
    .from("produzione_evento_linea_macchine")
    .update({
      confermato_at: input.now,
      confermato_by: input.actorId,
      via_iot: input.viaIot,
    })
    .eq("evento_id", eventoId)
    .eq("macchinario_id", input.macchinarioId)
    .is("confermato_at", null);
  const loaded = await loadEventoLinea(eventoId);
  if (
    loaded.success &&
    loaded.evento.documentoStato === "in_corso" &&
    loaded.evento.macchine.every((m) => !m.richiesto || m.confermatoAt)
  ) {
    await closeEventoLineaAction(eventoId);
  }
}

async function insertAttivita(input: {
  macchinarioId: string;
  areaId: string;
  azione: "on" | "off";
  origine: AttivitaOrigine;
  eventoLineaId?: string | null;
  actorId: string;
  actorNome: string;
  note: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("produzione_macchinario_attivita").insert({
    macchinario_id: input.macchinarioId,
    area_id: input.areaId,
    azione: input.azione,
    origine: input.origine,
    evento_linea_id: input.eventoLineaId ?? null,
    actor_nome: input.actorNome,
    note: input.note,
    created_by: input.actorId,
  });
  return error;
}

export async function setMacchinaPowerAction(input: {
  macchinarioId: string;
  on: boolean;
  origine: AttivitaOrigine;
  eventoLineaId?: string | null;
}): Promise<
  { success: true; item: ProduzioneMacchinario } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: current, error: cErr } = await supabase
    .from("produzione_macchinari")
    .select(MACCHINA_COLS)
    .eq("id", input.macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cErr || !current) {
    return { success: false, error: cErr?.message ?? "Macchina non trovata." };
  }
  const prev = mapMacchina(current as MacchinaRow);
  const nextStato = input.on ? "acceso" : "spento";
  const now = new Date().toISOString();
  if (prev.statoIot === nextStato) {
    if (!input.on) {
      await confirmEventoOffAndMaybeClose({
        areaId: prev.areaId,
        macchinarioId: prev.id,
        eventoLineaId: input.eventoLineaId,
        viaIot: prev.iotCollegato,
        actorId: auth.userId,
        now,
      });
    }
    return { success: true, item: prev };
  }

  const note = prev.iotCollegato
    ? input.on
      ? "Comando On (IoT: invio previsto)."
      : "Comando Off (IoT: invio previsto)."
    : input.on
      ? "Dichiarato On dall’operatore."
      : "Dichiarato Off dall’operatore.";

  const { data, error } = await supabase
    .from("produzione_macchinari")
    .update({
      stato_iot: nextStato,
      stato_note: input.on ? "" : prev.statoNote,
      stato_at: now,
      stato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", input.macchinarioId)
    .is("deleted_at", null)
    .select(MACCHINA_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento On/Off fallito." };
  }
  const item = mapMacchina(data as MacchinaRow);

  const aErr = await insertAttivita({
    macchinarioId: item.id,
    areaId: item.areaId,
    azione: input.on ? "on" : "off",
    origine: input.origine,
    eventoLineaId: input.eventoLineaId,
    actorId: auth.userId,
    actorNome: actorNome(auth),
    note,
  });
  if (aErr) console.error("[attivita]", aErr.message);

  if (!input.on) {
    await confirmEventoOffAndMaybeClose({
      areaId: item.areaId,
      macchinarioId: item.id,
      eventoLineaId: input.eventoLineaId,
      viaIot: prev.iotCollegato,
      actorId: auth.userId,
      now,
    });
  }

  await writeAuditLog({
    entity_type: "produzione_macchinari",
    entity_id: item.id,
    action: input.on ? "power_on" : "power_off",
    actor_id: auth.userId,
    summary: `${input.on ? "On" : "Off"} ${item.nome} (${actorNome(auth)})`,
    payload: { origine: input.origine, iot: prev.iotCollegato },
  });
  return { success: true, item };
}

export async function listMacchinaAttivitaAction(
  macchinarioId: string
): Promise<
  { success: true; items: MacchinarioAttivita[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_macchinario_attivita")
    .select("id, macchinario_id, azione, origine, actor_nome, note, created_at")
    .eq("macchinario_id", macchinarioId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      macchinario_id: string;
      azione: MacchinarioAttivita["azione"];
      origine: MacchinarioAttivita["origine"];
      actor_nome: string;
      note: string;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      macchinarioId: r.macchinario_id,
      azione: r.azione,
      origine: r.origine,
      actorNome: r.actor_nome,
      note: r.note,
      createdAt: r.created_at,
    })),
  };
}

export async function getEventoLineaApertoAction(
  areaId: string
): Promise<
  { success: true; evento: EventoLinea | null } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_eventi_linea")
    .select("id")
    .eq("area_id", areaId)
    .eq("documento_stato", "in_corso")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, evento: null };
  return loadEventoLinea((data as { id: string }).id);
}

async function loadEventoLinea(
  eventoId: string
): Promise<
  { success: true; evento: EventoLinea } | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: ev, error } = await supabase
    .from("produzione_eventi_linea")
    .select(
      "id, area_id, tipo, catalogo_id, documento_stato, note, started_at, started_by, closed_at"
    )
    .eq("id", eventoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !ev) {
    return { success: false, error: error?.message ?? "Evento non trovato." };
  }
  const row = ev as {
    id: string;
    area_id: string;
    tipo: EventoLineaTipo;
    catalogo_id: string | null;
    documento_stato: EventoLinea["documentoStato"];
    note: string;
    started_at: string;
    started_by: string | null;
    closed_at: string | null;
  };
  let startedByNome = "";
  if (row.started_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", row.started_by)
      .maybeSingle();
    const p = profile as { full_name?: string | null; email?: string } | null;
    startedByNome = p?.full_name?.trim() || p?.email || "";
  }
  let tipoNome = eventoLineaLabel(row.tipo);
  let richiedeSpegnimento = true;
  if (row.catalogo_id) {
    const { data: cat } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .select("nome, richiede_spegnimento")
      .eq("id", row.catalogo_id)
      .maybeSingle();
    const c = cat as { nome?: string; richiede_spegnimento?: boolean } | null;
    if (c?.nome) tipoNome = c.nome;
    if (typeof c?.richiede_spegnimento === "boolean") {
      richiedeSpegnimento = c.richiede_spegnimento;
    }
  }
  const { data: righe, error: rErr } = await supabase
    .from("produzione_evento_linea_macchine")
    .select("id, macchinario_id, richiesto, confermato_at, via_iot")
    .eq("evento_id", eventoId);
  if (rErr) return { success: false, error: rErr.message };
  const ids = ((righe ?? []) as Array<{ macchinario_id: string }>).map(
    (r) => r.macchinario_id
  );
  const macchineById = new Map<string, ProduzioneMacchinario>();
  if (ids.length) {
    const { data: macs } = await supabase
      .from("produzione_macchinari")
      .select(MACCHINA_COLS)
      .in("id", ids);
    for (const m of ((macs ?? []) as MacchinaRow[]).map(mapMacchina)) {
      macchineById.set(m.id, m);
    }
  }
  const macchine: EventoLineaMacchina[] = (
    (righe ?? []) as Array<{
      id: string;
      macchinario_id: string;
      richiesto: boolean;
      confermato_at: string | null;
      via_iot: boolean;
    }>
  ).map((r) => {
    const m = macchineById.get(r.macchinario_id);
    return {
      id: r.id,
      macchinarioId: r.macchinario_id,
      nome: m?.nome ?? "Macchina",
      codice: m?.codice ?? "",
      iotCollegato: m?.iotCollegato ?? false,
      statoIot: m?.statoIot ?? "spento",
      richiesto: r.richiesto,
      confermatoAt: r.confermato_at,
      viaIot: r.via_iot,
    };
  });
  return {
    success: true,
    evento: {
      id: row.id,
      areaId: row.area_id,
      tipo: row.tipo,
      tipoNome,
      catalogoId: row.catalogo_id,
      richiedeSpegnimento,
      documentoStato: row.documento_stato,
      note: row.note,
      startedAt: row.started_at,
      startedByNome,
      closedAt: row.closed_at,
      macchine,
    },
  };
}

export async function startEventoLineaAction(input: {
  areaId: string;
  catalogoId: string;
}): Promise<
  { success: true; evento: EventoLinea } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const aperto = await getEventoLineaApertoAction(input.areaId);
  if (!aperto.success) return aperto;
  if (aperto.evento) {
    return { success: false, error: "C’è già un evento di linea in corso in quest’area." };
  }
  const supabase = await createClient();
  const { data: cat, error: catErr } = await supabase
    .from("produzione_eventi_linea_catalogo")
    .select("id, codice, nome, richiede_spegnimento, documento_stato, attivo")
    .eq("id", input.catalogoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (catErr || !cat) {
    return { success: false, error: catErr?.message ?? "Evento di catalogo non trovato." };
  }
  const catalogo = cat as {
    id: string;
    codice: string;
    nome: string;
    richiede_spegnimento: boolean;
    documento_stato: string;
    attivo: boolean;
  };
  if (!catalogo.attivo || catalogo.documento_stato !== "approvato") {
    return { success: false, error: "Questo evento di linea non è approvato." };
  }
  const { data: ev, error } = await supabase
    .from("produzione_eventi_linea")
    .insert({
      area_id: input.areaId,
      tipo: catalogo.codice,
      catalogo_id: catalogo.id,
      documento_stato: "in_corso",
      started_by: auth.userId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !ev) {
    return { success: false, error: error?.message ?? "Creazione evento fallita." };
  }
  const eventoId = (ev as { id: string }).id;
  const rows: Array<{
    evento_id: string;
    macchinario_id: string;
    richiesto: boolean;
    created_by: string;
  }> = [];
  if (catalogo.richiede_spegnimento) {
    const { data: accese } = await supabase
      .from("produzione_macchinari")
      .select("id")
      .eq("area_id", input.areaId)
      .eq("stato_iot", "acceso")
      .is("deleted_at", null);
    for (const m of (accese ?? []) as Array<{ id: string }>) {
      rows.push({
        evento_id: eventoId,
        macchinario_id: m.id,
        richiesto: true,
        created_by: auth.userId,
      });
    }
    if (rows.length) {
      const { error: iErr } = await supabase
        .from("produzione_evento_linea_macchine")
        .insert(rows);
      if (iErr) return { success: false, error: iErr.message };
    }
  }
  await writeAuditLog({
    entity_type: "produzione_eventi_linea",
    entity_id: eventoId,
    action: "create",
    actor_id: auth.userId,
    summary: `Aperto evento di linea: ${catalogo.nome}`,
    payload: { catalogo_id: catalogo.id, macchine: rows.length },
  });
  return loadEventoLinea(eventoId);
}

export async function closeEventoLineaAction(
  eventoId: string
): Promise<
  { success: true; evento: EventoLinea } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const loaded = await loadEventoLinea(eventoId);
  if (!loaded.success) return loaded;
  if (loaded.evento.documentoStato === "chiuso") return loaded;
  const pending = loaded.evento.macchine.filter((m) => m.richiesto && !m.confermatoAt);
  if (pending.length) {
    return {
      success: false,
      error: `Ancora ${pending.length} macchine da spegnere prima di chiudere l’evento.`,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_eventi_linea")
    .update({
      documento_stato: "chiuso",
      closed_at: new Date().toISOString(),
      closed_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", eventoId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "produzione_eventi_linea",
    entity_id: eventoId,
    action: "close",
    actor_id: auth.userId,
    summary: `Chiuso evento di linea: ${loaded.evento.tipoNome || eventoLineaLabel(loaded.evento.tipo)}`,
  });
  return loadEventoLinea(eventoId);
}

const CATALOGO_COLS =
  "id, codice, nome, sintesi, dettagli, richiede_spegnimento, sort_order, documento_stato, versione, attivo";

function mapCatalogo(row: {
  id: string;
  codice: string;
  nome: string;
  sintesi: string;
  dettagli: string;
  richiede_spegnimento: boolean;
  sort_order: number;
  documento_stato: EventoLineaCatalogo["documentoStato"];
  versione: number;
  attivo: boolean;
}): EventoLineaCatalogo {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    sintesi: row.sintesi ?? "",
    dettagli: row.dettagli ?? "",
    richiedeSpegnimento: Boolean(row.richiede_spegnimento),
    sortOrder: row.sort_order ?? 100,
    documentoStato: row.documento_stato,
    versione: row.versione ?? 1,
    attivo: Boolean(row.attivo),
  };
}

export async function listEventiLineaCatalogoAction(): Promise<
  | { success: true; items: EventoLineaCatalogo[]; isAdmin: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const isAdmin = isAdminLikeProfile(auth.profile);
  const supabase = await createClient();
  let query = supabase
    .from("produzione_eventi_linea_catalogo")
    .select(CATALOGO_COLS)
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  if (!isAdmin) {
    query = query.eq("documento_stato", "approvato");
  }
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    isAdmin,
    items: ((data ?? []) as Parameters<typeof mapCatalogo>[0][]).map(mapCatalogo),
  };
}

export async function createEventoLineaCatalogoAction(
  raw: unknown
): Promise<
  { success: true; item: EventoLineaCatalogo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può aggiungere eventi di linea." };
  }
  const parsed = eventoLineaCatalogoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const codice = slugPosto(parsed.data.nome);
  if (!codice) {
    return { success: false, error: "Nome non valido per generare il codice." };
  }
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("produzione_eventi_linea_catalogo")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("produzione_eventi_linea_catalogo")
    .insert({
      codice,
      nome: parsed.data.nome,
      sintesi: parsed.data.sintesi,
      dettagli: parsed.data.dettagli,
      richiede_spegnimento: parsed.data.richiedeSpegnimento,
      sort_order: sortOrder,
      versione: 1,
      documento_stato: "approvato",
      approved_at: now,
      approved_by: auth.userId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(CATALOGO_COLS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Esiste già un evento di linea con questo nome." };
    }
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const item = mapCatalogo(data as Parameters<typeof mapCatalogo>[0]);
  await writeAuditLog({
    entity_type: "produzione_eventi_linea_catalogo",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Aggiunto evento di linea in catalogo: ${item.nome}`,
    payload: { codice: item.codice },
  });
  return { success: true, item };
}
