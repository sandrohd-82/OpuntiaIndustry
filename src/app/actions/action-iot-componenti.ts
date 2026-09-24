"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  buildIotAlbero,
  canaleEAzione,
  collegamentoInputSchema,
  componenteInputSchema,
  defaultRangeForTipo,
  macchinaInputSchema,
  prossimoMexCmdLibero,
  moduloInputSchema,
  type ActionIotAlbero,
  type ActionIotComponente,
  type ActionIotMacchina,
  type ActionIotModulo,
  type ActionIotSensoreCollegamento,
  type IotAttuatoreTipo,
  type IotCanaleRuolo,
  type IotLinkRuolo,
  type IotMacchinaTipo,
  type IotPrecondizione,
} from "@/lib/action/iot-componenti";
import type { DocumentoStatoCatalogo } from "@/lib/action/azioni-catalogo";
import { z } from "zod";

type CompRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  ruolo: string;
  tipo_attuatore: string | null;
  macchina_id: string | null;
  modulo_id: string | null;
  essiccatore_id: string | null;
  area_slug: string;
  richiede_consenso: boolean;
  valore_min: number;
  valore_max: number;
  valore_default: number;
  unita: string;
  precondizione: string;
  mex_cmd: number | null;
  durata_impulso_default_sec: number | null;
  impostazioni: Record<string, unknown> | null;
  versione: number;
  documento_stato: string;
  created_at: string;
};

type MacRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  tipo_macchina: string;
  essiccatore_id: string | null;
  versione: number;
  documento_stato: string;
};

type ModRow = {
  id: string;
  macchina_id: string;
  codice: string;
  nome: string;
  descrizione: string;
  sort_order: number;
  versione: number;
  documento_stato: string;
};

type LinkRow = {
  id: string;
  sensore_id: string;
  canale_id: string;
  ruolo_link: string;
  note: string;
  versione: number;
  documento_stato: string;
};

const COMP_COLS =
  "id, codice, nome, descrizione, ruolo, tipo_attuatore, macchina_id, modulo_id, essiccatore_id, area_slug, richiede_consenso, valore_min, valore_max, valore_default, unita, precondizione, mex_cmd, durata_impulso_default_sec, impostazioni, versione, documento_stato, created_at";
const MAC_COLS =
  "id, codice, nome, descrizione, tipo_macchina, essiccatore_id, versione, documento_stato";
const MOD_COLS =
  "id, macchina_id, codice, nome, descrizione, sort_order, versione, documento_stato";
const LINK_COLS =
  "id, sensore_id, canale_id, ruolo_link, note, versione, documento_stato";

function mapMac(r: MacRow): ActionIotMacchina {
  return {
    id: r.id,
    codice: r.codice,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    tipoMacchina: (r.tipo_macchina as IotMacchinaTipo) || "essiccatore",
    essiccatoreId: r.essiccatore_id,
    versione: Number(r.versione ?? 1),
    documentoStato: (r.documento_stato as DocumentoStatoCatalogo) || "approvato",
  };
}

function mapMod(r: ModRow): ActionIotModulo {
  return {
    id: r.id,
    macchinaId: r.macchina_id,
    codice: r.codice,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    versione: Number(r.versione ?? 1),
    documentoStato: (r.documento_stato as DocumentoStatoCatalogo) || "approvato",
  };
}

