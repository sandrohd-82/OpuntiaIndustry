"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  attivitaCompatibileConArea,
  deprecaProcessoAttivitaSchema,
  deprecaProcessoSchema,
  processoAttivitaInputSchema,
  processoComposizioneSchema,
  processoInputSchema,
  type DeprecaProcessoAttivitaInput,
  type DeprecaProcessoInput,
  type Processo,
  type ProcessoAttivita,
  type ProcessoAttivitaInput,
  type ProcessoComposizioneInput,
  type ProcessoInput,
  type ProcessoPasso,
} from "@/lib/produzione/processi";
import { createClient } from "@/lib/supabase/server";
import {
  isScriptFunzione,
  type AttivitaScriptLink,
} from "@/lib/script/catalogo";

const ATTIVITA_COLS =
  "id, codice, nome, descrizione, attivo, note, created_at, area_id, posto_id, deprecato_at, deprecato_by, deprecato_note, sostituito_da";
const PROCESSO_COLS =
  "id, codice, nome, descrizione, attivo, note, versione, documento_stato, created_at, area_id, deprecato_at, deprecato_by, deprecato_note, sostituito_da";

type AttivitaRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  attivo: boolean;
  note: string | null;
  created_at: string;
  area_id: string | null;
  posto_id: string | null;
  deprecato_at: string | null;
  deprecato_by: string | null;
  deprecato_note: string | null;
  sostituito_da: string | null;
};

type ProcessoRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  attivo: boolean;
  note: string | null;
  versione: number;
  documento_stato: string;
  created_at: string;
  area_id: string | null;
  deprecato_at: string | null;
  deprecato_by: string | null;
  deprecato_note: string | null;
  sostituito_da: string | null;
};

type PassoRow = {
  id: string;
  processo_id: string;
  attivita_id: string;
  sort_order: number;
  obbligatorio: boolean;
  note: string | null;
  produzione_processo_attivita: {
    codice: string;
    nome: string;
    area_id: string | null;
    posto_id: string | null;
  } | null;
};

type Luoghi = {
  areaNome: Map<string, string>;
  postoNome: Map<string, string>;
};

async function loadLuoghi(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Luoghi> {
  const [areeRes, postiRes] = await Promise.all([
    supabase
      .from("produzione_aree")
      .select("id, nome")
      .is("deleted_at", null),
    supabase
      .from("produzione_posti_lavoro")
      .select("id, nome")
      .is("deleted_at", null),
  ]);
  const areaNome = new Map<string, string>();
  const postoNome = new Map<string, string>();
  for (const row of (areeRes.data ?? []) as Array<{ id: string; nome: string }>) {
    areaNome.set(row.id, row.nome);
  }
  for (const row of (postiRes.data ?? []) as Array<{
    id: string;
    nome: string;
  }>) {
    postoNome.set(row.id, row.nome);
  }
  return { areaNome, postoNome };
}

async function loadScriptsByAttivita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attivitaIds: string[]
): Promise<Map<string, AttivitaScriptLink[]>> {
  const map = new Map<string, AttivitaScriptLink[]>();
  if (attivitaIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_attivita_script")
    .select(
      "attivita_id, sort_order, gestionale_script(id, codice, nome, funzione)"
    )
    .in("attivita_id", attivitaIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as Array<{
    attivita_id: string;
    gestionale_script:
      | { id: string; codice: string; nome: string; funzione: string }
      | { id: string; codice: string; nome: string; funzione: string }[]
      | null;
  }>) {
    const raw = row.gestionale_script;
    const s = Array.isArray(raw) ? raw[0] : raw;
    if (!s || !isScriptFunzione(s.funzione)) continue;
    const list = map.get(row.attivita_id) ?? [];
    list.push({
      id: s.id,
      codice: s.codice,
      nome: s.nome,
      funzione: s.funzione,
    });
    map.set(row.attivita_id, list);
  }
  return map;
}

async function attachScriptsToAttivita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: ProcessoAttivita[]
): Promise<ProcessoAttivita[]> {
  const scripts = await loadScriptsByAttivita(
    supabase,
    items.map((i) => i.id)
  );
  return items.map((i) => ({ ...i, scripts: scripts.get(i.id) ?? [] }));
}

