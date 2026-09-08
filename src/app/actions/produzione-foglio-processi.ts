"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  getFoglioConteggioAction,
  upsertFoglioConteggioAction,
} from "@/app/actions/produzione-aree";
import {
  avviaEsecuzioneProcessoSchema,
  registraPesataSchema,
  type FoglioPesata,
  type FoglioProcessoDisponibile,
  type FoglioProcessoEsecuzione,
  type FoglioEsecuzioneStato,
} from "@/lib/produzione/foglio-processi";
import type { ProcessoPasso } from "@/lib/produzione/processi";
import { isScriptFunzione, type AttivitaScriptLink } from "@/lib/script/catalogo";
import { createClient } from "@/lib/supabase/server";

type ProcessoListRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  area_id: string | null;
};

type EsecuzioneRow = {
  id: string;
  foglio_id: string;
  processo_id: string;
  stato: FoglioEsecuzioneStato;
  kg_obiettivo: number;
  started_at: string;
  completed_at: string | null;
};

type PesataRow = {
  id: string;
  esecuzione_id: string;
  kg: number;
  created_at: string;
};

type PassoQueryRow = {
  id: string;
  processo_id: string;
  attivita_id: string;
  sort_order: number;
  obbligatorio: boolean;
  note: string | null;
  produzione_processo_attivita:
    | {
        codice: string;
        nome: string;
        area_id: string | null;
        posto_id: string | null;
      }
    | {
        codice: string;
        nome: string;
        area_id: string | null;
        posto_id: string | null;
      }[]
    | null;
};

async function assertFoglioAperto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id, stato")
    .eq("id", foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error: "Foglio non trovato su database. Salva prima il foglio.",
    };
  }
  if ((data as { stato: string }).stato === "chiuso") {
    return { success: false, error: "Il foglio è chiuso." };
  }
  return { success: true };
}

