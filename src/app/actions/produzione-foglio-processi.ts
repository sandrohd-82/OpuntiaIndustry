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
import {
  isProcessoEffettoTipo,
  parseEffettoParametri,
  parseEffettoUnita,
  registraEffettoEsecuzioneSchema,
  type FoglioProcessoEffetto,
  type ProcessoEffettoDef,
} from "@/lib/produzione/processo-effetti";
import {
  parseTempoMedioUnita,
  parseTempoOgniUnita,
  type ProcessoPasso,
} from "@/lib/produzione/processi";
import {
  resolveFunzioniDaKeys,
  type AttivitaFunzioneLink,
} from "@/lib/produzione/funzioni-gestionale";
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
        tempo_medio_valore?: number | string | null;
        tempo_medio_unita?: string | null;
        tempo_ogni_valore?: number | string | null;
        tempo_ogni_unita?: string | null;
      }
    | {
        codice: string;
        nome: string;
        area_id: string | null;
        posto_id: string | null;
        tempo_medio_valore?: number | string | null;
        tempo_medio_unita?: string | null;
        tempo_ogni_valore?: number | string | null;
        tempo_ogni_unita?: string | null;
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

async function loadFunzioniByAttivita(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attivitaIds: string[]
): Promise<Map<string, AttivitaFunzioneLink[]>> {
  const map = new Map<string, AttivitaFunzioneLink[]>();
  if (attivitaIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_attivita_funzioni")
    .select(
      "attivita_id, funzione_key, percorso, area_label, etichetta, spiegazione, tipo, avvio, sort_order"
    )
    .in("attivita_id", attivitaIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as Array<{
    attivita_id: string;
    funzione_key: string;
    percorso: string;
    area_label: string;
    etichetta: string;
    spiegazione: string;
    tipo: string;
    avvio: string;
  }>) {
    const live = resolveFunzioniDaKeys([row.funzione_key]);
    const fromCatalog = live.success ? live.items[0] : null;
    const link: AttivitaFunzioneLink = fromCatalog ?? {
      key: row.funzione_key,
      area: row.area_label,
      etichetta: row.etichetta,
      spiegazione: row.spiegazione,
      percorso: row.percorso,
      tipo:
        row.tipo === "azione" || row.tipo === "inline" ? row.tipo : "pagina",
      avvio: row.avvio === "inline_pesata" ? "inline_pesata" : "navigate",
    };
    const list = map.get(row.attivita_id) ?? [];
    list.push(link);
    map.set(row.attivita_id, list);
  }
  return map;
}

async function loadFunzioniByProcesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoIds: string[]
): Promise<Map<string, AttivitaFunzioneLink[]>> {
  const map = new Map<string, AttivitaFunzioneLink[]>();
  if (processoIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_funzioni")
    .select(
      "processo_id, funzione_key, percorso, area_label, etichetta, spiegazione, tipo, avvio, sort_order"
    )
    .in("processo_id", processoIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as Array<{
    processo_id: string;
    funzione_key: string;
    percorso: string;
    area_label: string;
    etichetta: string;
    spiegazione: string;
    tipo: string;
    avvio: string;
  }>) {
    const live = resolveFunzioniDaKeys([row.funzione_key]);
    const fromCatalog = live.success ? live.items[0] : null;
    const link: AttivitaFunzioneLink = fromCatalog ?? {
      key: row.funzione_key,
      area: row.area_label,
      etichetta: row.etichetta,
      spiegazione: row.spiegazione,
      percorso: row.percorso,
      tipo:
        row.tipo === "azione" || row.tipo === "inline" ? row.tipo : "pagina",
      avvio: row.avvio === "inline_pesata" ? "inline_pesata" : "navigate",
    };
    const list = map.get(row.processo_id) ?? [];
    list.push(link);
    map.set(row.processo_id, list);
  }
  return map;
}

function mapEffettoDefRow(row: {
  id: string;
  processo_id: string;
  tipo: string;
  parametri: unknown;
  note: string | null;
  sort_order: number;
}): ProcessoEffettoDef | null {
  if (!isProcessoEffettoTipo(row.tipo)) return null;
  const parsed = parseEffettoParametri(row.tipo, row.parametri);
  return {
    id: row.id,
    processoId: row.processo_id,
    tipo: row.tipo,
    codiceMp: parsed.codiceMp,
    unita: parsed.unita,
    essiccatoreId: parsed.essiccatoreId,
    note: row.note ?? "",
    sortOrder: row.sort_order,
  };
}

async function loadEffettiByProcesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoIds: string[]
): Promise<Map<string, ProcessoEffettoDef[]>> {
  const map = new Map<string, ProcessoEffettoDef[]>();
  if (processoIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_processo_effetti")
    .select("id, processo_id, tipo, parametri, note, sort_order")
    .in("processo_id", processoIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as Array<{
    id: string;
    processo_id: string;
    tipo: string;
    parametri: unknown;
    note: string | null;
    sort_order: number;
  }>) {
    const mapped = mapEffettoDefRow(row);
    if (!mapped) continue;
    const list = map.get(row.processo_id) ?? [];
    list.push(mapped);
    map.set(row.processo_id, list);
  }
  return map;
}

type EffettoEsecRow = {
  id: string;
  definizione_id: string | null;
  esecuzione_id: string;
  tipo: string;
  parametri: unknown;
  qty_prevista: number | string;
  qty_effettiva: number | string | null;
  unita: string;
  codice_mp: string;
  lotto_codice: string;
  essiccatore_id: string | null;
  esito: string;
  note: string | null;
  eseguito_at: string | null;
};

function mapEffettoEsecuzione(row: EffettoEsecRow): FoglioProcessoEffetto | null {
  if (!isProcessoEffettoTipo(row.tipo)) return null;
  const parsed = parseEffettoParametri(row.tipo, row.parametri);
  const esito =
    row.esito === "eseguito" ||
    row.esito === "annullato" ||
    row.esito === "errore"
      ? row.esito
      : "previsto";
  return {
    id: row.id,
    definizioneId: row.definizione_id,
    tipo: row.tipo,
    codiceMp: (row.codice_mp || parsed.codiceMp).trim(),
    unita: parseEffettoUnita(row.unita || parsed.unita),
    essiccatoreId: (row.essiccatore_id || parsed.essiccatoreId).trim(),
    qtyPrevista: Number(row.qty_prevista) || 0,
    qtyEffettiva:
      row.qty_effettiva == null ? null : Number(row.qty_effettiva) || null,
    lottoCodice: row.lotto_codice ?? "",
    esito,
    note: row.note ?? "",
    eseguitoAt: row.eseguito_at,
  };
}

async function loadEffettiByEsecuzione(
  supabase: Awaited<ReturnType<typeof createClient>>,
  esecuzioneIds: string[]
): Promise<Map<string, FoglioProcessoEffetto[]>> {
  const map = new Map<string, FoglioProcessoEffetto[]>();
  if (esecuzioneIds.length === 0) return map;
  const { data } = await supabase
    .from("produzione_foglio_processo_effetti")
    .select(
      "id, definizione_id, esecuzione_id, tipo, parametri, qty_prevista, qty_effettiva, unita, codice_mp, lotto_codice, essiccatore_id, esito, note, eseguito_at"
    )
    .in("esecuzione_id", esecuzioneIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  for (const row of (data ?? []) as EffettoEsecRow[]) {
    const mapped = mapEffettoEsecuzione(row);
    if (!mapped) continue;
    const list = map.get(row.esecuzione_id) ?? [];
    list.push(mapped);
    map.set(row.esecuzione_id, list);
  }
  return map;
}

async function clonaEffettiSuEsecuzione(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    esecuzioneId: string;
    foglioId: string;
    processoId: string;
    kgObiettivo: number;
    userId: string;
  }
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from("produzione_processo_effetti")
    .select("id, tipo, parametri, note, sort_order")
    .eq("processo_id", input.processoId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  const defs = (data ?? []) as Array<{
    id: string;
    tipo: string;
    parametri: unknown;
    note: string | null;
    sort_order: number;
  }>;
  if (defs.length === 0) return { success: true };
  const rows = defs
    .map((d) => {
      if (!isProcessoEffettoTipo(d.tipo)) return null;
      const parsed = parseEffettoParametri(d.tipo, d.parametri);
      return {
        definizione_id: d.id,
        esecuzione_id: input.esecuzioneId,
        foglio_id: input.foglioId,
        processo_id: input.processoId,
        tipo: d.tipo,
        parametri: d.parametri ?? {},
        qty_prevista: input.kgObiettivo,
        unita: parsed.unita,
        codice_mp: parsed.codiceMp,
        essiccatore_id: parsed.essiccatoreId || null,
        esito: "previsto",
        note: d.note ?? "",
        documento_stato: "bozza",
        created_by: input.userId,
        updated_by: input.userId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (rows.length === 0) return { success: true };
  const { error: insErr } = await supabase
    .from("produzione_foglio_processo_effetti")
    .insert(rows);
  if (insErr) return { success: false, error: insErr.message };
  return { success: true };
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
      "id, processo_id, attivita_id, sort_order, obbligatorio, note, produzione_processo_attivita(codice, nome, area_id, posto_id, tempo_medio_valore, tempo_medio_unita, tempo_ogni_valore, tempo_ogni_unita)"
    )
    .in("processo_id", processoIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as unknown as PassoQueryRow[];
  const attivitaIds = [...new Set(rows.map((r) => r.attivita_id))];
  const [scripts, funzioni] = await Promise.all([
    loadScriptsByAttivita(supabase, attivitaIds),
    loadFunzioniByAttivita(supabase, attivitaIds),
  ]);
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
      tempoMedioValore: Number(att?.tempo_medio_valore) || 0,
      tempoMedioUnita: parseTempoMedioUnita(att?.tempo_medio_unita),
      tempoOgniValore: Number(att?.tempo_ogni_valore) || 1,
      tempoOgniUnita: parseTempoOgniUnita(att?.tempo_ogni_unita),
      scripts: scripts.get(row.attivita_id) ?? [],
      funzioni: funzioni.get(row.attivita_id) ?? [],
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

  const processoIds = procRows.map((p) => p.id);
  const [passiByProcesso, funzioniByProcesso, effettiByProcesso] =
    await Promise.all([
      loadPassiByProcesso(supabase, processoIds, areaNome, postoNome),
      loadFunzioniByProcesso(supabase, processoIds),
      loadEffettiByProcesso(supabase, processoIds),
    ]);

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

  const effettiByEsec = await loadEffettiByEsecuzione(supabase, esecIds);

  const items: FoglioProcessoDisponibile[] = procRows.map((p) => {
    const passi = passiByProcesso.get(p.id) ?? [];
    const funzioni = funzioniByProcesso.get(p.id) ?? [];
    const effetti = effettiByProcesso.get(p.id) ?? [];
    const hasPesata =
      passi.some(
        (step) =>
          step.scripts.some((s) => s.funzione === "pesata") ||
          step.funzioni.some((f) => f.avvio === "inline_pesata")
      ) || funzioni.some((f) => f.avvio === "inline_pesata");
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
      funzioni,
      effetti,
      effettiEsecuzione: esec ? (effettiByEsec.get(esec.id) ?? []) : [],
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

  const cloned = await clonaEffettiSuEsecuzione(supabase, {
    esecuzioneId: (inserted as { id: string }).id,
    foglioId: parsed.data.foglioId,
    processoId: parsed.data.processoId,
    kgObiettivo: parsed.data.kgObiettivo,
    userId: auth.userId,
  });
  if (!cloned.success) {
    await supabase
      .from("produzione_foglio_processi")
      .update({
        stato: "annullato",
        deleted_at: new Date().toISOString(),
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", (inserted as { id: string }).id);
    return cloned;
  }

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

export async function registraEffettoEsecuzioneAction(
  raw: unknown
): Promise<
  | { success: true; items: FoglioProcessoDisponibile[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = registraEffettoEsecuzioneSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Effetto non valido.",
    };
  }
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("produzione_foglio_processo_effetti")
    .select(
      "id, esecuzione_id, foglio_id, processo_id, tipo, parametri, codice_mp, essiccatore_id, esito, deleted_at"
    )
    .eq("id", parsed.data.effettoEsecuzioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: false, error: "Effetto non trovato." };
  const effetto = row as {
    id: string;
    esecuzione_id: string;
    foglio_id: string;
    processo_id: string;
    tipo: string;
    parametri: unknown;
    codice_mp: string;
    essiccatore_id: string | null;
    esito: string;
  };
  if (!isProcessoEffettoTipo(effetto.tipo)) {
    return { success: false, error: "Tipo effetto non valido." };
  }
  if (effetto.esito === "eseguito") {
    return { success: false, error: "Questo effetto è già stato registrato." };
  }
  const { data: esec } = await supabase
    .from("produzione_foglio_processi")
    .select("id, stato")
    .eq("id", effetto.esecuzione_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!esec || (esec as { stato: string }).stato !== "in_corso") {
    return { success: false, error: "L'esecuzione non è in corso." };
  }
  const foglioOk = await assertFoglioAperto(supabase, effetto.foglio_id);
  if (!foglioOk.success) return foglioOk;

  const fromDef = parseEffettoParametri(effetto.tipo, effetto.parametri);
  const codiceMp = (
    parsed.data.codiceMp ||
    effetto.codice_mp ||
    fromDef.codiceMp
  )
    .trim()
    .toUpperCase();
  const essiccatoreId = (
    parsed.data.essiccatoreId ||
    effetto.essiccatore_id ||
    fromDef.essiccatoreId
  ).trim();

  if (
    (effetto.tipo === "magazzino.consuma" ||
      effetto.tipo === "magazzino.produce") &&
    !codiceMp
  ) {
    return {
      success: false,
      error: "Indica la targa prodotto (es. NDRi) da muovere.",
    };
  }
  if (effetto.tipo === "essiccatore.carica_cestone" && !essiccatoreId) {
    return {
      success: false,
      error: "Seleziona l’essiccatore da caricare.",
    };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("produzione_foglio_processo_effetti")
    .update({
      qty_effettiva: parsed.data.qty,
      codice_mp: codiceMp,
      lotto_codice: parsed.data.lottoCodice.trim(),
      essiccatore_id: essiccatoreId || null,
      esito: "eseguito",
      documento_stato: "approvato",
      note: parsed.data.note.trim(),
      eseguito_at: now,
      eseguito_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", effetto.id)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  void writeAuditLog({
    entity_type: "produzione_foglio_processo_effetti",
    entity_id: effetto.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Registrato effetto ${effetto.tipo} ${parsed.data.qty} sul foglio`,
    payload: {
      foglio_id: effetto.foglio_id,
      processo_id: effetto.processo_id,
      tipo: effetto.tipo,
      qty: parsed.data.qty,
      codice_mp: codiceMp,
      essiccatore_id: essiccatoreId,
      lotto_codice: parsed.data.lottoCodice,
    },
  });

  return listProcessiPerFoglioAction(effetto.foglio_id);
}