async function syncAttivitaScripts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attivitaId: string,
  scriptIds: string[],
  userId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const unique = [...new Set(scriptIds)];
  if (unique.length > 0) {
    const { count } = await supabase
      .from("gestionale_script")
      .select("id", { count: "exact", head: true })
      .in("id", unique)
      .is("deleted_at", null)
      .eq("attivo", true);
    if ((count ?? 0) !== unique.length) {
      return { success: false, error: "Uno o più script non sono validi o attivi." };
    }
  }
  const now = new Date().toISOString();
  const { error: softErr } = await supabase
    .from("produzione_processo_attivita_script")
    .update({
      deleted_at: now,
      deleted_by: userId,
      updated_by: userId,
    })
    .eq("attivita_id", attivitaId)
    .is("deleted_at", null);
  if (softErr) return { success: false, error: softErr.message };
  if (unique.length === 0) return { success: true };
  const { error } = await supabase
    .from("produzione_processo_attivita_script")
    .insert(
      unique.map((scriptId, index) => ({
        attivita_id: attivitaId,
        script_id: scriptId,
        sort_order: index + 1,
        created_by: userId,
        updated_by: userId,
      }))
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

function mapAttivita(row: AttivitaRow, luoghi: Luoghi): ProcessoAttivita {
  const areaId = row.area_id ?? null;
  const postoId = row.posto_id ?? null;
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    areaId,
    postoId,
    areaNome: areaId ? (luoghi.areaNome.get(areaId) ?? "") : "",
    postoNome: postoId ? (luoghi.postoNome.get(postoId) ?? "") : "",
    scripts: [],
    createdAt: row.created_at,
    deprecatoAt: row.deprecato_at ?? null,
    deprecatoBy: row.deprecato_by ?? null,
    deprecatoNote: row.deprecato_note ?? "",
    sostituitoDa: row.sostituito_da ?? null,
  };
}

function mapProcesso(
  row: ProcessoRow,
  luoghi: Luoghi,
  passiCount = 0,
  sostituto?: { codice: string; nome: string } | null
): Processo {
  const areaId = row.area_id ?? null;
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    attivo: Boolean(row.attivo),
    note: row.note ?? "",
    areaId,
    areaNome: areaId ? (luoghi.areaNome.get(areaId) ?? "") : "",
    versione: row.versione,
    deprecatoAt: row.deprecato_at,
    deprecatoBy: row.deprecato_by,
    deprecatoNote: row.deprecato_note ?? "",
    sostituitoDa: row.sostituito_da,
    sostituitoDaCodice: sostituto?.codice ?? "",
    sostituitoDaNome: sostituto?.nome ?? "",
    createdAt: row.created_at,
    passiCount,
  };
}

async function loadSostituti(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ProcessoRow[]
): Promise<Map<string, { codice: string; nome: string }>> {
  const ids = [
    ...new Set(rows.map((r) => r.sostituito_da).filter((id): id is string => Boolean(id))),
  ];
  const map = new Map<string, { codice: string; nome: string }>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processi")
    .select("id, codice, nome")
    .in("id", ids);
  for (const row of (data ?? []) as Array<{
    id: string;
    codice: string;
    nome: string;
  }>) {
    map.set(row.id, { codice: row.codice, nome: row.nome });
  }
  return map;
}

function assertInElenco(
  row: { deprecato_at?: string | null; deleted_at?: string | null }
): { success: true } | { success: false; error: string } {
  if (row.deprecato_at) {
    return {
      success: false,
      error: "Processo deprecato: è nello storico e non si modifica. Ripristinalo in elenco se serve.",
    };
  }
  return { success: true };
}

function mapPasso(row: PassoRow, luoghi: Luoghi): ProcessoPasso {
  const areaId = row.produzione_processo_attivita?.area_id ?? null;
  const postoId = row.produzione_processo_attivita?.posto_id ?? null;
  return {
    id: row.id,
    processoId: row.processo_id,
    attivitaId: row.attivita_id,
    sortOrder: row.sort_order,
    obbligatorio: Boolean(row.obbligatorio),
    note: row.note ?? "",
    attivitaCodice: row.produzione_processo_attivita?.codice ?? "",
    attivitaNome: row.produzione_processo_attivita?.nome ?? "",
    attivitaAreaId: areaId,
    attivitaPostoId: postoId,
    attivitaAreaNome: areaId ? (luoghi.areaNome.get(areaId) ?? "") : "",
    attivitaPostoNome: postoId ? (luoghi.postoNome.get(postoId) ?? "") : "",
    scripts: [],
  };
}