async function loadScriptsByAttivita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attivitaIds: string[]
): Promise<Map<string, AttivitaScriptLink[]>> {
  const map = new Map<string, AttivitaScriptLink[]>();
  if (attivitaIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_attivita_script")
    .select("attivita_id, sort_order, script_id")
    .in("attivita_id", attivitaIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const links = (data ?? []) as Array<{
    attivita_id: string;
    script_id: string;
  }>;
  const scriptIds = [...new Set(links.map((l) => l.script_id))];
  if (scriptIds.length === 0) return map;
  const { data: scripts } = await supabase
    .from("gestionale_script")
    .select("id, codice, nome, funzione")
    .in("id", scriptIds)
    .is("deleted_at", null);
  const byId = new Map(
    ((scripts ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      funzione: string;
    }>)
      .filter((s) => isScriptFunzione(s.funzione))
      .map((s) => [
        s.id,
        {
          id: s.id,
          codice: s.codice,
          nome: s.nome,
          funzione: s.funzione,
        } as AttivitaScriptLink,
      ])
  );
  for (const link of links) {
    const script = byId.get(link.script_id);
    if (!script) continue;
    const list = map.get(link.attivita_id) ?? [];
    list.push(script);
    map.set(link.attivita_id, list);
  }
  return map;
}

async function loadPassiByProcesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoIds: string[],
  areaNome: Map<string, string>,
  postoNome: Map<string, string>
): Promise<Map<string, ProcessoPasso[]>> {
  const map = new Map<string, ProcessoPasso[]>();
  if (processoIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_passi")
    .select(
      "id, processo_id, attivita_id, sort_order, obbligatorio, note, produzione_processo_attivita(codice, nome, area_id, posto_id)"
    )
    .in("processo_id", processoIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as unknown as PassoQueryRow[];
  const attivitaIds = [...new Set(rows.map((r) => r.attivita_id))];
  const scripts = await loadScriptsByAttivita(supabase, attivitaIds);
  for (const row of rows) {
    const raw = row.produzione_processo_attivita;
    const att = Array.isArray(raw) ? raw[0] : raw;
    const areaId = att?.area_id ?? null;
    const postoId = att?.posto_id ?? null;
    const passo: ProcessoPasso = {
      id: row.id,
      processoId: row.processo_id,
      attivitaId: row.attivita_id,
      sortOrder: row.sort_order,
      obbligatorio: Boolean(row.obbligatorio),
      note: row.note ?? "",
      attivitaCodice: att?.codice ?? "",
      attivitaNome: att?.nome ?? "",
      attivitaAreaId: areaId,
      attivitaPostoId: postoId,
      attivitaAreaNome: areaId ? (areaNome.get(areaId) ?? "") : "",
      attivitaPostoNome: postoId ? (postoNome.get(postoId) ?? "") : "",
      scripts: scripts.get(row.attivita_id) ?? [],
    };
    const list = map.get(row.processo_id) ?? [];
    list.push(passo);
    map.set(row.processo_id, list);
  }
  return map;
}

function mapEsecuzione(
  row: EsecuzioneRow,
  kgCaricati: number
): FoglioProcessoEsecuzione {
  return {
    id: row.id,
    stato: row.stato,
    kgObiettivo: Number(row.kg_obiettivo) || 0,
    kgCaricati,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function syncKgVersatiDaPesate(
  foglioId: string,
  areaId: string | null,
  kgCaricati: number
): Promise<void> {
  if (!areaId) return;
  const supabase = await createClient();
  const { data: area } = await supabase
    .from("produzione_aree")
    .select("id, richiede_bilancio_massa")
    .eq("id", areaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!area || !(area as { richiede_bilancio_massa: boolean }).richiede_bilancio_massa) {
    return;
  }
  const existing = await getFoglioConteggioAction(foglioId, areaId);
  if (!existing.success) return;
  await upsertFoglioConteggioAction({
    foglioId,
    areaId,
    kgVersati: kgCaricati,
    kgEssiccatori: existing.item?.kgEssiccatori ?? 0,
    kgNonConformi: existing.item?.kgNonConformi ?? 0,
    noteNc: existing.item?.noteNc ?? "",
    esitoNc: existing.item?.esitoNc ?? "",
  });
}

export async function listProcessiPerFoglioAction(
  foglioId: string
): Promise<
  | { success: true; items: FoglioProcessoDisponibile[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();

  const { data: processi, error: procErr } = await supabase
    .from("produzione_processi")
    .select("id, codice, nome, descrizione, area_id")
    .is("deleted_at", null)
    .is("deprecato_at", null)
    .order("codice", { ascending: true });
  if (procErr) return { success: false, error: procErr.message };
  const procRows = (processi ?? []) as ProcessoListRow[];

  const { data: aree } = await supabase
    .from("produzione_aree")
    .select("id, nome")
    .is("deleted_at", null);
  const areaNome = new Map<string, string>();
  for (const a of (aree ?? []) as Array<{ id: string; nome: string }>) {
    areaNome.set(a.id, a.nome);
  }
  const { data: posti } = await supabase
    .from("produzione_posti_lavoro")
    .select("id, nome")
    .is("deleted_at", null);
  const postoNome = new Map<string, string>();
  for (const p of (posti ?? []) as Array<{ id: string; nome: string }>) {
    postoNome.set(p.id, p.nome);
  }

  const passiByProcesso = await loadPassiByProcesso(
    supabase,
    procRows.map((p) => p.id),
    areaNome,
    postoNome
  );

  const { data: esecuzioni } = await supabase
    .from("produzione_foglio_processi")
    .select(
      "id, foglio_id, processo_id, stato, kg_obiettivo, started_at, completed_at"
    )
    .eq("foglio_id", foglioId)
    .is("deleted_at", null);
  const esecRows = (esecuzioni ?? []) as EsecuzioneRow[];
  const esecByProcesso = new Map(esecRows.map((e) => [e.processo_id, e]));
  const esecIds = esecRows.map((e) => e.id);

  const pesateByEsec = new Map<string, FoglioPesata[]>();
  if (esecIds.length > 0) {
    const { data: pesate } = await supabase
      .from("produzione_foglio_pesate")
      .select("id, esecuzione_id, kg, created_at")
      .in("esecuzione_id", esecIds)
      .order("created_at", { ascending: true });
    for (const row of (pesate ?? []) as PesataRow[]) {
      const list = pesateByEsec.get(row.esecuzione_id) ?? [];
      list.push({
        id: row.id,
        kg: Number(row.kg) || 0,
        createdAt: row.created_at,
      });
      pesateByEsec.set(row.esecuzione_id, list);
    }
  }

  const items: FoglioProcessoDisponibile[] = procRows.map((p) => {
    const passi = passiByProcesso.get(p.id) ?? [];
    const hasPesata = passi.some((step) =>
      step.scripts.some((s) => s.funzione === "pesata")
    );
    const esec = esecByProcesso.get(p.id) ?? null;
    const pesate = esec ? (pesateByEsec.get(esec.id) ?? []) : [];
    const kgCaricati = pesate.reduce((sum, x) => sum + x.kg, 0);
    return {
      processoId: p.id,
      codice: p.codice,
      nome: p.nome,
      descrizione: p.descrizione ?? "",
      areaId: p.area_id,
      areaNome: p.area_id ? (areaNome.get(p.area_id) ?? "") : "",
      passi,
      hasPesata,
      esecuzione: esec ? mapEsecuzione(esec, kgCaricati) : null,
      pesate,
    };
  });

  return { success: true, items };
}

export async function avviaEsecuzioneProcessoAction(raw: {
  foglioId: string;
  processoId: string;
  kgObiettivo: number;
}): Promise<
  | { success: true; items: FoglioProcessoDisponibile[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = avviaEsecuzioneProcessoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const foglioOk = await assertFoglioAperto(supabase, parsed.data.foglioId);
  if (!foglioOk.success) return foglioOk;

  const { data: processo, error: procErr } = await supabase
    .from("produzione_processi")
    .select("id, codice, deprecato_at")
    .eq("id", parsed.data.processoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (procErr) return { success: false, error: procErr.message };
  if (!processo) return { success: false, error: "Processo non trovato." };
  const p = processo as {
    codice: string;
    deprecato_at: string | null;
  };
  if (p.deprecato_at) {
    return {
      success: false,
      error: "Questo processo è deprecato: è nello storico e non si avvia sul foglio.",
    };
  }

  const { data: existing } = await supabase
    .from("produzione_foglio_processi")
    .select("id, stato")
    .eq("foglio_id", parsed.data.foglioId)
    .eq("processo_id", parsed.data.processoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    return {
      success: false,
      error: "Questo processo è già stato avviato sul foglio.",
    };
  }

  const { data: inserted, error } = await supabase
    .from("produzione_foglio_processi")
    .insert({
      foglio_id: parsed.data.foglioId,
      processo_id: parsed.data.processoId,
      stato: "in_corso",
      kg_obiettivo: parsed.data.kgObiettivo,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  void writeAuditLog({
    entity_type: "produzione_foglio_processi",
    entity_id: (inserted as { id: string }).id,
    action: "create",
    actor_id: auth.userId,
    summary: `Avviato processo ${p.codice} sul foglio`,
    payload: {
      foglio_id: parsed.data.foglioId,
      processo_id: parsed.data.processoId,
      kg_obiettivo: parsed.data.kgObiettivo,
    },
  });

  return listProcessiPerFoglioAction(parsed.data.foglioId);
}

export async function registraPesataAction(raw: {
  esecuzioneId: string;
  attivitaId: string;
  kg: number;
}): Promise<
  | { success: true; items: FoglioProcessoDisponibile[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = registraPesataSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Pesata non valida.",
    };
  }
  const supabase = await createClient();

  const { data: esec, error: esecErr } = await supabase
    .from("produzione_foglio_processi")
    .select(
      "id, foglio_id, processo_id, stato, kg_obiettivo, deleted_at"
    )
    .eq("id", parsed.data.esecuzioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (esecErr) return { success: false, error: esecErr.message };
  if (!esec) return { success: false, error: "Esecuzione non trovata." };
  const e = esec as {
    id: string;
    foglio_id: string;
    processo_id: string;
    stato: FoglioEsecuzioneStato;
    kg_obiettivo: number;
  };
  if (e.stato !== "in_corso") {
    return { success: false, error: "L'esecuzione non è in corso." };
  }
  const foglioOk = await assertFoglioAperto(supabase, e.foglio_id);
  if (!foglioOk.success) return foglioOk;

  const { data: passo } = await supabase
    .from("produzione_processo_passi")
    .select("id")
    .eq("processo_id", e.processo_id)
    .eq("attivita_id", parsed.data.attivitaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!passo) {
    return {
      success: false,
      error: "L'attività non appartiene a questo processo.",
    };
  }

  const scripts = await loadScriptsByAttivita(supabase, [parsed.data.attivitaId]);
  const pesataScript = (scripts.get(parsed.data.attivitaId) ?? []).find(
    (s) => s.funzione === "pesata"
  );
  if (!pesataScript) {
    return {
      success: false,
      error: "Questa attività non ha lo script Pesata.",
    };
  }

  const { data: inserted, error } = await supabase
    .from("produzione_foglio_pesate")
    .insert({
      esecuzione_id: e.id,
      foglio_id: e.foglio_id,
      processo_id: e.processo_id,
      attivita_id: parsed.data.attivitaId,
      script_id: pesataScript.id,
      kg: parsed.data.kg,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  const { data: pesate } = await supabase
    .from("produzione_foglio_pesate")
    .select("kg")
    .eq("esecuzione_id", e.id);
  const kgCaricati = ((pesate ?? []) as Array<{ kg: number }>).reduce(
    (sum, row) => sum + (Number(row.kg) || 0),
    0
  );
  const obiettivo = Number(e.kg_obiettivo) || 0;
  const completed = obiettivo > 0 && kgCaricati + 1e-9 >= obiettivo;
  if (completed) {
    await supabase
      .from("produzione_foglio_processi")
      .update({
        stato: "completato",
        completed_at: new Date().toISOString(),
        updated_by: auth.userId,
      })
      .eq("id", e.id)
      .is("deleted_at", null);
  }

  const { data: processo } = await supabase
    .from("produzione_processi")
    .select("area_id, codice")
    .eq("id", e.processo_id)
    .maybeSingle();
  const areaId = (processo as { area_id: string | null } | null)?.area_id ?? null;
  await syncKgVersatiDaPesate(e.foglio_id, areaId, kgCaricati);

  void writeAuditLog({
    entity_type: "produzione_foglio_pesate",
    entity_id: (inserted as { id: string }).id,
    action: "create",
    actor_id: auth.userId,
    summary: `Registrata pesata ${parsed.data.kg} kg sul processo ${
      (processo as { codice?: string } | null)?.codice ?? ""
    }`,
    payload: {
      foglio_id: e.foglio_id,
      processo_id: e.processo_id,
      attivita_id: parsed.data.attivitaId,
      kg: parsed.data.kg,
      kg_caricati: kgCaricati,
      completato: completed,
    },
  });

  return listProcessiPerFoglioAction(e.foglio_id);
}
