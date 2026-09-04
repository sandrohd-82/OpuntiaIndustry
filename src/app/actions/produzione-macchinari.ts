"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { slugPosto } from "@/lib/produzione/aree-posti";
import {
  macchinarioInputSchema,
  macchinarioStatoSchema,
  normalizeIotStato,
  ricambioInputSchema,
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