async function countPassiByProcesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (processoIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_passi")
    .select("processo_id")
    .in("processo_id", processoIds)
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const id = (row as { processo_id: string }).processo_id;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

async function resolveAreaPosto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  areaId: string | null,
  postoId: string | null
): Promise<{ success: true } | { success: false; error: string }> {
  if (postoId && !areaId) {
    return { success: false, error: "La postazione richiede un'area." };
  }
  if (areaId) {
    const { data: area, error } = await supabase
      .from("produzione_aree")
      .select("id")
      .eq("id", areaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!area) return { success: false, error: "Area non trovata." };
  }
  if (postoId) {
    const { data: posto, error } = await supabase
      .from("produzione_posti_lavoro")
      .select("id, area_id")
      .eq("id", postoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!posto) return { success: false, error: "Postazione non trovata." };
    if ((posto as { area_id: string }).area_id !== areaId) {
      return {
        success: false,
        error: "La postazione non appartiene all'area selezionata.",
      };
    }
  }
  return { success: true };
}

async function assertProcessoAreaCompatibile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string,
  areaId: string | null
): Promise<{ success: true } | { success: false; error: string }> {
  if (!areaId) return { success: true };
  const { data, error } = await supabase
    .from("produzione_processo_passi")
    .select("attivita_id")
    .eq("processo_id", processoId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const attivitaIds = [
    ...new Set(
      ((data ?? []) as Array<{ attivita_id: string }>).map((r) => r.attivita_id)
    ),
  ];
  if (attivitaIds.length === 0) return { success: true };

  const { data: atts, error: attErr } = await supabase
    .from("produzione_processo_attivita")
    .select("area_id, codice")
    .in("id", attivitaIds)
    .is("deleted_at", null);
  if (attErr) return { success: false, error: attErr.message };

  for (const att of (atts ?? []) as Array<{
    area_id: string | null;
    codice: string;
  }>) {
    if (!attivitaCompatibileConArea(att.area_id, areaId)) {
      return {
        success: false,
        error: `Il processo ha attività di un'altra area (${att.codice}). Rimuovile dalla composizione prima di cambiare area.`,
      };
    }
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Attività di processo
// ---------------------------------------------------------------------------

async function listAttivitaByCollocazione(
  storico: boolean,
  onlyAttive = false
): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  let query = supabase
    .from("produzione_processo_attivita")
    .select(ATTIVITA_COLS)
    .is("deleted_at", null);
  query = storico
    ? query.not("deprecato_at", "is", null)
    : query.is("deprecato_at", null);
  if (onlyAttive) query = query.eq("attivo", true);
  const { data, error } = await query.order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  const luoghi = await loadLuoghi(supabase);
  return {
    success: true,
    items: await attachScriptsToAttivita(
      supabase,
      ((data ?? []) as AttivitaRow[]).map((row) => mapAttivita(row, luoghi))
    ),
  };
}

export async function listProcessoAttivitaAction(): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  return listAttivitaByCollocazione(false);
}

export async function listProcessoAttivitaStoricoAction(): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  return listAttivitaByCollocazione(true);
}

export async function listProcessoAttivitaAttiveAction(): Promise<
  { success: true; items: ProcessoAttivita[] } | { success: false; error: string }
> {
  return listAttivitaByCollocazione(false, true);
}

