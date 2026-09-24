"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  arrestaEssiccatoreAction,
  avviaEssiccatoreAction,
} from "@/app/actions/action-essiccatore-azioni";
import {
  formatEseguiAt,
  nomeArrestoDi,
  processoInputSchema,
  programmataInputSchema,
  registrataInputSchema,
  registrataUpdateSchema,
  type AzioneProgrammata,
  type AzioneRegistrata,
  type EsecuzioneStato,
  type ProcessoAzione,
  type ProcessoPasso,
  type ProgrammataStato,
  type RegistrataAzioneKey,
} from "@/lib/action/azioni-catalogo";
import {
  TEMP_BRUCIATORE_MIN_C,
  type ActionEssiccatoreAzione,
} from "@/lib/action/azioni-immediate";
import { ACTION_ESSICCATORI } from "@/lib/action/essiccatori";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const idSchema = z.object({ id: z.string().uuid() });
const essSchema = z.object({
  essiccatoreId: z.string().min(1),
});

type RegRow = {
  id: string;
  essiccatore_id: string;
  azione_key: string;
  nome: string;
  descrizione: string;
  temp_bruciatore_c: number;
  perc_ventilazione: number;
  durata_minuti: number | null;
  programma_spegnimento?: boolean;
  programma_spegnimento_id?: string | null;
  esecuzione_stato?: string;
  esecuzione_azione_id?: string | null;
  versione: number;
  documento_stato: AzioneRegistrata["documentoStato"];
  created_at: string;
};

const REG_COLS =
  "id, essiccatore_id, azione_key, nome, descrizione, temp_bruciatore_c, perc_ventilazione, durata_minuti, programma_spegnimento, programma_spegnimento_id, esecuzione_stato, esecuzione_azione_id, versione, documento_stato, created_at";

type ProgRow = {
  id: string;
  essiccatore_id: string;
  registrata_id: string;
  esegui_at: string;
  stato: ProgrammataStato;
  azione_esecuzione_id: string | null;
  versione: number;
  documento_stato: AzioneProgrammata["documentoStato"];
  note: string;
  created_at: string;
};

function mapReg(
  r: RegRow,
  spegnimentoNome: string | null = null
): AzioneRegistrata {
  const key = r.azione_key === "arresto" ? "arresto" : "avvio";
  return {
    id: r.id,
    essiccatoreId: r.essiccatore_id,
    azioneKey: key as RegistrataAzioneKey,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    tempBruciatoreC: r.temp_bruciatore_c,
    percVentilazione: r.perc_ventilazione,
    durataMinuti: r.durata_minuti == null ? null : Number(r.durata_minuti),
    programmaSpegnimento: Boolean(r.programma_spegnimento),
    programmaSpegnimentoId: r.programma_spegnimento_id ?? null,
    programmaSpegnimentoNome: spegnimentoNome,
    esecuzioneStato: (r.esecuzione_stato === "in_corso"
      ? "in_corso"
      : "ferma") as EsecuzioneStato,
    esecuzioneAzioneId: r.esecuzione_azione_id ?? null,
    versione: r.versione,
    documentoStato: r.documento_stato,
    createdAt: r.created_at,
  };
}

function essNome(id: string): string {
  return ACTION_ESSICCATORI.find((e) => e.id === id)?.nome ?? id;
}

