"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  confrontaNote,
  rsBersaglioSchema,
  rsColoreSchema,
  rsTipoSchema,
  rsVoceTipoSchema,
  type RsProdottoScelta,
  type RsTimelineNota,
  type RsTipoVoce,
} from "@/lib/ricerca-sviluppo/types";
import { createClient } from "@/lib/supabase/server";

async function guard() {
  return requireAreaAccess("ricerca-sviluppo");
}

function prossimaLettera(usate: string[]): string | null {
  const set = new Set(usate);
  for (let i = 0; i < 26; i += 1) {
    const lettera = String.fromCharCode(97 + i);
    if (!set.has(lettera)) return lettera;
  }
  return null;
}

export async function listTipiVoceAction(ambito: "processo" | "materia_prima"): Promise<
  { success: true; items: RsTipoVoce[] } | { success: false; error: string }
> {
  await guard();
  const parsed = rsTipoSchema.safeParse(ambito);
  if (!parsed.success) return { success: false, error: "Ambito non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rs_tipi_voce")
    .select("id, ambito, nome, sort_order")
    .eq("ambito", parsed.data)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      ambito: parsed.data,
      nome: String(row.nome),
    })),
  };
}

const creaTipoSchema = z.object({
  ambito: rsTipoSchema,
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
});