export async function createProcessoAttivitaAction(
  raw: ProcessoAttivitaInput
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoAttivitaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const areaId = parsed.data.areaId ?? null;
  const postoId = parsed.data.postoId ?? null;
  const luogo = await resolveAreaPosto(supabase, areaId, postoId);
  if (!luogo.success) return luogo;

  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      area_id: areaId,
      posto_id: postoId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(ATTIVITA_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice attività già esistente." };
    }
    return { success: false, error: error.message };
  }
  const luoghi = await loadLuoghi(supabase);
  const created = mapAttivita(data as AttivitaRow, luoghi);
  const scripts = await syncAttivitaScripts(
    supabase,
    created.id,
    parsed.data.scriptIds,
    auth.userId
  );
  if (!scripts.success) return scripts;
  const [item] = await attachScriptsToAttivita(supabase, [created]);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: created.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata attività di processo ${created.codice}`,
    payload: {
      codice: created.codice,
      nome: created.nome,
      area_id: created.areaId,
      posto_id: created.postoId,
      script_ids: parsed.data.scriptIds,
    },
  });
  return { success: true, item: item ?? created };
}

export async function updateProcessoAttivitaAction(
  id: string,
  raw: ProcessoAttivitaInput
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoAttivitaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const areaId = parsed.data.areaId ?? null;
  const postoId = parsed.data.postoId ?? null;
  const luogo = await resolveAreaPosto(supabase, areaId, postoId);
  if (!luogo.success) return luogo;

  const { data: existing, error: loadErr } = await supabase
    .from("produzione_processo_attivita")
    .select("id, deprecato_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Attività non trovata." };
  if ((existing as { deprecato_at: string | null }).deprecato_at) {
    return {
      success: false,
      error:
        "Attività deprecata: è nello storico e non si modifica. Ripristinala in elenco se serve.",
    };
  }

  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: parsed.data.attivo ?? true,
      area_id: areaId,
      posto_id: postoId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(ATTIVITA_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice attività già esistente." };
    }
    return { success: false, error: error.message };
  }
  const luoghi = await loadLuoghi(supabase);
  const updated = mapAttivita(data as AttivitaRow, luoghi);
  const scripts = await syncAttivitaScripts(
    supabase,
    updated.id,
    parsed.data.scriptIds,
    auth.userId
  );
  if (!scripts.success) return scripts;
  const [item] = await attachScriptsToAttivita(supabase, [updated]);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: updated.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata attività di processo ${updated.codice}`,
    payload: {
      codice: updated.codice,
      nome: updated.nome,
      area_id: updated.areaId,
      posto_id: updated.postoId,
      script_ids: parsed.data.scriptIds,
    },
  });
  return { success: true, item: item ?? updated };
}

export async function softDeleteProcessoAttivitaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();

  const { count } = await supabase
    .from("produzione_processo_passi")
    .select("id", { count: "exact", head: true })
    .eq("attivita_id", id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error:
        "Attività ancora usata in uno o più processi. Rimuovila dalle composizioni prima di eliminarla.",
    };
  }

  const { error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete attività di processo",
    payload: {},
  });
  return { success: true };
}

export async function deprecaProcessoAttivitaAction(
  id: string,
  raw: DeprecaProcessoAttivitaInput
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = deprecaProcessoAttivitaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("produzione_processo_attivita")
    .select("id, codice, deprecato_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Attività non trovata." };
  if ((existing as { deprecato_at: string | null }).deprecato_at) {
    return { success: false, error: "Attività già nello storico." };
  }

  const sostituitoDa = parsed.data.sostituitoDa ?? null;
  if (sostituitoDa) {
    if (sostituitoDa === id) {
      return {
        success: false,
        error: "Un'attività non può sostituire se stessa.",
      };
    }
    const { data: dest, error: destErr } = await supabase
      .from("produzione_processo_attivita")
      .select("id, deprecato_at")
      .eq("id", sostituitoDa)
      .is("deleted_at", null)
      .maybeSingle();
    if (destErr) return { success: false, error: destErr.message };
    if (!dest) {
      return { success: false, error: "Attività sostitutiva non trovata." };
    }
    if ((dest as { deprecato_at: string | null }).deprecato_at) {
      return {
        success: false,
        error: "L'attività sostitutiva deve essere in elenco, non nello storico.",
      };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      deprecato_at: now,
      deprecato_by: auth.userId,
      deprecato_note: parsed.data.note?.trim() ?? "",
      sostituito_da: sostituitoDa,
      attivo: false,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .is("deprecato_at", null)
    .select(ATTIVITA_COLS)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Attività non trovata." };
  const luoghi = await loadLuoghi(supabase);
  const mapped = mapAttivita(data as AttivitaRow, luoghi);
  const [item] = await attachScriptsToAttivita(supabase, [mapped]);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: mapped.id,
    action: "deprecate",
    actor_id: auth.userId,
    summary: `Deprecata attività ${(existing as { codice: string }).codice}`,
    payload: {
      deprecato_at: now,
      deprecato_note: parsed.data.note?.trim() ?? "",
      sostituito_da: sostituitoDa,
    },
  });
  return { success: true, item: item ?? mapped };
}