export async function listAzioniRegistrateAction(
  raw: unknown
): Promise<
  { success: true; items: AzioneRegistrata[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const parsed = essSchema
    .extend({
      ruolo: z.enum(["avvio", "spegnimento", "tutte"]).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Essiccatore non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_essiccatore_registrate")
    .select(REG_COLS)
    .eq("essiccatore_id", parsed.data.essiccatoreId)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as RegRow[];
  const nomi = new Map(rows.map((r) => [r.id, r.nome]));
  const ruolo = parsed.data.ruolo ?? "avvio";
  const filtered = rows.filter((r) => {
    if (ruolo === "tutte") return true;
    if (ruolo === "spegnimento") return Boolean(r.programma_spegnimento);
    return !r.programma_spegnimento && r.azione_key !== "arresto";
  });
  return {
    success: true,
    items: filtered.map((r) =>
      mapReg(r, r.programma_spegnimento_id ? nomi.get(r.programma_spegnimento_id) ?? null : null)
    ),
  };
}

export async function createAzioneRegistrataAction(
  raw: unknown
): Promise<
  { success: true; item: AzioneRegistrata } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = registrataInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  let spegnimentoId = parsed.data.programmaSpegnimentoId ?? null;
  let spegnimentoNome: string | null = null;

  if (parsed.data.spegnimentoMode === "collega") {
    const { data: stop } = await supabase
      .from("action_essiccatore_registrate")
      .select("id, nome, essiccatore_id, programma_spegnimento, azione_key")
      .eq("id", spegnimentoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      !stop ||
      String(stop.essiccatore_id) !== parsed.data.essiccatoreId ||
      !stop.programma_spegnimento
    ) {
      return {
        success: false,
        error: "Programma di spegnimento non valido per questo essiccatore.",
      };
    }
    spegnimentoNome = String(stop.nome);
  } else {
    const stopNome = nomeArrestoDi(parsed.data.nome);
    const { data: stop, error: stopErr } = await supabase
      .from("action_essiccatore_registrate")
      .insert({
        essiccatore_id: parsed.data.essiccatoreId,
        azione_key: "arresto",
        nome: stopNome,
        descrizione: `Programma di spegnimento collegato a «${parsed.data.nome.trim()}». Bruciatore Off, ventola On.`,
        temp_bruciatore_c: TEMP_BRUCIATORE_MIN_C,
        perc_ventilazione: Math.max(parsed.data.percVentilazione, 40),
        durata_minuti: parsed.data.durataMinuti,
        programma_spegnimento: true,
        versione: 1,
        documento_stato: "approvato",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id, nome")
      .single();
    if (stopErr || !stop) {
      return {
        success: false,
        error: stopErr?.message ?? "Creazione programma di spegnimento fallita.",
      };
    }
    spegnimentoId = String(stop.id);
    spegnimentoNome = String(stop.nome);
  }

  const { data, error } = await supabase
    .from("action_essiccatore_registrate")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      azione_key: "avvio",
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione ?? "",
      temp_bruciatore_c: parsed.data.tempBruciatoreC,
      perc_ventilazione: parsed.data.percVentilazione,
      durata_minuti: parsed.data.durataMinuti,
      programma_spegnimento: false,
      programma_spegnimento_id: spegnimentoId,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(REG_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const item = mapReg(data as RegRow, spegnimentoNome);
  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Azione registrata «${item.nome}» su ${essNome(item.essiccatoreId)}`,
    payload: {
      tempBruciatoreC: item.tempBruciatoreC,
      percVentilazione: item.percVentilazione,
      durataMinuti: item.durataMinuti,
      note: item.descrizione,
      programmaSpegnimentoId: spegnimentoId,
    },
  });
  return { success: true, item };
}

export async function updateAzioneRegistrataAction(
  raw: unknown
): Promise<
  { success: true; item: AzioneRegistrata } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = registrataUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("action_essiccatore_registrate")
    .select(REG_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Azione non trovata." };
  if (String((current as RegRow).esecuzione_stato) === "in_corso") {
    return { success: false, error: "Non si modifica un programma in corso." };
  }

  let spegnimentoId =
    parsed.data.programmaSpegnimentoId ??
    (current as RegRow).programma_spegnimento_id ??
    null;
  if (parsed.data.programmaSpegnimentoId) {
    const { data: stop } = await supabase
      .from("action_essiccatore_registrate")
      .select("id, essiccatore_id, programma_spegnimento")
      .eq("id", parsed.data.programmaSpegnimentoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      !stop ||
      String(stop.essiccatore_id) !== String((current as RegRow).essiccatore_id) ||
      !stop.programma_spegnimento
    ) {
      return { success: false, error: "Programma di spegnimento non valido." };
    }
    spegnimentoId = String(stop.id);
  }

  const { data, error } = await supabase
    .from("action_essiccatore_registrate")
    .update({
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione ?? "",
      temp_bruciatore_c: parsed.data.tempBruciatoreC,
      perc_ventilazione: parsed.data.percVentilazione,
      durata_minuti: parsed.data.durataMinuti,
      programma_spegnimento_id: spegnimentoId,
      versione: Number((current as RegRow).versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select(REG_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }

  if (
    spegnimentoId &&
    (parsed.data.spegnimentoTempC != null || parsed.data.spegnimentoVent != null)
  ) {
    await supabase
      .from("action_essiccatore_registrate")
      .update({
        temp_bruciatore_c:
          parsed.data.spegnimentoTempC ?? TEMP_BRUCIATORE_MIN_C,
        perc_ventilazione: parsed.data.spegnimentoVent ?? 70,
        updated_by: auth.userId,
      })
      .eq("id", spegnimentoId)
      .is("deleted_at", null);
  }

  const { data: stopRow } = spegnimentoId
    ? await supabase
        .from("action_essiccatore_registrate")
        .select("nome")
        .eq("id", spegnimentoId)
        .maybeSingle()
    : { data: null };

  const item = mapReg(data as RegRow, stopRow?.nome ? String(stopRow.nome) : null);
  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Azione registrata «${item.nome}» aggiornata (v${item.versione})`,
    payload: {
      tempBruciatoreC: item.tempBruciatoreC,
      percVentilazione: item.percVentilazione,
      programmaSpegnimentoId: spegnimentoId,
    },
  });
  return { success: true, item };
}

export async function softDeleteAzioneRegistrataAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Azione non valida." };
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("action_essiccatore_registrate")
    .select("id, esecuzione_stato, programma_spegnimento_id, programma_spegnimento")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Azione non trovata." };
  if (String(current.esecuzione_stato) === "in_corso") {
    return { success: false, error: "Arresta il programma prima di eliminarlo." };
  }
  const { error } = await supabase
    .from("action_essiccatore_registrate")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
      documento_stato: "chiuso",
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const twinId = current.programma_spegnimento_id
    ? String(current.programma_spegnimento_id)
    : null;
  if (twinId) {
    const { count } = await supabase
      .from("action_essiccatore_registrate")
      .select("id", { count: "exact", head: true })
      .eq("programma_spegnimento_id", twinId)
      .is("deleted_at", null);
    if ((count ?? 0) === 0) {
      await supabase
        .from("action_essiccatore_registrate")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
          documento_stato: "chiuso",
        })
        .eq("id", twinId)
        .eq("programma_spegnimento", true)
        .is("deleted_at", null);
    }
  }

  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: parsed.data.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Azione registrata archiviata",
    payload: { programmaSpegnimentoId: twinId },
  });
  return { success: true };
}

export async function avviaAzioneRegistrataAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionEssiccatoreAzione }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Azione non valida." };
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("action_essiccatore_registrate")
    .select(REG_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!reg) return { success: false, error: "Azione registrata non trovata." };
  const row = reg as RegRow;
  if (row.programma_spegnimento || row.azione_key === "arresto") {
    return { success: false, error: "Un programma di spegnimento non si avvia da qui." };
  }
  if (row.esecuzione_stato === "in_corso") {
    return { success: false, error: "Questo programma è già in corso." };
  }
  const { data: busy } = await supabase
    .from("action_essiccatore_registrate")
    .select("id, nome")
    .eq("essiccatore_id", row.essiccatore_id)
    .eq("esecuzione_stato", "in_corso")
    .is("deleted_at", null)
    .maybeSingle();
  if (busy) {
    return {
      success: false,
      error: `È già in corso «${busy.nome}». Arrestalo prima di avviarne un altro.`,
    };
  }

  const avvio = await avviaEssiccatoreAction({
    essiccatoreId: row.essiccatore_id,
    consensoBruciatore: true,
    consensoVentola: true,
    tempBruciatoreC: Number(row.temp_bruciatore_c),
    percVentilazione: Number(row.perc_ventilazione),
    kgManuale: 0,
    registrataId: row.id,
  });
  if (!avvio.success) return avvio;

  const { error } = await supabase
    .from("action_essiccatore_registrate")
    .update({
      esecuzione_stato: "in_corso",
      esecuzione_azione_id: avvio.item.id,
      updated_by: auth.userId,
    })
    .eq("id", row.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: row.id,
    action: "execute",
    actor_id: auth.userId,
    summary: `Avviata «${row.nome}» su ${essNome(row.essiccatore_id)}`,
    payload: { azioneId: avvio.item.id },
  });
  return { success: true, item: avvio.item };
}

export async function arrestaAzioneRegistrataAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionEssiccatoreAzione }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Azione non valida." };
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("action_essiccatore_registrate")
    .select(REG_COLS)
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!reg) return { success: false, error: "Azione registrata non trovata." };
  const row = reg as RegRow;
  if (row.esecuzione_stato !== "in_corso") {
    return { success: false, error: "Questo programma non è in corso." };
  }
  if (!row.programma_spegnimento_id) {
    return {
      success: false,
      error: "Manca il programma di spegnimento collegato.",
    };
  }
  const { data: stop } = await supabase
    .from("action_essiccatore_registrate")
    .select(REG_COLS)
    .eq("id", row.programma_spegnimento_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!stop) {
    return { success: false, error: "Programma di spegnimento non trovato." };
  }
  const stopRow = stop as RegRow;
  const arresto = await arrestaEssiccatoreAction({
    essiccatoreId: row.essiccatore_id,
    percVentilazione: Number(stopRow.perc_ventilazione),
    tempBruciatoreC: Number(stopRow.temp_bruciatore_c),
    registrataId: stopRow.id,
  });
  if (!arresto.success) return arresto;

  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: row.id,
    action: "execute",
    actor_id: auth.userId,
    summary: `Arresto «${row.nome}» tramite «${stopRow.nome}» su ${essNome(row.essiccatore_id)}`,
    payload: { azioneId: arresto.item.id, programmaSpegnimentoId: stopRow.id },
  });
  return { success: true, item: arresto.item };
}

export async function chiudiEsecuzioneRegistrataAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Azione non valida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_essiccatore_registrate")
    .update({
      esecuzione_stato: "ferma",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .eq("esecuzione_stato", "in_corso")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: "Esecuzione programma chiusa dopo arresto",
  });
  return { success: true };
}