export async function creaTipoVoceAction(input: {
  ambito: "processo" | "materia_prima";
  nome: string;
}): Promise<{ success: true; item: RsTipoVoce } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = creaTipoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rs_tipi_voce")
    .insert({
      ambito: parsed.data.ambito,
      nome: parsed.data.nome,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, nome")
    .single();
  if (error || !data) {
    const msg = error?.message ?? "Creazione fallita";
    if (msg.toLowerCase().includes("duplicate") || msg.includes("rs_tipi_voce_nome_uidx")) {
      return { success: false, error: "Questa voce esiste già." };
    }
    return { success: false, error: msg };
  }
  await writeAuditLog({
    entity_type: "rs_tipi_voce",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Nuovo tipo di ricerca: ${parsed.data.nome}`,
    payload: { ambito: parsed.data.ambito, nome: parsed.data.nome },
  });
  return {
    success: true,
    item: { id: String(data.id), ambito: parsed.data.ambito, nome: String(data.nome) },
  };
}

export async function listProdottiRicercaAction(): Promise<
  { success: true; items: RsProdottoScelta[] } | { success: false; error: string }
> {
  await guard();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      nome: String(row.nome),
    })),
  };
}

const creaNotaSchema = z.object({
  ricercaId: z.string().uuid(),
  bodyText: z.string().trim().min(1, "Scrivi l'azione").max(8000),
  occurredAt: z.string().datetime({ offset: true }),
  dopoNumero: z.number().int().min(1).nullable().optional(),
});

export async function listNoteRicercaAction(ricercaId: string): Promise<
  { success: true; items: RsTimelineNota[] } | { success: false; error: string }
> {
  await guard();
  if (!z.string().uuid().safeParse(ricercaId).success) {
    return { success: false, error: "Ricerca non valida." };
  }
  const supabase = await createClient();
  const { data: note, error } = await supabase
    .from("rs_timeline_note")
    .select("id, occurred_at, numero, suffisso, body_text, versione")
    .eq("ricerca_id", ricercaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const ids = (note ?? []).map((row) => String(row.id));
  const vociByNota = new Map<string, RsTimelineNota["voci"]>();
  const esitiByNota = new Map<string, RsTimelineNota["esiti"]>();
  if (ids.length > 0) {
    const [vociRes, esitiRes] = await Promise.all([
      supabase
        .from("rs_nota_voci")
        .select("id, nota_id, tipo, testo, fatto, sort_order")
        .in("nota_id", ids)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("rs_nota_esiti")
        .select("id, nota_id, bersaglio, voce_id, estratto_testo, colore, problema, modifica_prevista")
        .in("nota_id", ids)
        .is("deleted_at", null),
    ]);
    if (vociRes.error) return { success: false, error: vociRes.error.message };
    if (esitiRes.error) return { success: false, error: esitiRes.error.message };
    for (const row of vociRes.data ?? []) {
      const notaId = String(row.nota_id);
      const lista = vociByNota.get(notaId) ?? [];
      const tipo = row.tipo === "checklist" ? "checklist" : "elenco";
      lista.push({
        id: String(row.id),
        tipo,
        testo: String(row.testo),
        fatto: Boolean(row.fatto),
        sortOrder: Number(row.sort_order) || 0,
      });
      vociByNota.set(notaId, lista);
    }
    for (const row of esitiRes.data ?? []) {
      const notaId = String(row.nota_id);
      const lista = esitiByNota.get(notaId) ?? [];
      const bersaglio =
        row.bersaglio === "voce" || row.bersaglio === "testo" ? row.bersaglio : "nota";
      const colore =
        row.colore === "giallo" || row.colore === "rosso" ? row.colore : "verde";
      lista.push({
        id: String(row.id),
        bersaglio,
        voceId: row.voce_id ? String(row.voce_id) : null,
        estrattoTesto: String(row.estratto_testo ?? ""),
        colore,
        problema: String(row.problema),
        modificaPrevista: String(row.modifica_prevista ?? ""),
      });
      esitiByNota.set(notaId, lista);
    }
  }
  const items = (note ?? [])
    .map((row) => {
      const id = String(row.id);
      return {
        id,
        occurredAt: String(row.occurred_at),
        numero: Number(row.numero),
        suffisso: row.suffisso ? String(row.suffisso) : null,
        bodyText: String(row.body_text),
        versione: Number(row.versione) || 1,
        voci: vociByNota.get(id) ?? [],
        esiti: esitiByNota.get(id) ?? [],
      };
    })
    .sort(confrontaNote);
  return { success: true, items };
}

export async function creaNotaRicercaAction(input: {
  ricercaId: string;
  bodyText: string;
  occurredAt: string;
  dopoNumero?: number | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = creaNotaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const supabase = await createClient();
  const { data: esistenti, error: leggiErr } = await supabase
    .from("rs_timeline_note")
    .select("numero, suffisso")
    .eq("ricerca_id", parsed.data.ricercaId);
  if (leggiErr) return { success: false, error: leggiErr.message };
  const righe = esistenti ?? [];
  let numero = 1;
  let suffisso: string | null = null;
  if (parsed.data.dopoNumero) {
    const presente = righe.some(
      (row) => Number(row.numero) === parsed.data.dopoNumero && !row.suffisso
    );
    if (!presente) {
      return { success: false, error: "Il numero scelto non è in timeline." };
    }
    const usate = righe
      .filter((row) => Number(row.numero) === parsed.data.dopoNumero && row.suffisso)
      .map((row) => String(row.suffisso));
    const lettera = prossimaLettera(usate);
    if (!lettera) return { success: false, error: "Non ci sono altre lettere dopo questo numero." };
    numero = parsed.data.dopoNumero;
    suffisso = lettera;
  } else {
    const massimo = righe.reduce((max, row) => Math.max(max, Number(row.numero) || 0), 0);
    numero = massimo + 1;
  }
  const { data, error } = await supabase
    .from("rs_timeline_note")
    .insert({
      ricerca_id: parsed.data.ricercaId,
      occurred_at: parsed.data.occurredAt,
      numero,
      suffisso,
      body_text: parsed.data.bodyText,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Nota non salvata" };
  }
  await writeAuditLog({
    entity_type: "rs_timeline_note",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Nota timeline ${suffisso ? `${numero}-${suffisso}` : numero}`,
    payload: {
      ricerca_id: parsed.data.ricercaId,
      numero,
      suffisso,
      occurred_at: parsed.data.occurredAt,
    },
  });
  return { success: true, id: String(data.id) };
}

const voceSchema = z.object({
  notaId: z.string().uuid(),
  tipo: rsVoceTipoSchema,
  testo: z.string().trim().min(1, "Scrivi la voce").max(500),
});

export async function aggiungiVoceNotaAction(input: {
  notaId: string;
  tipo: "elenco" | "checklist";
  testo: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = voceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const supabase = await createClient();
  const { data: ultime } = await supabase
    .from("rs_nota_voci")
    .select("sort_order")
    .eq("nota_id", parsed.data.notaId)
    .eq("tipo", parsed.data.tipo)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const sort = (Number(ultime?.[0]?.sort_order) || 0) + 1;
  const { error } = await supabase.from("rs_nota_voci").insert({
    nota_id: parsed.data.notaId,
    tipo: parsed.data.tipo,
    testo: parsed.data.testo,
    sort_order: sort,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function segnaVoceNotaAction(input: {
  voceId: string;
  fatto: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const id = z.string().uuid().safeParse(input.voceId);
  if (!id.success) return { success: false, error: "Voce non valida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("rs_nota_voci")
    .update({ fatto: Boolean(input.fatto), updated_by: auth.userId })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

const esitoSchema = z.object({
  notaId: z.string().uuid(),
  bersaglio: rsBersaglioSchema,
  voceId: z.string().uuid().nullable().optional(),
  estrattoTesto: z.string().trim().max(8000).optional().default(""),
  colore: rsColoreSchema,
  problema: z.string().trim().min(1, "Il problema riscontrato è obbligatorio").max(2000),
  modificaPrevista: z.string().trim().max(2000).optional().default(""),
});

export async function attribuisciEsitoNotaAction(input: {
  notaId: string;
  bersaglio: "nota" | "voce" | "testo";
  voceId?: string | null;
  estrattoTesto?: string;
  colore: "verde" | "giallo" | "rosso";
  problema: string;
  modificaPrevista?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = esitoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  if (parsed.data.bersaglio === "voce" && !parsed.data.voceId) {
    return { success: false, error: "Scegli la voce dell'elenco." };
  }
  if (parsed.data.bersaglio === "testo" && !parsed.data.estrattoTesto.trim()) {
    return { success: false, error: "Seleziona un brano del testo." };
  }
  const supabase = await createClient();
  const modifica = parsed.data.modificaPrevista.trim();
  const { data, error } = await supabase
    .from("rs_nota_esiti")
    .insert({
      nota_id: parsed.data.notaId,
      bersaglio: parsed.data.bersaglio,
      voce_id: parsed.data.bersaglio === "voce" ? parsed.data.voceId : null,
      estratto_testo:
        parsed.data.bersaglio === "testo" ? parsed.data.estrattoTesto.trim() : "",
      colore: parsed.data.colore,
      problema: parsed.data.problema,
      modifica_prevista: modifica,
      modifica_compilata_at: modifica ? new Date().toISOString() : null,
      modifica_compilata_by: modifica ? auth.userId : null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Esito non salvato" };
  }
  await writeAuditLog({
    entity_type: "rs_nota_esiti",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Semaforo ${parsed.data.colore} su ${parsed.data.bersaglio}`,
    payload: {
      nota_id: parsed.data.notaId,
      bersaglio: parsed.data.bersaglio,
      colore: parsed.data.colore,
      problema: parsed.data.problema,
      modifica_presente: Boolean(modifica),
    },
  });
  return { success: true };
}

const modificaSchema = z.object({
  esitoId: z.string().uuid(),
  modificaPrevista: z.string().trim().min(1, "Scrivi la prossima modifica").max(2000),
});

export async function completaModificaEsitoAction(input: {
  esitoId: string;
  modificaPrevista: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guard();
  const parsed = modificaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("rs_nota_esiti")
    .update({
      modifica_prevista: parsed.data.modificaPrevista,
      modifica_compilata_at: new Date().toISOString(),
      modifica_compilata_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.esitoId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "rs_nota_esiti",
    entity_id: parsed.data.esitoId,
    action: "update",
    actor_id: auth.userId,
    summary: "Prossima modifica compilata sul semaforo",
    payload: { modifica_prevista: parsed.data.modificaPrevista },
  });
  return { success: true };
}