export async function ripristinaProcessoAttivitaAction(
  id: string
): Promise<
  { success: true; item: ProcessoAttivita } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processo_attivita")
    .update({
      deprecato_at: null,
      deprecato_by: null,
      deprecato_note: "",
      sostituito_da: null,
      attivo: true,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .not("deprecato_at", "is", null)
    .select(ATTIVITA_COLS)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return { success: false, error: "Attività non trovata nello storico." };
  }
  const luoghi = await loadLuoghi(supabase);
  const mapped = mapAttivita(data as AttivitaRow, luoghi);
  const [item] = await attachScriptsToAttivita(supabase, [mapped]);
  void writeAuditLog({
    entity_type: "produzione_processo_attivita",
    entity_id: mapped.id,
    action: "restore",
    actor_id: auth.userId,
    summary: `Ripristinata in elenco attività ${mapped.codice}`,
    payload: {},
  });
  return { success: true, item: item ?? mapped };
}

// ---------------------------------------------------------------------------
// Processi
// ---------------------------------------------------------------------------

async function listProcessiByCollocazione(
  storico: boolean
): Promise<
  { success: true; items: Processo[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  let query = supabase
    .from("produzione_processi")
    .select(PROCESSO_COLS)
    .is("deleted_at", null);
  query = storico
    ? query.not("deprecato_at", "is", null)
    : query.is("deprecato_at", null);
  const { data, error } = await query.order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as ProcessoRow[];
  const [counts, luoghi, sostituti] = await Promise.all([
    countPassiByProcesso(
      supabase,
      rows.map((r) => r.id)
    ),
    loadLuoghi(supabase),
    loadSostituti(supabase, rows),
  ]);
  return {
    success: true,
    items: rows.map((r) =>
      mapProcesso(
        r,
        luoghi,
        counts.get(r.id) ?? 0,
        r.sostituito_da ? (sostituti.get(r.sostituito_da) ?? null) : null
      )
    ),
  };
}

export async function listProcessiAction(): Promise<
  { success: true; items: Processo[] } | { success: false; error: string }
> {
  return listProcessiByCollocazione(false);
}

export async function listProcessiStoricoAction(): Promise<
  { success: true; items: Processo[] } | { success: false; error: string }
> {
  return listProcessiByCollocazione(true);
}

export async function getProcessoAction(
  id: string
): Promise<
  | { success: true; item: Processo; passi: ProcessoPasso[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .select(PROCESSO_COLS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Processo non trovato." };

  const passiRes = await listProcessoPassiInternal(supabase, id);
  if (!passiRes.success) return passiRes;

  const row = data as ProcessoRow;
  const [luoghi, sostituti] = await Promise.all([
    loadLuoghi(supabase),
    loadSostituti(supabase, [row]),
  ]);
  return {
    success: true,
    item: mapProcesso(
      row,
      luoghi,
      passiRes.passi.length,
      row.sostituito_da ? (sostituti.get(row.sostituito_da) ?? null) : null
    ),
    passi: passiRes.passi,
  };
}

export async function createProcessoAction(
  raw: ProcessoInput
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const areaId = parsed.data.areaId ?? null;
  const luogo = await resolveAreaPosto(supabase, areaId, null);
  if (!luogo.success) return luogo;

  const { data, error } = await supabase
    .from("produzione_processi")
    .insert({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: true,
      area_id: areaId,
      versione: 1,
      documento_stato: "approvato",
      deprecato_at: null,
      deprecato_by: null,
      deprecato_note: "",
      sostituito_da: null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(PROCESSO_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice processo già esistente." };
    }
    return { success: false, error: error.message };
  }
  const luoghi = await loadLuoghi(supabase);
  const item = mapProcesso(data as ProcessoRow, luoghi, 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato processo ${item.codice}`,
    payload: {
      codice: item.codice,
      nome: item.nome,
      versione: 1,
      area_id: item.areaId,
    },
  });
  return { success: true, item };
}

export async function updateProcessoAction(
  id: string,
  raw: ProcessoInput
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const areaId = parsed.data.areaId ?? null;
  const luogo = await resolveAreaPosto(supabase, areaId, null);
  if (!luogo.success) return luogo;

  const { data: existing, error: loadErr } = await supabase
    .from("produzione_processi")
    .select("id, deprecato_at, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Processo non trovato." };
  const inElenco = assertInElenco(existing as { deprecato_at: string | null });
  if (!inElenco.success) return inElenco;

  const compat = await assertProcessoAreaCompatibile(supabase, id, areaId);
  if (!compat.success) return compat;

  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      codice: parsed.data.codice.trim().toUpperCase(),
      nome: parsed.data.nome.trim(),
      descrizione: parsed.data.descrizione?.trim() ?? "",
      note: parsed.data.note?.trim() ?? "",
      attivo: true,
      area_id: areaId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROCESSO_COLS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Codice processo già esistente." };
    }
    return { success: false, error: error.message };
  }
  const [counts, luoghi] = await Promise.all([
    countPassiByProcesso(supabase, [id]),
    loadLuoghi(supabase),
  ]);
  const item = mapProcesso(data as ProcessoRow, luoghi, counts.get(id) ?? 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato processo ${item.codice}`,
    payload: {
      codice: item.codice,
      nome: item.nome,
      versione: item.versione,
      area_id: item.areaId,
    },
  });
  return { success: true, item };
}

export async function deprecaProcessoAction(
  id: string,
  raw: DeprecaProcessoInput
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = deprecaProcessoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("produzione_processi")
    .select("id, codice, deprecato_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!existing) return { success: false, error: "Processo non trovato." };
  const inElenco = assertInElenco(existing as { deprecato_at: string | null });
  if (!inElenco.success) return inElenco;

  const sostituitoDa = parsed.data.sostituitoDa ?? null;
  if (sostituitoDa) {
    if (sostituitoDa === id) {
      return {
        success: false,
        error: "Un processo non può sostituire se stesso.",
      };
    }
    const { data: dest, error: destErr } = await supabase
      .from("produzione_processi")
      .select("id, deprecato_at")
      .eq("id", sostituitoDa)
      .is("deleted_at", null)
      .maybeSingle();
    if (destErr) return { success: false, error: destErr.message };
    if (!dest) {
      return { success: false, error: "Processo sostitutivo non trovato." };
    }
    if ((dest as { deprecato_at: string | null }).deprecato_at) {
      return {
        success: false,
        error: "Il processo sostitutivo deve essere in elenco, non nello storico.",
      };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      deprecato_at: now,
      deprecato_by: auth.userId,
      deprecato_note: parsed.data.note?.trim() ?? "",
      sostituito_da: sostituitoDa,
      attivo: false,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .is("deprecato_at", null)
    .select(PROCESSO_COLS)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Processo non trovato." };
  const row = data as ProcessoRow;
  const [counts, luoghi, sostituti] = await Promise.all([
    countPassiByProcesso(supabase, [id]),
    loadLuoghi(supabase),
    loadSostituti(supabase, [row]),
  ]);
  const item = mapProcesso(
    row,
    luoghi,
    counts.get(id) ?? 0,
    row.sostituito_da ? (sostituti.get(row.sostituito_da) ?? null) : null
  );
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "deprecate",
    actor_id: auth.userId,
    summary: `Deprecato processo ${(existing as { codice: string }).codice}`,
    payload: {
      deprecato_at: now,
      deprecato_note: item.deprecatoNote,
      sostituito_da: sostituitoDa,
    },
  });
  return { success: true, item };
}

export async function ripristinaProcessoAction(
  id: string
): Promise<
  { success: true; item: Processo } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_processi")
    .update({
      deprecato_at: null,
      deprecato_by: null,
      deprecato_note: "",
      sostituito_da: null,
      attivo: true,
      documento_stato: "approvato",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .not("deprecato_at", "is", null)
    .select(PROCESSO_COLS)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return { success: false, error: "Processo non trovato nello storico." };
  }
  const [counts, luoghi] = await Promise.all([
    countPassiByProcesso(supabase, [id]),
    loadLuoghi(supabase),
  ]);
  const item = mapProcesso(data as ProcessoRow, luoghi, counts.get(id) ?? 0);
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: item.id,
    action: "restore",
    actor_id: auth.userId,
    summary: `Ripristinato in elenco processo ${item.codice}`,
    payload: {},
  });
  return { success: true, item };
}

export async function softDeleteProcessoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: passiErr } = await supabase
    .from("produzione_processo_passi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("processo_id", id)
    .is("deleted_at", null);
  if (passiErr) return { success: false, error: passiErr.message };

  const { error } = await supabase
    .from("produzione_processi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
      attivo: false,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Eliminato processo errato o di test",
    payload: { motivo: "errato_o_test" },
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Composizione
// ---------------------------------------------------------------------------

async function listProcessoPassiInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  const { data, error } = await supabase
    .from("produzione_processo_passi")
    .select(
      "id, processo_id, attivita_id, sort_order, obbligatorio, note, produzione_processo_attivita(codice, nome, area_id, posto_id)"
    )
    .eq("processo_id", processoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const luoghi = await loadLuoghi(supabase);
  const passi = ((data ?? []) as unknown as PassoRow[]).map((row) =>
    mapPasso(row, luoghi)
  );
  const scripts = await loadScriptsByAttivita(
    supabase,
    passi.map((p) => p.attivitaId)
  );
  return {
    success: true,
    passi: passi.map((p) => ({
      ...p,
      scripts: scripts.get(p.attivitaId) ?? [],
    })),
  };
}

export async function listProcessoPassiAction(
  processoId: string
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  return listProcessoPassiInternal(supabase, processoId);
}

export async function setProcessoComposizioneAction(
  processoId: string,
  raw: ProcessoComposizioneInput
): Promise<
  { success: true; passi: ProcessoPasso[] } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = processoComposizioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Composizione non valida.",
    };
  }

  const attivitaIds = parsed.data.passi.map((p) => p.attivitaId);
  if (new Set(attivitaIds).size !== attivitaIds.length) {
    return {
      success: false,
      error: "La stessa attività non può comparire due volte nello stesso processo.",
    };
  }

  const supabase = await createClient();

  const { data: processo, error: loadErr } = await supabase
    .from("produzione_processi")
    .select("id, codice, deprecato_at, area_id")
    .eq("id", processoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadErr) return { success: false, error: loadErr.message };
  if (!processo) return { success: false, error: "Processo non trovato." };
  const inElenco = assertInElenco(processo as { deprecato_at: string | null });
  if (!inElenco.success) return inElenco;

  const processoAreaId = (processo as { area_id: string | null }).area_id ?? null;

  if (attivitaIds.length > 0) {
    const { data: atts, error: attErr } = await supabase
      .from("produzione_processo_attivita")
      .select("id, area_id, codice, attivo")
      .in("id", attivitaIds)
      .is("deleted_at", null);
    if (attErr) return { success: false, error: attErr.message };
    const rows = (atts ?? []) as Array<{
      id: string;
      area_id: string | null;
      codice: string;
      attivo: boolean;
    }>;
    if (rows.length !== attivitaIds.length) {
      return {
        success: false,
        error: "Una o più attività non sono valide.",
      };
    }
    if (rows.some((a) => !a.attivo)) {
      return {
        success: false,
        error: "Una o più attività non sono attive.",
      };
    }
    const incompatibile = rows.find(
      (a) => !attivitaCompatibileConArea(a.area_id, processoAreaId)
    );
    if (incompatibile) {
      return {
        success: false,
        error: `L'attività ${incompatibile.codice} appartiene a un'altra area rispetto al processo.`,
      };
    }
  }

  const now = new Date().toISOString();
  const { error: softErr } = await supabase
    .from("produzione_processo_passi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("processo_id", processoId)
    .is("deleted_at", null);
  if (softErr) return { success: false, error: softErr.message };

  if (parsed.data.passi.length > 0) {
    const rows = parsed.data.passi.map((p, index) => ({
      processo_id: processoId,
      attivita_id: p.attivitaId,
      sort_order: index + 1,
      obbligatorio: p.obbligatorio ?? true,
      note: p.note?.trim() ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    }));
    const { error: insertErr } = await supabase
      .from("produzione_processo_passi")
      .insert(rows);
    if (insertErr) return { success: false, error: insertErr.message };
  }

  await supabase
    .from("produzione_processi")
    .update({ updated_by: auth.userId })
    .eq("id", processoId)
    .is("deleted_at", null);

  const passiRes = await listProcessoPassiInternal(supabase, processoId);
  if (!passiRes.success) return passiRes;

  void writeAuditLog({
    entity_type: "produzione_processi",
    entity_id: processoId,
    action: "update_composition",
    actor_id: auth.userId,
    summary: `Aggiornata composizione processo ${(processo as { codice: string }).codice}`,
    payload: {
      passi: passiRes.passi.map((p) => ({
        attivita_id: p.attivitaId,
        codice: p.attivitaCodice,
        sort_order: p.sortOrder,
      })),
    },
  });

  return { success: true, passi: passiRes.passi };
}