function mapComp(
  r: CompRow,
  names: { macchinaNome?: string; moduloNome?: string } = {}
): ActionIotComponente {
  return {
    id: r.id,
    codice: r.codice,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    ruolo: (r.ruolo as IotCanaleRuolo) || "attuatore",
    tipoAttuatore: (r.tipo_attuatore as IotAttuatoreTipo) || null,
    macchinaId: r.macchina_id,
    moduloId: r.modulo_id,
    macchinaNome: names.macchinaNome ?? "",
    moduloNome: names.moduloNome ?? "",
    essiccatoreId: r.essiccatore_id,
    areaSlug: r.area_slug,
    richiedeConsenso: Boolean(r.richiede_consenso),
    valoreMin: Number(r.valore_min),
    valoreMax: Number(r.valore_max),
    valoreDefault: Number(r.valore_default),
    unita: r.unita ?? "",
    precondizione: (r.precondizione as IotPrecondizione) || "nessuna",
    mexCmd: r.mex_cmd == null ? null : Number(r.mex_cmd),
    durataImpulsoDefaultSec:
      r.durata_impulso_default_sec == null
        ? null
        : Number(r.durata_impulso_default_sec),
    impostazioni: r.impostazioni ?? {},
    versione: Number(r.versione ?? 1),
    documentoStato: (r.documento_stato as DocumentoStatoCatalogo) || "approvato",
    createdAt: r.created_at,
  };
}

function mapLink(
  r: LinkRow,
  names: { sensoreNome?: string; canaleNome?: string } = {}
): ActionIotSensoreCollegamento {
  return {
    id: r.id,
    sensoreId: r.sensore_id,
    canaleId: r.canale_id,
    ruoloLink: (r.ruolo_link as IotLinkRuolo) || "feedback",
    note: r.note ?? "",
    sensoreNome: names.sensoreNome ?? "",
    canaleNome: names.canaleNome ?? "",
    versione: Number(r.versione ?? 1),
    documentoStato: (r.documento_stato as DocumentoStatoCatalogo) || "approvato",
  };
}

function failParse(message: string): { success: false; error: string } {
  return { success: false, error: message };
}

async function allocaMexCmdAutomatico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ambito: {
    macchinaId: string | null;
    essiccatoreId: string | null;
    excludeId?: string;
  }
): Promise<{ success: true; cmd: number } | { success: false; error: string }> {
  let q = supabase
    .from("action_iot_componenti")
    .select("mex_cmd")
    .is("deleted_at", null)
    .not("mex_cmd", "is", null);
  if (ambito.macchinaId) {
    q = q.eq("macchina_id", ambito.macchinaId);
  } else if (ambito.essiccatoreId) {
    q = q.eq("essiccatore_id", ambito.essiccatoreId);
  }
  if (ambito.excludeId) {
    q = q.neq("id", ambito.excludeId);
  }
  const { data, error } = await q;
  if (error) return failParse(error.message);
  const cmd = prossimoMexCmdLibero(
    (data ?? []).map((r) =>
      r.mex_cmd == null ? null : Number(r.mex_cmd)
    )
  );
  if (cmd == null) {
    return failParse("Nessun Mex CMD libero (1–255) su questa macchina.");
  }
  return { success: true, cmd };
}

export async function listActionIotAlberoAction(): Promise<
  { success: true; albero: ActionIotAlbero } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const supabase = await createClient();
  const [mac, mod, can, link] = await Promise.all([
    supabase
      .from("action_iot_macchine")
      .select(MAC_COLS)
      .is("deleted_at", null)
      .order("nome", { ascending: true }),
    supabase
      .from("action_iot_moduli")
      .select(MOD_COLS)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("action_iot_componenti")
      .select(COMP_COLS)
      .is("deleted_at", null)
      .order("nome", { ascending: true }),
    supabase
      .from("action_iot_sensore_collegamenti")
      .select(LINK_COLS)
      .is("deleted_at", null),
  ]);
  if (mac.error) return failParse(mac.error.message);
  if (mod.error) return failParse(mod.error.message);
  if (can.error) return failParse(can.error.message);
  if (link.error) return failParse(link.error.message);

  const macchine = ((mac.data ?? []) as MacRow[]).map(mapMac);
  const moduli = ((mod.data ?? []) as ModRow[]).map(mapMod);
  const macById = new Map(macchine.map((m) => [m.id, m.nome]));
  const modById = new Map(moduli.map((m) => [m.id, m.nome]));
  const canali = ((can.data ?? []) as CompRow[]).map((r) =>
    mapComp(r, {
      macchinaNome: r.macchina_id ? macById.get(r.macchina_id) ?? "" : "",
      moduloNome: r.modulo_id ? modById.get(r.modulo_id) ?? "" : "",
    })
  );
  const canById = new Map(canali.map((c) => [c.id, c.nome]));
  const collegamenti = ((link.data ?? []) as LinkRow[]).map((r) =>
    mapLink(r, {
      sensoreNome: canById.get(r.sensore_id) ?? "",
      canaleNome: canById.get(r.canale_id) ?? "",
    })
  );
  return {
    success: true,
    albero: buildIotAlbero(macchine, moduli, canali, collegamenti),
  };
}