export async function listAzioniProgrammateAction(
  raw: unknown
): Promise<
  | { success: true; items: AzioneProgrammata[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const parsed = essSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Essiccatore non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_essiccatore_programmate")
    .select(
      "id, essiccatore_id, registrata_id, esegui_at, stato, azione_esecuzione_id, versione, documento_stato, note, created_at"
    )
    .eq("essiccatore_id", parsed.data.essiccatoreId)
    .is("deleted_at", null)
    .order("esegui_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as ProgRow[];
  const ids = [...new Set(rows.map((r) => r.registrata_id))];
  const nomi = new Map<string, string>();
  if (ids.length) {
    const { data: regs } = await supabase
      .from("action_essiccatore_registrate")
      .select("id, nome")
      .in("id", ids);
    for (const r of regs ?? []) {
      nomi.set(String(r.id), String(r.nome));
    }
  }
  return {
    success: true,
    items: rows.map((r) => ({
      id: r.id,
      essiccatoreId: r.essiccatore_id,
      registrataId: r.registrata_id,
      registrataNome: nomi.get(r.registrata_id) ?? "Azione",
      eseguiAt: r.esegui_at,
      stato: r.stato,
      azioneEsecuzioneId: r.azione_esecuzione_id,
      versione: r.versione,
      documentoStato: r.documento_stato,
      note: r.note ?? "",
      createdAt: r.created_at,
    })),
  };
}

export async function createAzioneProgrammataAction(
  raw: unknown
): Promise<
  { success: true; itemId: string } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = programmataInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const when = new Date(parsed.data.eseguiAt);
  if (!Number.isFinite(when.getTime())) {
    return { success: false, error: "Data/ora non valida." };
  }
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("action_essiccatore_registrate")
    .select("id, nome, essiccatore_id")
    .eq("id", parsed.data.registrataId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!reg || String(reg.essiccatore_id) !== parsed.data.essiccatoreId) {
    return { success: false, error: "Azione registrata non trovata." };
  }
  const { data, error } = await supabase
    .from("action_essiccatore_programmate")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      registrata_id: parsed.data.registrataId,
      esegui_at: when.toISOString(),
      stato: "programmata",
      versione: 1,
      documento_stato: "approvato",
      note: parsed.data.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Programmazione fallita." };
  }
  await writeAuditLog({
    entity_type: "action_essiccatore_programmate",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Programmata «${reg.nome}» su ${essNome(parsed.data.essiccatoreId)} per ${formatEseguiAt(when.toISOString())}`,
  });
  return { success: true, itemId: String(data.id) };
}

export async function annullaAzioneProgrammataAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Programmazione non valida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_essiccatore_programmate")
    .update({
      stato: "annullata",
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .eq("stato", "programmata")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_essiccatore_programmate",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: "Programmazione annullata",
  });
  return { success: true };
}

export async function eseguiAzioneProgrammataAction(
  raw: unknown
): Promise<
  { success: true } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Programmazione non valida." };
  const supabase = await createClient();
  const { data: prog, error } = await supabase
    .from("action_essiccatore_programmate")
    .select("id, essiccatore_id, registrata_id, stato")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !prog) {
    return { success: false, error: error?.message ?? "Programmazione non trovata." };
  }
  if (String(prog.stato) !== "programmata") {
    return { success: false, error: "Questa programmazione non è più eseguibile." };
  }
  const { data: reg } = await supabase
    .from("action_essiccatore_registrate")
    .select("temp_bruciatore_c, perc_ventilazione, essiccatore_id")
    .eq("id", prog.registrata_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!reg) return { success: false, error: "Azione registrata non trovata." };

  await supabase
    .from("action_essiccatore_programmate")
    .update({ stato: "in_corso", updated_by: auth.userId })
    .eq("id", prog.id);

  const avvio = await avviaEssiccatoreAction({
    essiccatoreId: String(prog.essiccatore_id),
    consensoBruciatore: true,
    consensoVentola: true,
    tempBruciatoreC: Number(reg.temp_bruciatore_c),
    percVentilazione: Number(reg.perc_ventilazione),
    kgManuale: 0,
  });
  if (!avvio.success) {
    await supabase
      .from("action_essiccatore_programmate")
      .update({ stato: "errore", updated_by: auth.userId })
      .eq("id", prog.id);
    return avvio;
  }
  await supabase
    .from("action_essiccatore_programmate")
    .update({
      stato: "eseguita",
      documento_stato: "chiuso",
      azione_esecuzione_id: avvio.item.id,
      updated_by: auth.userId,
    })
    .eq("id", prog.id);
  await writeAuditLog({
    entity_type: "action_essiccatore_programmate",
    entity_id: String(prog.id),
    action: "execute",
    actor_id: auth.userId,
    summary: `Eseguita programmazione su ${essNome(String(prog.essiccatore_id))}`,
    payload: { azioneId: avvio.item.id },
  });
  return { success: true };
}

export async function listProcessiAction(
  raw: unknown
): Promise<
  { success: true; items: ProcessoAzione[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const parsed = essSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Essiccatore non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_essiccatore_processi")
    .select("id, essiccatore_id, nome, descrizione, versione, documento_stato, created_at")
    .eq("essiccatore_id", parsed.data.essiccatoreId)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const processi = data ?? [];
  const ids = processi.map((p) => String(p.id));
  const passiByProc = new Map<string, ProcessoPasso[]>();
  if (ids.length) {
    const { data: passi } = await supabase
      .from("action_essiccatore_processi_passi")
      .select("id, processo_id, registrata_id, sort_order")
      .in("processo_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const regIds = [...new Set((passi ?? []).map((x) => String(x.registrata_id)))];
    const nomi = new Map<string, string>();
    if (regIds.length) {
      const { data: regs } = await supabase
        .from("action_essiccatore_registrate")
        .select("id, nome")
        .in("id", regIds);
      for (const r of regs ?? []) nomi.set(String(r.id), String(r.nome));
    }
    for (const p of passi ?? []) {
      const pid = String(p.processo_id);
      const list = passiByProc.get(pid) ?? [];
      list.push({
        id: String(p.id),
        registrataId: String(p.registrata_id),
        registrataNome: nomi.get(String(p.registrata_id)) ?? "Azione",
        sortOrder: Number(p.sort_order),
      });
      passiByProc.set(pid, list);
    }
  }
  return {
    success: true,
    items: processi.map((p) => ({
      id: String(p.id),
      essiccatoreId: String(p.essiccatore_id),
      nome: String(p.nome),
      descrizione: String(p.descrizione ?? ""),
      versione: Number(p.versione ?? 1),
      documentoStato: (p.documento_stato ?? "approvato") as ProcessoAzione["documentoStato"],
      passi: passiByProc.get(String(p.id)) ?? [],
      createdAt: String(p.created_at),
    })),
  };
}

export async function createProcessoAction(
  raw: unknown
): Promise<{ success: true; itemId: string } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = processoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: regs } = await supabase
    .from("action_essiccatore_registrate")
    .select("id, essiccatore_id")
    .in("id", parsed.data.registrataIds)
    .is("deleted_at", null);
  if ((regs ?? []).length < 2) {
    return { success: false, error: "Seleziona almeno due azioni registrate." };
  }
  if ((regs ?? []).some((r) => String(r.essiccatore_id) !== parsed.data.essiccatoreId)) {
    return { success: false, error: "Le azioni devono appartenere a questo essiccatore." };
  }
  const { data: proc, error } = await supabase
    .from("action_essiccatore_processi")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione ?? "",
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !proc) {
    return { success: false, error: error?.message ?? "Creazione processo fallita." };
  }
  const { error: passiErr } = await supabase
    .from("action_essiccatore_processi_passi")
    .insert(
      parsed.data.registrataIds.map((rid, i) => ({
        processo_id: proc.id,
        registrata_id: rid,
        sort_order: i,
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    );
  if (passiErr) {
    await supabase
      .from("action_essiccatore_processi")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: auth.userId,
        documento_stato: "chiuso",
      })
      .eq("id", proc.id);
    return { success: false, error: passiErr.message };
  }
  await writeAuditLog({
    entity_type: "action_essiccatore_processi",
    entity_id: String(proc.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Processo «${parsed.data.nome.trim()}» su ${essNome(parsed.data.essiccatoreId)} (${parsed.data.registrataIds.length} azioni)`,
  });
  return { success: true, itemId: String(proc.id) };
}

export async function softDeleteProcessoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Processo non valido." };
  const now = new Date().toISOString();
  const supabase = await createClient();
  await supabase
    .from("action_essiccatore_processi_passi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("processo_id", parsed.data.id)
    .is("deleted_at", null);
  const { error } = await supabase
    .from("action_essiccatore_processi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
      documento_stato: "chiuso",
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_essiccatore_processi",
    entity_id: parsed.data.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Processo archiviato",
  });
  return { success: true };
}
