"use server";

import { writeAuditLog } from "@/lib/audit";
import { avviaEssiccatoreAction } from "@/app/actions/action-essiccatore-azioni";
import {
  formatEseguiAt,
  processoInputSchema,
  programmataInputSchema,
  registrataInputSchema,
  type AzioneProgrammata,
  type AzioneRegistrata,
  type ProcessoAzione,
  type ProcessoPasso,
  type ProgrammataStato,
} from "@/lib/action/azioni-catalogo";
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
  versione: number;
  documento_stato: AzioneRegistrata["documentoStato"];
  created_at: string;
};

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

function mapReg(r: RegRow): AzioneRegistrata {
  return {
    id: r.id,
    essiccatoreId: r.essiccatore_id,
    azioneKey: "avvio",
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    tempBruciatoreC: r.temp_bruciatore_c,
    percVentilazione: r.perc_ventilazione,
    durataMinuti: r.durata_minuti == null ? null : Number(r.durata_minuti),
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
  const parsed = essSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Essiccatore non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_essiccatore_registrate")
    .select(
      "id, essiccatore_id, azione_key, nome, descrizione, temp_bruciatore_c, perc_ventilazione, durata_minuti, versione, documento_stato, created_at"
    )
    .eq("essiccatore_id", parsed.data.essiccatoreId)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: ((data ?? []) as RegRow[]).map(mapReg) };
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
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, essiccatore_id, azione_key, nome, descrizione, temp_bruciatore_c, perc_ventilazione, durata_minuti, versione, documento_stato, created_at"
    )
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const item = mapReg(data as RegRow);
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
  await writeAuditLog({
    entity_type: "action_essiccatore_registrate",
    entity_id: parsed.data.id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Azione registrata archiviata",
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