export async function listActionIotComponentiAction(raw?: {
  essiccatoreId?: string | null;
  soloAzioni?: boolean;
}): Promise<
  { success: true; items: ActionIotComponente[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const supabase = await createClient();
  let q = supabase
    .from("action_iot_componenti")
    .select(COMP_COLS)
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  const ess = raw?.essiccatoreId?.trim();
  if (ess) {
    q = q.or(`essiccatore_id.eq.${ess},essiccatore_id.is.null`);
  }
  const { data, error } = await q;
  if (error) return failParse(error.message);
  const rows = (data ?? []) as CompRow[];
  const modIds = [...new Set(rows.map((r) => r.modulo_id).filter(Boolean))] as string[];
  const macIds = [
    ...new Set(rows.map((r) => r.macchina_id).filter(Boolean)),
  ] as string[];
  const modById = new Map<string, string>();
  const macById = new Map<string, string>();
  if (modIds.length) {
    const { data: mods } = await supabase
      .from("action_iot_moduli")
      .select("id, nome")
      .in("id", modIds);
    for (const m of mods ?? []) {
      modById.set(String(m.id), String(m.nome));
    }
  }
  if (macIds.length) {
    const { data: macs } = await supabase
      .from("action_iot_macchine")
      .select("id, nome")
      .in("id", macIds);
    for (const m of macs ?? []) {
      macById.set(String(m.id), String(m.nome));
    }
  }
  let items = rows.map((r) =>
    mapComp(r, {
      macchinaNome: r.macchina_id ? macById.get(r.macchina_id) ?? "" : "",
      moduloNome: r.modulo_id ? modById.get(r.modulo_id) ?? "" : "",
    })
  );
  if (raw?.soloAzioni !== false) {
    items = items.filter(canaleEAzione);
  }
  return { success: true, items };
}

export async function upsertActionIotMacchinaAction(
  raw: unknown
): Promise<
  { success: true; item: ActionIotMacchina } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = macchinaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return failParse(parsed.error.issues[0]?.message ?? "Dati macchina non validi.");
  }
  const input = parsed.data;
  const payload = {
    codice: input.codice.trim().toUpperCase(),
    nome: input.nome.trim(),
    descrizione: input.descrizione ?? "",
    tipo_macchina: input.tipoMacchina,
    essiccatore_id: input.essiccatoreId ?? null,
    updated_by: auth.userId,
  };
  const supabase = await createClient();
  if (input.id) {
    const { data: prev } = await supabase
      .from("action_iot_macchine")
      .select("versione")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data, error } = await supabase
      .from("action_iot_macchine")
      .update({ ...payload, versione: Number(prev?.versione ?? 1) + 1 })
      .eq("id", input.id)
      .is("deleted_at", null)
      .select(MAC_COLS)
      .single();
    if (error || !data) {
      return failParse(error?.message ?? "Aggiornamento macchina fallito.");
    }
    await writeAuditLog({
      entity_type: "action_iot_macchine",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Macchina IoT «${payload.nome}» V+1`,
    });
    return { success: true, item: mapMac(data as MacRow) };
  }
  const { data, error } = await supabase
    .from("action_iot_macchine")
    .insert({
      ...payload,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
    })
    .select(MAC_COLS)
    .single();
  if (error || !data) {
    return failParse(error?.message ?? "Creazione macchina fallita.");
  }
  await writeAuditLog({
    entity_type: "action_iot_macchine",
    entity_id: String((data as MacRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Creata macchina IoT «${payload.nome}»`,
  });
  return { success: true, item: mapMac(data as MacRow) };
}

export async function softDeleteActionIotMacchinaAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return failParse("Macchina non valida.");
  const supabase = await createClient();
  const [{ data: mods }, { data: cans }] = await Promise.all([
    supabase
      .from("action_iot_moduli")
      .select("id")
      .eq("macchina_id", id.data)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("action_iot_componenti")
      .select("id")
      .eq("macchina_id", id.data)
      .is("deleted_at", null)
      .limit(1),
  ]);
  if (mods?.length || cans?.length) {
    return failParse(
      "Macchina con componenti o canali: archivia prima i figli, niente delete fisico."
    );
  }
  const { error } = await supabase
    .from("action_iot_macchine")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (error) return failParse(error.message);
  await writeAuditLog({
    entity_type: "action_iot_macchine",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Macchina IoT archiviata",
  });
  return { success: true };
}

export async function upsertActionIotModuloAction(
  raw: unknown
): Promise<{ success: true; item: ActionIotModulo } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const parsed = moduloInputSchema.safeParse(raw);
  if (!parsed.success) {
    return failParse(parsed.error.issues[0]?.message ?? "Dati componente non validi.");
  }
  const input = parsed.data;
  const payload = {
    macchina_id: input.macchinaId,
    codice: input.codice.trim().toUpperCase(),
    nome: input.nome.trim(),
    descrizione: input.descrizione ?? "",
    sort_order: input.sortOrder ?? 0,
    updated_by: auth.userId,
  };
  const supabase = await createClient();
  const { data: mac } = await supabase
    .from("action_iot_macchine")
    .select("id")
    .eq("id", input.macchinaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mac) return failParse("Macchina non trovata.");
  if (input.id) {
    const { data: prev } = await supabase
      .from("action_iot_moduli")
      .select("versione")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data, error } = await supabase
      .from("action_iot_moduli")
      .update({ ...payload, versione: Number(prev?.versione ?? 1) + 1 })
      .eq("id", input.id)
      .is("deleted_at", null)
      .select(MOD_COLS)
      .single();
    if (error || !data) {
      return failParse(error?.message ?? "Aggiornamento componente fallito.");
    }
    await writeAuditLog({
      entity_type: "action_iot_moduli",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Componente IoT «${payload.nome}» V+1`,
    });
    return { success: true, item: mapMod(data as ModRow) };
  }
  const { data, error } = await supabase
    .from("action_iot_moduli")
    .insert({
      ...payload,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
    })
    .select(MOD_COLS)
    .single();
  if (error || !data) {
    return failParse(error?.message ?? "Creazione componente fallita.");
  }
  await writeAuditLog({
    entity_type: "action_iot_moduli",
    entity_id: String((data as ModRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Creato componente IoT «${payload.nome}»`,
  });
  return { success: true, item: mapMod(data as ModRow) };
}

export async function softDeleteActionIotModuloAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return failParse("Componente non valido.");
  const supabase = await createClient();
  const { data: used } = await supabase
    .from("action_iot_componenti")
    .select("id")
    .eq("modulo_id", id.data)
    .is("deleted_at", null)
    .limit(1);
  if (used?.length) {
    return failParse(
      "Componente con attuatori, regolatori o sensori: archivia prima i figli."
    );
  }
  const { error } = await supabase
    .from("action_iot_moduli")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (error) return failParse(error.message);
  await writeAuditLog({
    entity_type: "action_iot_moduli",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Componente IoT archiviato",
  });
  return { success: true };
}

