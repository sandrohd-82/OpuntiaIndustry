"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  componenteInputSchema,
  defaultRangeForTipo,
  type ActionIotComponente,
  type IotAttuatoreTipo,
  type IotPrecondizione,
} from "@/lib/action/iot-componenti";
import type { DocumentoStatoCatalogo } from "@/lib/action/azioni-catalogo";
import { z } from "zod";

type CompRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  tipo_attuatore: string;
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

function mapComp(r: CompRow): ActionIotComponente {
  return {
    id: r.id,
    codice: r.codice,
    nome: r.nome,
    descrizione: r.descrizione ?? "",
    tipoAttuatore: r.tipo_attuatore as IotAttuatoreTipo,
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

const COMP_COLS =
  "id, codice, nome, descrizione, tipo_attuatore, essiccatore_id, area_slug, richiede_consenso, valore_min, valore_max, valore_default, unita, precondizione, mex_cmd, durata_impulso_default_sec, impostazioni, versione, documento_stato, created_at";

export async function listActionIotComponentiAction(raw?: {
  essiccatoreId?: string | null;
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
  if (error) return { success: false, error: error.message };
  return { success: true, items: ((data ?? []) as CompRow[]).map(mapComp) };
}

export async function upsertActionIotComponenteAction(
  raw: unknown
): Promise<
  { success: true; item: ActionIotComponente } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = componenteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati componente non validi.",
    };
  }
  const input = parsed.data;
  const range = defaultRangeForTipo(input.tipoAttuatore);
  const payload = {
    codice: input.codice.trim().toUpperCase(),
    nome: input.nome.trim(),
    descrizione: input.descrizione ?? "",
    tipo_attuatore: input.tipoAttuatore,
    essiccatore_id: input.essiccatoreId ?? null,
    area_slug: input.areaSlug || "essiccatori",
    richiede_consenso:
      input.richiedeConsenso || input.tipoAttuatore === "inverter_consenso",
    valore_min: input.valoreMin ?? range.min,
    valore_max: input.valoreMax ?? range.max,
    valore_default: input.valoreDefault ?? range.def,
    unita: input.unita || range.unita,
    precondizione: input.precondizione,
    mex_cmd: input.mexCmd ?? null,
    durata_impulso_default_sec: input.durataImpulsoDefaultSec ?? null,
    updated_by: auth.userId,
  };
  const supabase = await createClient();
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
      return { success: false, error: error?.message ?? "Aggiornamento fallito." };
    }
    await writeAuditLog({
      entity_type: "action_iot_componenti",
      entity_id: input.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Componente IoT «${payload.nome}» V+1`,
    });
    return { success: true, item: mapComp(data as CompRow) };
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
    return { success: false, error: error?.message ?? "Creazione fallita." };
  }
  await writeAuditLog({
    entity_type: "action_iot_componenti",
    entity_id: String((data as CompRow).id),
    action: "create",
    actor_id: auth.userId,
    summary: `Creato componente IoT «${payload.nome}»`,
  });
  return { success: true, item: mapComp(data as CompRow) };
}

export async function softDeleteActionIotComponenteAction(
  idRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const id = z.string().uuid().safeParse(idRaw);
  if (!id.success) return { success: false, error: "Componente non valido." };
  const supabase = await createClient();
  const { data: used } = await supabase
    .from("action_sequenza_passi")
    .select("id")
    .eq("componente_id", id.data)
    .is("deleted_at", null)
    .limit(1);
  if (used?.length) {
    return {
      success: false,
      error: "Componente usato in una sequenza: non si elimina, si chiude la scheda.",
    };
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
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_iot_componenti",
    entity_id: id.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Componente IoT archiviato",
  });
  return { success: true };
}
