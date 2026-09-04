"use server";

import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { slugPosto } from "@/lib/produzione/aree-posti";
import {
  eventoLineaCatalogoDeleteSchema,
  eventoLineaCatalogoInputSchema,
  eventoLineaCatalogoReorderSchema,
  eventoLineaCatalogoSettingsSchema,
  eventoLineaLabel,
  insiemeDerivedStato,
  isInsieme,
  VASCA_FIGLI_CODICI,
  macchinarioInputSchema,
  macchinarioStatoSchema,
  normalizeIotStato,
  ricambioInputSchema,
  type AttivitaOrigine,
  type EventoLinea,
  type EventoLineaCatalogo,
  type EventoLineaMacchina,
  type EventoLineaMacchinaConfig,
  type EventoMacchinaStato,
  type EventoStatoObiettivo,
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
  parent_id: string | null;
  tipo: ProduzioneMacchinario["tipo"];
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
    parentId: row.parent_id ?? null,
    tipo: row.tipo ?? "macchina",
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
  "id, area_id, codice, nome, descrizione, iot_collegato, stato_iot, stato_note, stato_at, attivo, sort_order, note, parent_id, tipo";
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
  const items = ((data ?? []) as MacchinaRow[]).map(mapMacchina);
  const vasca = items.find((m) => m.codice === "vasca-lavaggio");
  const figliByParent = new Map<string, ProduzioneMacchinario[]>();
  for (const m of items) {
    const parentId =
      m.parentId ??
      (vasca &&
      VASCA_FIGLI_CODICI.includes(m.codice as (typeof VASCA_FIGLI_CODICI)[number])
        ? vasca.id
        : null);
    if (!parentId) continue;
    const list = figliByParent.get(parentId) ?? [];
    list.push(m);
    figliByParent.set(parentId, list);
  }
  return {
    success: true,
    items: items.map((m) =>
      isInsieme(m)
        ? { ...m, statoIot: insiemeDerivedStato(figliByParent.get(m.id) ?? []) }
        : m
    ),
  };
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
      tipo: "macchina",
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
  on: boolean;
}) {
  const supabase = await createClient();
  let eventoId = input.eventoLineaId ?? null;
  if (!eventoId) {
    const aperto = await getEventoLineaApertoAction(input.areaId);
    if (aperto.success && aperto.evento) eventoId = aperto.evento.id;
  }
  if (!eventoId) return;
  const current = await loadEventoLinea(eventoId);
  if (!current.success) return;
  const riga = current.evento.macchine.find(
    (m) => m.macchinarioId === input.macchinarioId
  );
  const target = riga?.statoObiettivo ?? current.evento.statoObiettivo;
  const matches =
    (target === "off" && !input.on) || (target === "on" && input.on);
  if (!matches) return;
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
  if (isInsieme(prev)) {
    const { data: kidsByParent, error: kErr } = await supabase
      .from("produzione_macchinari")
      .select(MACCHINA_COLS)
      .eq("parent_id", prev.id)
      .is("deleted_at", null);
    if (kErr) return { success: false, error: kErr.message };
    let kids = kidsByParent;
    if (!(kids ?? []).length && prev.codice === "vasca-lavaggio") {
      const fallback = await supabase
        .from("produzione_macchinari")
        .select(MACCHINA_COLS)
        .eq("area_id", prev.areaId)
        .in("codice", [...VASCA_FIGLI_CODICI])
        .is("deleted_at", null);
      if (fallback.error) return { success: false, error: fallback.error.message };
      kids = fallback.data;
      for (const row of (kids ?? []) as MacchinaRow[]) {
        await supabase
          .from("produzione_macchinari")
          .update({ parent_id: prev.id, updated_by: auth.userId })
          .eq("id", row.id)
          .is("deleted_at", null);
      }
    }
    if (prev.tipo !== "insieme") {
      await supabase
        .from("produzione_macchinari")
        .update({ tipo: "insieme", updated_by: auth.userId })
        .eq("id", prev.id);
    }
    const figli: ProduzioneMacchinario[] = [];
    for (const row of (kids ?? []) as MacchinaRow[]) {
      const child = mapMacchina(row);
      const res = await setMacchinaPowerAction({
        macchinarioId: child.id,
        on: input.on,
        origine: "insieme",
        eventoLineaId: input.eventoLineaId,
      });
      if (!res.success) return res;
      figli.push(res.item);
    }
    const item: ProduzioneMacchinario = {
      ...prev,
      statoIot: insiemeDerivedStato(figli),
      figli,
    };
    await writeAuditLog({
      entity_type: "produzione_macchinari",
      entity_id: item.id,
      action: input.on ? "power_on" : "power_off",
      actor_id: auth.userId,
      summary: `${input.on ? "On" : "Off"} insieme ${item.nome} (${figli.length} macchine)`,
      payload: { origine: input.origine, figlie: figli.map((f) => f.id) },
    });
    return { success: true, item };
  }
  const nextStato = input.on ? "acceso" : "spento";
  const now = new Date().toISOString();
  if (prev.statoIot === nextStato) {
    await confirmEventoOffAndMaybeClose({
      areaId: prev.areaId,
      macchinarioId: prev.id,
      eventoLineaId: input.eventoLineaId,
      viaIot: prev.iotCollegato,
      actorId: auth.userId,
      now,
      on: input.on,
    });
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

  await confirmEventoOffAndMaybeClose({
    areaId: item.areaId,
    macchinarioId: item.id,
    eventoLineaId: input.eventoLineaId,
    viaIot: prev.iotCollegato,
    actorId: auth.userId,
    now,
    on: input.on,
  });

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
      "id, area_id, tipo, catalogo_id, documento_stato, note, started_at, started_by, closed_at, durata_minuti, stato_obiettivo"
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
    durata_minuti: number | null;
    stato_obiettivo: EventoStatoObiettivo | null;
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
  let durataMinuti = row.durata_minuti ?? 0;
  let statoObiettivo: EventoStatoObiettivo = row.stato_obiettivo ?? "off";
  if (row.catalogo_id) {
    const { data: cat } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .select("nome, richiede_spegnimento, durata_minuti, stato_obiettivo")
      .eq("id", row.catalogo_id)
      .maybeSingle();
    const c = cat as {
      nome?: string;
      richiede_spegnimento?: boolean;
      durata_minuti?: number;
      stato_obiettivo?: EventoStatoObiettivo;
    } | null;
    if (c?.nome) tipoNome = c.nome;
    if (typeof c?.richiede_spegnimento === "boolean") {
      richiedeSpegnimento = c.richiede_spegnimento;
    }
    if (row.durata_minuti == null && typeof c?.durata_minuti === "number") {
      durataMinuti = c.durata_minuti;
    }
    if (!row.stato_obiettivo && c?.stato_obiettivo) {
      statoObiettivo = c.stato_obiettivo;
    }
  }
  const { data: righe, error: rErr } = await supabase
    .from("produzione_evento_linea_macchine")
    .select("id, macchinario_id, richiesto, confermato_at, via_iot, stato_obiettivo")
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
      stato_obiettivo: EventoMacchinaStato | null;
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
      statoObiettivo: r.stato_obiettivo === "on" ? "on" : "off",
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
      durataMinuti,
      statoObiettivo,
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
    .select(
      "id, codice, nome, richiede_spegnimento, documento_stato, attivo, durata_minuti, stato_obiettivo"
    )
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
    durata_minuti: number;
    stato_obiettivo: EventoStatoObiettivo;
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
      durata_minuti: catalogo.durata_minuti,
      stato_obiettivo: catalogo.stato_obiettivo,
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
    stato_obiettivo: EventoMacchinaStato;
    confermato_at: string | null;
    confermato_by: string | null;
    created_by: string;
  }> = [];
  const { data: selected } = await supabase
    .from("produzione_eventi_linea_catalogo_macchine")
    .select("macchinario_id, stato_obiettivo")
    .eq("catalogo_id", catalogo.id)
    .eq("area_id", input.areaId)
    .is("deleted_at", null);
  const selectedRows = (selected ?? []) as Array<{
    macchinario_id: string;
    stato_obiettivo: EventoMacchinaStato | null;
  }>;
  const machineIds = selectedRows.map((r) => r.macchinario_id);
  const targetById = new Map(
    selectedRows.map((r) => [
      r.macchinario_id,
      r.stato_obiettivo === "on" ? "on" : "off",
    ] as const)
  );
  if (machineIds.length) {
    const { data: macs } = await supabase
      .from("produzione_macchinari")
      .select("id, stato_iot")
      .in("id", machineIds)
      .is("deleted_at", null);
    const now = new Date().toISOString();
    for (const m of (macs ?? []) as Array<{ id: string; stato_iot: string }>) {
      const target = targetById.get(m.id) ?? "off";
      const already =
        (target === "off" && m.stato_iot !== "acceso") ||
        (target === "on" && m.stato_iot === "acceso");
      rows.push({
        evento_id: eventoId,
        macchinario_id: m.id,
        richiesto: true,
        stato_obiettivo: target,
        confermato_at: already ? now : null,
        confermato_by: already ? auth.userId : null,
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
    payload: {
      catalogo_id: catalogo.id,
      macchine: rows.length,
      stato_obiettivo: catalogo.stato_obiettivo,
      durata_minuti: catalogo.durata_minuti,
    },
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
      error: `Ancora ${pending.length} macchine da portare allo stato richiesto prima di chiudere l’evento.`,
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
  "id, codice, nome, sintesi, dettagli, richiede_spegnimento, durata_minuti, stato_obiettivo, sort_order, documento_stato, versione, attivo";

function mapCatalogo(
  row: {
    id: string;
    codice: string;
    nome: string;
    sintesi: string;
    dettagli: string;
    richiede_spegnimento: boolean;
    durata_minuti: number;
    stato_obiettivo: EventoStatoObiettivo;
    sort_order: number;
    documento_stato: EventoLineaCatalogo["documentoStato"];
    versione: number;
    attivo: boolean;
  },
  macchine: EventoLineaMacchinaConfig[] = []
): EventoLineaCatalogo {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    sintesi: row.sintesi ?? "",
    dettagli: row.dettagli ?? "",
    richiedeSpegnimento: Boolean(row.richiede_spegnimento),
    durataMinuti: row.durata_minuti ?? 0,
    statoObiettivo: row.stato_obiettivo ?? "off",
    macchineIds: macchine.map((m) => m.macchinarioId),
    macchine,
    sortOrder: row.sort_order ?? 100,
    documentoStato: row.documento_stato,
    versione: row.versione ?? 1,
    attivo: Boolean(row.attivo),
  };
}

export async function listEventiLineaCatalogoAction(
  areaId?: string
): Promise<
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
  const rows = (data ?? []) as Parameters<typeof mapCatalogo>[0][];
  const macchineByCatalogo = new Map<string, EventoLineaMacchinaConfig[]>();
  if (areaId && rows.length) {
    const { data: links } = await supabase
      .from("produzione_eventi_linea_catalogo_macchine")
      .select("catalogo_id, macchinario_id, stato_obiettivo")
      .eq("area_id", areaId)
      .is("deleted_at", null)
      .in(
        "catalogo_id",
        rows.map((r) => r.id)
      );
    for (const link of (links ?? []) as Array<{
      catalogo_id: string;
      macchinario_id: string;
      stato_obiettivo: EventoMacchinaStato | null;
    }>) {
      const list = macchineByCatalogo.get(link.catalogo_id) ?? [];
      list.push({
        macchinarioId: link.macchinario_id,
        statoObiettivo: link.stato_obiettivo === "on" ? "on" : "off",
      });
      macchineByCatalogo.set(link.catalogo_id, list);
    }
  }
  return {
    success: true,
    isAdmin,
    items: rows.map((r) => mapCatalogo(r, macchineByCatalogo.get(r.id) ?? [])),
  };
}

export async function createEventoLineaCatalogoAction(
  raw: unknown
): Promise<
  { success: true; item: EventoLineaCatalogo } | { success: false; error: string }
> {
  try {
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
    const { data: last, error: lastErr } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .select("sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) {
      return { success: false, error: lastErr.message };
    }
    const sortOrder = ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .insert({
        codice,
        nome: parsed.data.nome,
        sintesi: parsed.data.sintesi,
        dettagli: "",
        durata_minuti: parsed.data.durataMinuti,
        stato_obiettivo: parsed.data.statoObiettivo ?? "off",
        richiede_spegnimento: false,
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
  } catch (e) {
    const digest =
      typeof e === "object" && e && "digest" in e
        ? String((e as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw e;
    return {
      success: false,
      error: e instanceof Error ? e.message : "Salvataggio fallito.",
    };
  }
}

export async function updateEventoLineaCatalogoSettingsAction(
  raw: unknown
): Promise<
  { success: true; item: EventoLineaCatalogo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      success: false,
      error: "Solo l’amministratore può modificare le impostazioni dell’evento.",
    };
  }
  const parsed = eventoLineaCatalogoSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const supabase = await createClient();
  const macchinarioIds = parsed.data.macchine.map((m) => m.macchinarioId);
  const statoById = new Map(
    parsed.data.macchine.map((m) => [m.macchinarioId, m.statoObiettivo])
  );
  if (macchinarioIds.length) {
    const { data: macs, error: mErr } = await supabase
      .from("produzione_macchinari")
      .select("id")
      .eq("area_id", parsed.data.areaId)
      .is("deleted_at", null)
      .in("id", macchinarioIds);
    if (mErr) return { success: false, error: mErr.message };
    if (((macs ?? []) as Array<{ id: string }>).length !== macchinarioIds.length) {
      return { success: false, error: "Una o più macchine non appartengono a quest’area." };
    }
  }
  const now = new Date().toISOString();
  const { data: current, error: cErr } = await supabase
    .from("produzione_eventi_linea_catalogo")
    .select("versione")
    .eq("id", parsed.data.catalogoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cErr || !current) {
    return { success: false, error: cErr?.message ?? "Evento di catalogo non trovato." };
  }
  const { data, error } = await supabase
    .from("produzione_eventi_linea_catalogo")
    .update({
      nome: parsed.data.nome,
      sintesi: parsed.data.sintesi,
      durata_minuti: parsed.data.durataMinuti,
      stato_obiettivo: parsed.data.statoObiettivo,
      richiede_spegnimento: parsed.data.statoObiettivo === "off",
      versione: ((current as { versione?: number }).versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.catalogoId)
    .is("deleted_at", null)
    .select(CATALOGO_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }

  const { data: links } = await supabase
    .from("produzione_eventi_linea_catalogo_macchine")
    .select("id, macchinario_id, deleted_at")
    .eq("catalogo_id", parsed.data.catalogoId)
    .eq("area_id", parsed.data.areaId);
  const wanted = new Set(macchinarioIds);
  for (const link of (links ?? []) as Array<{
    id: string;
    macchinario_id: string;
    deleted_at: string | null;
  }>) {
    if (wanted.has(link.macchinario_id)) {
      await supabase
        .from("produzione_eventi_linea_catalogo_macchine")
        .update({
          deleted_at: null,
          deleted_by: null,
          stato_obiettivo: statoById.get(link.macchinario_id) ?? "off",
          updated_by: auth.userId,
        })
        .eq("id", link.id);
      wanted.delete(link.macchinario_id);
    } else if (!link.deleted_at) {
      await supabase
        .from("produzione_eventi_linea_catalogo_macchine")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", link.id);
    }
  }
  if (wanted.size) {
    const { error: iErr } = await supabase
      .from("produzione_eventi_linea_catalogo_macchine")
      .insert(
        [...wanted].map((macchinarioId) => ({
          catalogo_id: parsed.data.catalogoId,
          area_id: parsed.data.areaId,
          macchinario_id: macchinarioId,
          stato_obiettivo: statoById.get(macchinarioId) ?? "off",
          created_by: auth.userId,
          updated_by: auth.userId,
        }))
      );
    if (iErr) return { success: false, error: iErr.message };
  }

  const item = mapCatalogo(
    data as Parameters<typeof mapCatalogo>[0],
    parsed.data.macchine
  );
  await writeAuditLog({
    entity_type: "produzione_eventi_linea_catalogo",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornate impostazioni evento di linea: ${item.nome}`,
    payload: {
      area_id: parsed.data.areaId,
      nome: item.nome,
      sintesi: item.sintesi,
      durata_minuti: item.durataMinuti,
      macchine: parsed.data.macchine,
    },
  });
  return { success: true, item };
}

export async function reorderEventiLineaCatalogoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { auth } = await requireAreaAccess("produzione");
    if (!isAdminLikeProfile(auth.profile)) {
      return {
        success: false,
        error: "Solo l’amministratore può riordinare gli eventi di linea.",
      };
    }
    const parsed = eventoLineaCatalogoReorderSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Ordine non valido." };
    }
    const ids = parsed.data.ids;
    if (new Set(ids).size !== ids.length) {
      return { success: false, error: "Elenco ordine non valido." };
    }
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .select("id")
      .is("deleted_at", null)
      .in("id", ids);
    if (error) return { success: false, error: error.message };
    if (((rows ?? []) as Array<{ id: string }>).length !== ids.length) {
      return { success: false, error: "Uno o più eventi non sono più disponibili." };
    }
    for (let i = 0; i < ids.length; i++) {
      const { error: uErr } = await supabase
        .from("produzione_eventi_linea_catalogo")
        .update({
          sort_order: (i + 1) * 10,
          updated_by: auth.userId,
        })
        .eq("id", ids[i])
        .is("deleted_at", null);
      if (uErr) return { success: false, error: uErr.message };
    }
    await writeAuditLog({
      entity_type: "produzione_eventi_linea_catalogo",
      entity_id: ids[0],
      action: "reorder",
      actor_id: auth.userId,
      summary: `Riordinati ${ids.length} eventi di linea`,
      payload: { ids },
    });
    return { success: true };
  } catch (e) {
    const digest =
      typeof e === "object" && e && "digest" in e
        ? String((e as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw e;
    return {
      success: false,
      error: e instanceof Error ? e.message : "Riordino non riuscito.",
    };
  }
}

export async function deleteEventoLineaCatalogoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { auth } = await requireAreaAccess("produzione");
    if (!isAdminLikeProfile(auth.profile)) {
      return {
        success: false,
        error: "Solo l’amministratore può eliminare un evento di linea.",
      };
    }
    const parsed = eventoLineaCatalogoDeleteSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
    }
    const supabase = await createClient();
    const { data: row, error: loadErr } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .select("id, codice, nome")
      .eq("id", parsed.data.catalogoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (loadErr || !row) {
      return { success: false, error: loadErr?.message ?? "Evento di catalogo non trovato." };
    }
    const codice = (row as { codice: string }).codice;
    const expected = fraseConfermaSoftDelete(codice);
    if (parsed.data.confermaTestuale.trim() !== expected) {
      return {
        success: false,
        error: `Per confermare digita esattamente: ${expected}`,
      };
    }
    const { data: aperti, error: aErr } = await supabase
      .from("produzione_eventi_linea")
      .select("id")
      .eq("catalogo_id", parsed.data.catalogoId)
      .eq("documento_stato", "in_corso")
      .is("deleted_at", null)
      .limit(1);
    if (aErr) return { success: false, error: aErr.message };
    if ((aperti ?? []).length) {
      return {
        success: false,
        error: "Non puoi eliminare questo evento: è ancora in corso su una linea.",
      };
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("produzione_eventi_linea_catalogo")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
        attivo: false,
      })
      .eq("id", parsed.data.catalogoId)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };

    await supabase
      .from("produzione_eventi_linea_catalogo_macchine")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("catalogo_id", parsed.data.catalogoId)
      .is("deleted_at", null);

    await writeAuditLog({
      entity_type: "produzione_eventi_linea_catalogo",
      entity_id: parsed.data.catalogoId,
      action: "soft_delete",
      actor_id: auth.userId,
      summary: `Eliminato evento di linea dal catalogo: ${(row as { nome: string }).nome}`,
      payload: { codice, conferma: parsed.data.confermaTestuale },
    });
    return { success: true };
  } catch (e) {
    const digest =
      typeof e === "object" && e && "digest" in e
        ? String((e as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw e;
    return {
      success: false,
      error: e instanceof Error ? e.message : "Eliminazione non riuscita.",
    };
  }
}