export async function upsertActionIotComponenteAction(
  raw: unknown
): Promise<
  { success: true; item: ActionIotComponente } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = componenteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return failParse(parsed.error.issues[0]?.message ?? "Dati canale non validi.");
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: mac } = await supabase
    .from("action_iot_macchine")
    .select("id, essiccatore_id, nome")
    .eq("id", input.macchinaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mac) return failParse("Macchina non trovata.");
  let moduloNome = "";
  if (input.moduloId) {
    const { data: mo } = await supabase
      .from("action_iot_moduli")
      .select("id, nome, macchina_id")
      .eq("id", input.moduloId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!mo || String(mo.macchina_id) !== input.macchinaId) {
      return failParse("Componente non appartenente alla macchina.");
    }
    moduloNome = String(mo.nome);
  }
  const tipo = input.ruolo === "sensore" ? null : input.tipoAttuatore ?? null;
  const range = tipo ? defaultRangeForTipo(tipo) : { min: 0, max: 0, def: 0, unita: "" };
  let mexCmd = input.mexCmd ?? null;
  let mexAuto = false;
  if (mexCmd == null) {
    const alloc = await allocaMexCmdAutomatico(supabase, {
      macchinaId: input.macchinaId,
      essiccatoreId: input.essiccatoreId ?? mac.essiccatore_id ?? null,
      excludeId: input.id,
    });
    if (!alloc.success) return alloc;
    mexCmd = alloc.cmd;
    mexAuto = true;
  }
  const payload = {
    codice: input.codice.trim().toUpperCase(),
    nome: input.nome.trim(),
    descrizione: input.descrizione ?? "",
    ruolo: input.ruolo,
    tipo_attuatore: tipo,
    macchina_id: input.macchinaId,
    modulo_id: input.moduloId ?? null,
    essiccatore_id: input.essiccatoreId ?? mac.essiccatore_id ?? null,
    area_slug: input.areaSlug || "essiccatori",
    richiede_consenso:
      input.richiedeConsenso || tipo === "inverter_consenso",
    valore_min: input.valoreMin ?? range.min,
    valore_max: input.valoreMax ?? range.max,
    valore_default: input.valoreDefault ?? range.def,
    unita: input.unita || range.unita,
    precondizione: input.precondizione,
    mex_cmd: mexCmd,
    durata_impulso_default_sec:
      input.ruolo === "sensore" ? null : input.durataImpulsoDefaultSec ?? null,
    updated_by: auth.userId,
  };
  const names = {
    macchinaNome: String(mac.nome),
    moduloNome,
  };
  if (input.id) {
    const { data: prev } = await supabase
      .from("action_iot_componenti")
      .select("versione")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data, error } = await supabase
      .from("action_iot_componenti")
      .update({
        ...payload,
        versione: Number(prev?.versione ?? 1) + 1,
      })
      .eq("id", input.id)
      .is("deleted_at", null)
      .select(COMP_COLS)
      .single();
    if (error || !data) {
      return failParse(error?.message ?? "Aggiornamento fallito.");
    }
    await writeAuditLog({
      entity_type: "action_iot_componenti",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: mexAuto
        ? `Canale IoT «${payload.nome}» V+1 · Mex CMD ${mexCmd} assegnato in automatico`
        : `Canale IoT «${payload.nome}» V+1`,
    });
    return { success: true, item: mapComp(data as CompRow, names) };
  }
  const { data, error } = await supabase
    .from("action_iot_componenti")
    .insert({
      ...payload,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
    })
    .select(COMP_COLS)
    .single();
  if (error || !data) {
    return failParse(error?.message ?? "Creazione fallita.");
  }
  await writeAuditLog({
    entity_type: "action_iot_componenti",
    entity_id: String((data as CompRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: mexAuto
      ? `Creato canale IoT «${payload.nome}» · Mex CMD ${mexCmd} assegnato in automatico`
      : `Creato canale IoT «${payload.nome}»`,
  });
  return { success: true, item: mapComp(data as CompRow, names) };
}

export async function softDeleteActionIotComponenteAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return failParse("Canale non valido.");
  const supabase = await createClient();
  const { data: usedSeq } = await supabase
    .from("action_sequenza_passi")
    .select("id")
    .eq("componente_id", id.data)
    .is("deleted_at", null)
    .limit(1);
  if (usedSeq?.length) {
    return failParse(
      "Canale usato in una sequenza: non si elimina, si chiude la scheda."
    );
  }
  const { data: usedLink } = await supabase
    .from("action_iot_sensore_collegamenti")
    .select("id")
    .or(`sensore_id.eq.${id.data},canale_id.eq.${id.data}`)
    .is("deleted_at", null)
    .limit(1);
  if (usedLink?.length) {
    return failParse(
      "Canale collegato a un sensore: archivia prima il collegamento."
    );
  }
  const { error } = await supabase
    .from("action_iot_componenti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (error) return failParse(error.message);
  await writeAuditLog({
    entity_type: "action_iot_componenti",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Canale IoT archiviato",
  });
  return { success: true };
}

export async function upsertActionIotCollegamentoAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionIotSensoreCollegamento }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = collegamentoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return failParse(parsed.error.issues[0]?.message ?? "Collegamento non valido.");
  }
  const input = parsed.data;
  if (input.sensoreId === input.canaleId) {
    return failParse("Il sensore e l'azione devono essere distinti.");
  }
  const supabase = await createClient();
  const { data: pair } = await supabase
    .from("action_iot_componenti")
    .select("id, nome, ruolo, macchina_id, documento_stato")
    .in("id", [input.sensoreId, input.canaleId])
    .is("deleted_at", null);
  const sensore = (pair ?? []).find((r) => r.id === input.sensoreId);
  const canale = (pair ?? []).find((r) => r.id === input.canaleId);
  if (!sensore || String(sensore.ruolo) !== "sensore") {
    return failParse("Il primo elemento deve essere un sensore.");
  }
  if (!canale || !canaleEAzione({ ruolo: canale.ruolo as IotCanaleRuolo })) {
    return failParse("Il secondo elemento deve essere un attuatore o regolatore.");
  }
  if (String(sensore.documento_stato) === "chiuso" || String(canale.documento_stato) === "chiuso") {
    return failParse("Scheda chiusa: non si collega.");
  }
  if (
    sensore.macchina_id &&
    canale.macchina_id &&
    String(sensore.macchina_id) !== String(canale.macchina_id)
  ) {
    return failParse("Sensore e azione devono appartenere alla stessa macchina.");
  }
  const payload = {
    sensore_id: input.sensoreId,
    canale_id: input.canaleId,
    ruolo_link: input.ruoloLink,
    note: input.note ?? "",
    updated_by: auth.userId,
  };
  const names = {
    sensoreNome: String(sensore.nome),
    canaleNome: String(canale.nome),
  };
  if (input.id) {
    const { data: prev } = await supabase
      .from("action_iot_sensore_collegamenti")
      .select("versione")
      .eq("id", input.id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data, error } = await supabase
      .from("action_iot_sensore_collegamenti")
      .update({ ...payload, versione: Number(prev?.versione ?? 1) + 1 })
      .eq("id", input.id)
      .is("deleted_at", null)
      .select(LINK_COLS)
      .single();
    if (error || !data) {
      return failParse(error?.message ?? "Aggiornamento collegamento fallito.");
    }
    await writeAuditLog({
      entity_type: "action_iot_sensore_collegamenti",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Collegamento sensore «${names.sensoreNome}» V+1`,
    });
    return { success: true, item: mapLink(data as LinkRow, names) };
  }
  const { data, error } = await supabase
    .from("action_iot_sensore_collegamenti")
    .insert({
      ...payload,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
    })
    .select(LINK_COLS)
    .single();
  if (error || !data) {
    return failParse(error?.message ?? "Creazione collegamento fallita.");
  }
  await writeAuditLog({
    entity_type: "action_iot_sensore_collegamenti",
    entity_id: String((data as LinkRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Collegato sensore «${names.sensoreNome}» a «${names.canaleNome}»`,
  });
  return { success: true, item: mapLink(data as LinkRow, names) };
}

export async function softDeleteActionIotCollegamentoAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return failParse("Collegamento non valido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_iot_sensore_collegamenti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (error) return failParse(error.message);
  await writeAuditLog({
    entity_type: "action_iot_sensore_collegamenti",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Collegamento sensore archiviato",
  });
  return { success: true };
}
