"use server";

import {
  findCodiceRiferimenti,
  type CatalogoLifecycleKind,
} from "@/lib/amministrazione/catalogo-lifecycle";
import {
  CERCA_RPC_LIMIT,
  CERCA_RPC_THRESHOLD,
  DROPDOWN_MATCH_THRESHOLD_PCT,
  AUTO_LINK_EXACT_MATCH_PCT,
  CERCA_SEED_CANDIDATES,
  CONTEXT_BONUS_MIN_BASE_PCT,
  SAME_AZIENDA_SCORE_BONUS,
  SAME_INVOICE_SCORE_BONUS,
  hasMeaningfulTokenOverlap,
} from "@/lib/amministrazione/catalogo-collega";
import { writeAuditLog } from "@/lib/audit";
import {
  mapFatturaRicevutaRow,
  type Fattura,
} from "@/lib/amministrazione/fatture";
import { tokenizeInvoiceLine } from "@/lib/sku-generator";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
} from "@/types/database";

export type CollegaCatalogoHit = {
  source: "stessa_fattura" | "stessa_azienda" | "catalogo";
  catalogoKind: CatalogoLifecycleKind;
  catalogoId: string;
  codice: string;
  nome: string;
  score: number;
};

export type RigaCatalogoMatchStatus =
  | "ok"
  | "da_sostituire"
  | "possibile_match"
  | "nessun_match"
  | "codice_orfano";

export type RigaCatalogoMatchHint = {
  key: string;
  status: RigaCatalogoMatchStatus;
  best: CollegaCatalogoHit | null;
  /** Top candidati dallo scan riga: Cerca li mostra subito senza nuova RPC. */
  candidates?: CollegaCatalogoHit[];
};

/** Soglia UI “possibile match” (suggerimento, non auto-link). */
const RIGA_MATCH_SUGGEST_SCORE = 55;

const ALL_KINDS: CatalogoLifecycleKind[] = [
  "servizio",
  "prodotto",
  "materia",
  "contributo",
];

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type RpcMatchRow = {
  catalogo_kind: string;
  catalogo_id: string;
  codice: string;
  nome: string;
  affinita_percentuale: number | string;
};

function cleanQuery(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return tokenizeInvoiceLine(t).join(" ") || t;
}

function isKind(k: string): k is CatalogoLifecycleKind {
  return (
    k === "servizio" ||
    k === "prodotto" ||
    k === "materia" ||
    k === "contributo"
  );
}

/** Lookup mirato per un codice (4 query limit 1) — senza scaricare cataloghi. */
async function findEntryByCodice(
  supabase: SupabaseClient,
  codice: string
): Promise<{
  kind: CatalogoLifecycleKind;
  id: string;
  codice: string;
  nome: string;
} | null> {
  const code = codice.trim();
  if (!code || code === "—") return null;
  const tables: Array<{
    kind: CatalogoLifecycleKind;
    table:
      | "catalogo_servizi"
      | "catalogo_prodotti_fornitore"
      | "materie_prime"
      | "catalogo_contributi";
  }> = [
    { kind: "servizio", table: "catalogo_servizi" },
    { kind: "prodotto", table: "catalogo_prodotti_fornitore" },
    { kind: "materia", table: "materie_prime" },
    { kind: "contributo", table: "catalogo_contributi" },
  ];
  const results = await Promise.all(
    tables.map(async (t) => {
      const { data } = await supabase
        .from(t.table)
        .select("id, codice, nome")
        .eq("codice", code)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const row = data as { id: string; codice: string; nome: string };
      return {
        kind: t.kind,
        id: row.id,
        codice: row.codice,
        nome: row.nome,
      };
    })
  );
  return results.find(Boolean) ?? null;
}

async function loadAziendaCodes(
  supabase: SupabaseClient,
  fornitoreId: string | null
): Promise<Set<string>> {
  const aziendaCodes = new Set<string>();
  if (!fornitoreId) return aziendaCodes;
  const { data: forn } = await supabase
    .from("fornitori")
    .select(
      "servizi_offerti, prodotti_fornitore, prodotti_acquistati, contributi_offerti"
    )
    .eq("id", fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn) return aziendaCodes;
  const row = forn as {
    servizi_offerti?: string[];
    prodotti_fornitore?: string[];
    prodotti_acquistati?: string[];
    contributi_offerti?: string[];
  };
  for (const arr of [
    row.servizi_offerti,
    row.prodotti_fornitore,
    row.prodotti_acquistati,
    row.contributi_offerti,
  ]) {
    for (const c of arr ?? []) {
      if (c?.trim()) aziendaCodes.add(c.trim().toLowerCase());
    }
  }
  return aziendaCodes;
}

async function rpcMatchCatalogo(
  supabase: SupabaseClient,
  query: string,
  limit: number,
  threshold = CERCA_RPC_THRESHOLD
): Promise<{ rows: RpcMatchRow[]; error: string | null }> {
  const q = cleanQuery(query);
  if (!q) return { rows: [], error: null };
  const { data, error } = await supabase.rpc("match_catalogo_acquisti", {
    p_query: q,
    p_threshold: threshold,
    p_limit: Math.min(Math.max(limit, 1), CERCA_RPC_LIMIT),
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as RpcMatchRow[], error: null };
}

function rowsToHits(
  rows: RpcMatchRow[],
  sameSet: Set<string>,
  aziendaCodes: Set<string>,
  kinds?: Set<CatalogoLifecycleKind> | null,
  /** Descrizione/query riga: senza overlap token → scarta (anti falsi 100%). */
  queryText?: string | null
): CollegaCatalogoHit[] {
  const byKey = new Map<string, CollegaCatalogoHit>();
  const q = (queryText ?? "").trim();
  for (const row of rows) {
    if (!isKind(row.catalogo_kind)) continue;
    if (kinds && kinds.size > 0 && !kinds.has(row.catalogo_kind)) continue;
    const codeKey = String(row.codice ?? "")
      .trim()
      .toLowerCase();
    if (!codeKey) continue;

    if (
      q &&
      !hasMeaningfulTokenOverlap(q, String(row.nome ?? ""), row.codice)
    ) {
      continue;
    }

    const baseScore = Number(row.affinita_percentuale) || 0;
    let source: CollegaCatalogoHit["source"] = "catalogo";
    let score = baseScore;

    // Bonus contestuale solo su match già plausibili — mai forzare 95/100%
    if (
      sameSet.has(codeKey) &&
      baseScore >= CONTEXT_BONUS_MIN_BASE_PCT
    ) {
      source = "stessa_fattura";
      score = Math.min(100, baseScore + SAME_INVOICE_SCORE_BONUS);
    } else if (
      aziendaCodes.has(codeKey) &&
      baseScore >= CONTEXT_BONUS_MIN_BASE_PCT
    ) {
      source = "stessa_azienda";
      score = Math.min(100, baseScore + SAME_AZIENDA_SCORE_BONUS);
    } else if (sameSet.has(codeKey)) {
      source = "stessa_fattura";
    } else if (aziendaCodes.has(codeKey)) {
      source = "stessa_azienda";
    }

    const hit: CollegaCatalogoHit = {
      source,
      catalogoKind: row.catalogo_kind,
      catalogoId: row.catalogo_id,
      codice: row.codice,
      nome: row.nome,
      score: Math.min(100, Math.round(score)),
    };
    const prev = byKey.get(codeKey);
    if (!prev || hit.score > prev.score) byKey.set(codeKey, hit);
  }
  return [...byKey.values()].sort((a, b) => {
    const order = { stessa_fattura: 0, stessa_azienda: 1, catalogo: 2 };
    if (b.score !== a.score) return b.score - a.score;
    const d = order[a.source] - order[b.source];
    if (d !== 0) return d;
    return a.codice.localeCompare(b.codice, "it");
  });
}

/**
 * Cerca codice: una sola RPC pg_trgm (query già scremata lato client).
 * Azienda + match in parallelo per restare sotto ~1s.
 */
export async function searchCollegaCatalogoAction(input: {
  /** Preferire testo già tokenizzato (senza stopword). */
  query: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  kinds?: CatalogoLifecycleKind[] | null;
  /** @deprecated ignorato — sempre match RPC. */
  preferKind?: CatalogoLifecycleKind | null;
  minScore?: number;
  limit?: number;
  /** @deprecated ignorato — non carica più tutto il catalogo. */
  includeAll?: boolean;
}): Promise<
  | { success: true; hits: CollegaCatalogoHit[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const q = (input.query ?? "").trim();
  if (!q) return { success: true, hits: [] };

  const supabase = await createClient();
  const sameSet = new Set(
    input.sameInvoiceCodici.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const kinds =
    input.kinds && input.kinds.length > 0
      ? new Set(input.kinds)
      : new Set(ALL_KINDS);

  const limit = Math.min(
    Math.max(input.limit ?? CERCA_RPC_LIMIT, 1),
    CERCA_RPC_LIMIT
  );

  const [aziendaCodes, matched] = await Promise.all([
    loadAziendaCodes(supabase, input.fornitoreId).catch(
      () => new Set<string>()
    ),
    rpcMatchCatalogo(supabase, q, limit, CERCA_RPC_THRESHOLD),
  ]);
  if (matched.error) return { success: false, error: matched.error };

  let hits = rowsToHits(matched.rows, sameSet, aziendaCodes, kinds, null);
  const minScore = input.minScore ?? 0;
  if (minScore > 0) {
    hits = hits.filter((h) => h.score >= minScore);
  }
  return { success: true, hits };
}

/**
 * Dropdown riga: solo RPC (nessun fallback che scarica migliaia di record).
 */
export async function suggestCodiciRigaDropdownAction(input: {
  descrizione: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  codiceCorrente?: string | null;
}): Promise<
  | { success: true; hits: CollegaCatalogoHit[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const descrizione = (input.descrizione ?? "").trim();
  const codiceCorrente = (input.codiceCorrente ?? "").trim();
  if (!descrizione && !codiceCorrente) {
    return { success: true, hits: [] };
  }

  const supabase = await createClient();
  const sameSet = new Set(
    input.sameInvoiceCodici.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const byKey = new Map<string, CollegaCatalogoHit>();

  const merge = (hit: CollegaCatalogoHit) => {
    const key = hit.codice.trim().toLowerCase();
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev || hit.score > prev.score) byKey.set(key, hit);
  };

  const [aziendaCodes, matched] = await Promise.all([
    loadAziendaCodes(supabase, input.fornitoreId).catch(
      () => new Set<string>()
    ),
    descrizione
      ? rpcMatchCatalogo(
          supabase,
          descrizione,
          24,
          Math.max(0.35, DROPDOWN_MATCH_THRESHOLD_PCT / 100 - 0.15)
        )
      : Promise.resolve({ rows: [] as RpcMatchRow[], error: null as string | null }),
  ]);

  if (matched.error) return { success: false, error: matched.error };
  if (descrizione) {
    for (const h of rowsToHits(
      matched.rows,
      sameSet,
      aziendaCodes,
      null,
      descrizione
    )) {
      if (h.score < DROPDOWN_MATCH_THRESHOLD_PCT && h.source === "catalogo") {
        continue;
      }
      merge(h);
    }
  }

  if (codiceCorrente && codiceCorrente !== "—") {
    const key = codiceCorrente.toLowerCase();
    if (!byKey.has(key)) {
      const found = await findEntryByCodice(supabase, codiceCorrente);
      if (found) {
        merge({
          source: sameSet.has(key)
            ? "stessa_fattura"
            : aziendaCodes.has(key)
              ? "stessa_azienda"
              : "catalogo",
          catalogoKind: found.kind,
          catalogoId: found.id,
          codice: found.codice,
          nome: found.nome,
          score: 100,
        });
      }
    }
  }

  const hits = [...byKey.values()].sort((a, b) => {
    const order = { stessa_fattura: 0, stessa_azienda: 1, catalogo: 2 };
    const d = order[a.source] - order[b.source];
    if (d !== 0) return d;
    return b.score - a.score || a.codice.localeCompare(b.codice, "it");
  });

  return { success: true, hits: hits.slice(0, 12) };
}

/**
 * Scan leggero: RPC per riga (max 8 in parallelo), niente catalogo intero.
 */
export async function scanFatturaRigheCatalogoAction(input: {
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  codicePending: string | null;
  catalogCodiciValidi: string[];
  righe: Array<{ key: string; descrizione: string; codice: string }>;
}): Promise<
  | { success: true; hints: RigaCatalogoMatchHint[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const pending = (input.codicePending ?? "").trim().toLowerCase();
  const validSet = new Set(
    input.catalogCodiciValidi.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const sameSet = new Set(
    input.sameInvoiceCodici.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const aziendaCodes = await loadAziendaCodes(supabase, input.fornitoreId).catch(
    () => new Set<string>()
  );

  const hints: RigaCatalogoMatchHint[] = new Array(input.righe.length);
  const CONCURRENCY = 4;

  async function scanOne(
    riga: { key: string; descrizione: string; codice: string },
    index: number
  ) {
    const codice = (riga.codice ?? "").trim();
    const codeKey = codice.toLowerCase();
    const desc = (riga.descrizione ?? "").trim();

    if (pending && codeKey && codeKey === pending) {
      hints[index] = { key: riga.key, status: "da_sostituire", best: null };
      return;
    }

    const inCatalog =
      Boolean(codeKey) && codeKey !== "—" && validSet.has(codeKey);

    if (!desc) {
      hints[index] = {
        key: riga.key,
        status: inCatalog
          ? "ok"
          : codeKey && codeKey !== "—"
            ? "codice_orfano"
            : "nessun_match",
        best: null,
      };
      return;
    }

    const matched = await rpcMatchCatalogo(supabase, desc, 6, 0.35);
    if (matched.error) {
      hints[index] = {
        key: riga.key,
        status: inCatalog
          ? "ok"
          : codeKey && codeKey !== "—"
            ? "codice_orfano"
            : "nessun_match",
        best: null,
      };
      return;
    }

    const ranked = rowsToHits(matched.rows, sameSet, aziendaCodes, null, desc);
    const best =
      ranked.find((h) => h.codice.trim().toLowerCase() !== codeKey) ??
      ranked[0] ??
      null;
    const score = best?.score ?? 0;

    if (inCatalog && best && best.codice.trim().toLowerCase() === codeKey) {
      hints[index] = { key: riga.key, status: "ok", best };
      return;
    }
    if (best && score >= RIGA_MATCH_SUGGEST_SCORE) {
      hints[index] = { key: riga.key, status: "possibile_match", best };
      return;
    }
    if (inCatalog) {
      hints[index] = { key: riga.key, status: "ok", best: null };
      return;
    }
    if (codeKey && codeKey !== "—") {
      hints[index] = { key: riga.key, status: "codice_orfano", best: null };
      return;
    }
    hints[index] = { key: riga.key, status: "nessun_match", best: null };
  }

  for (let i = 0; i < input.righe.length; i += CONCURRENCY) {
    const chunk = input.righe.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((r, j) => scanOne(r, i + j)));
  }

  return { success: true, hints: hints.filter(Boolean) };
}

export type AutoLinkExactResult = {
  key: string;
  /** Codice assegnato automaticamente (solo se match 100% univoco). */
  autoCodice: string | null;
  hint: RigaCatalogoMatchHint;
};

/**
 * Per ogni riga senza codice catalogo valido: se esiste un solo hit a 100%,
 * propone auto-link. Le altre restano all’operatore (hint).
 */
export async function autoLinkExactCatalogMatchesAction(input: {
  fatturaId?: string | null;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  codicePending: string | null;
  catalogCodiciValidi: string[];
  righe: Array<{ key: string; descrizione: string; codice: string }>;
}): Promise<
  | {
      success: true;
      results: AutoLinkExactResult[];
      autoLinkedCount: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const pending = (input.codicePending ?? "").trim().toLowerCase();
  const validSet = new Set(
    input.catalogCodiciValidi.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const sameSet = new Set(
    input.sameInvoiceCodici.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const aziendaCodes = await loadAziendaCodes(supabase, input.fornitoreId).catch(
    () => new Set<string>()
  );

  const results: AutoLinkExactResult[] = new Array(input.righe.length);
  const CONCURRENCY = 4;

  async function processOne(
    riga: { key: string; descrizione: string; codice: string },
    index: number
  ) {
    const codice = (riga.codice ?? "").trim();
    const codeKey = codice.toLowerCase();
    const desc = (riga.descrizione ?? "").trim();

    if (pending && codeKey && codeKey === pending) {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: { key: riga.key, status: "da_sostituire", best: null },
      };
      return;
    }

    const inCatalog =
      Boolean(codeKey) && codeKey !== "—" && validSet.has(codeKey);

    if (inCatalog) {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: { key: riga.key, status: "ok", best: null },
      };
      return;
    }

    if (!desc) {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: {
          key: riga.key,
          status:
            codeKey && codeKey !== "—"
              ? "codice_orfano"
              : "nessun_match",
          best: null,
        },
      };
      return;
    }

    const matched = await rpcMatchCatalogo(
      supabase,
      desc,
      CERCA_SEED_CANDIDATES,
      CERCA_RPC_THRESHOLD
    );
    if (matched.error || matched.rows.length === 0) {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: {
          key: riga.key,
          status:
            codeKey && codeKey !== "—"
              ? "codice_orfano"
              : "nessun_match",
          best: null,
          candidates: [],
        },
      };
      return;
    }

    const ranked = rowsToHits(matched.rows, sameSet, aziendaCodes, null, desc);
    const candidates = ranked.slice(0, CERCA_SEED_CANDIDATES);
    // 100% solo se affinità RPC reale (niente bonus contestuale finto)
    const exactHits = ranked.filter(
      (h) =>
        h.score >= AUTO_LINK_EXACT_MATCH_PCT &&
        hasMeaningfulTokenOverlap(desc, h.nome, h.codice)
    );
    // Univoco: un solo codice al 100% (non due articoli diversi entrambi a 100)
    const uniqueExact =
      exactHits.length === 1
        ? exactHits[0]!
        : exactHits.length > 1 &&
            new Set(exactHits.map((h) => h.codice.trim().toLowerCase())).size ===
              1
          ? exactHits[0]!
          : null;

    if (uniqueExact) {
      results[index] = {
        key: riga.key,
        autoCodice: uniqueExact.codice,
        hint: {
          key: riga.key,
          status: "ok",
          best: uniqueExact,
          candidates,
        },
      };
      return;
    }

    const best = ranked[0] ?? null;
    const score = best?.score ?? 0;
    if (best && score >= RIGA_MATCH_SUGGEST_SCORE) {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: {
          key: riga.key,
          status: "possibile_match",
          best,
          candidates,
        },
      };
      return;
    }
    if (codeKey && codeKey !== "—") {
      results[index] = {
        key: riga.key,
        autoCodice: null,
        hint: {
          key: riga.key,
          status: "codice_orfano",
          best: null,
          candidates,
        },
      };
      return;
    }
    results[index] = {
      key: riga.key,
      autoCodice: null,
      hint: {
        key: riga.key,
        status: "nessun_match",
        best: null,
        candidates,
      },
    };
  }

  for (let i = 0; i < input.righe.length; i += CONCURRENCY) {
    const chunk = input.righe.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((r, j) => processOne(r, i + j)));
  }

  const finalResults = results.filter(Boolean);
  const autoLinked = finalResults.filter((r) => r.autoCodice);
  if (autoLinked.length > 0) {
    void writeAuditLog({
      entity_type: "fatture_ricevute_catalogo_auto_link",
      entity_id: input.fatturaId?.trim() || "draft",
      action: "auto_link_exact_match",
      actor_id: auth.userId,
      summary: `Auto-link ${autoLinked.length} riga/e a match 100%`,
      payload: {
        links: autoLinked.map((r) => ({
          key: r.key,
          codice: r.autoCodice,
          hit: r.hint.best
            ? {
                codice: r.hint.best.codice,
                nome: r.hint.best.nome,
                score: r.hint.best.score,
                kind: r.hint.best.catalogoKind,
              }
            : null,
        })),
      },
    });
  }

  return {
    success: true,
    results: finalResults,
    autoLinkedCount: autoLinked.length,
  };
}

export async function listFattureDaAggiornareCatalogoAction(): Promise<
  | { success: true; fatture: Fattura[]; count: number }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_ricevute")
    .select("*")
    .eq("richiede_aggiornamento_catalogo", true)
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as FatturaRicevutaRow[];
  const fatture: Fattura[] = [];
  for (const row of rows) {
    const { data: righe } = await supabase
      .from("fatture_ricevute_righe")
      .select("*")
      .eq("fattura_id", row.id)
      .order("sort_order", { ascending: true });
    const { data: dilazioni } = await supabase
      .from("fatture_ricevute_dilazioni")
      .select("*")
      .eq("fattura_id", row.id)
      .is("deleted_at", null);
    fatture.push(
      mapFatturaRicevutaRow(
        row,
        (righe ?? []) as FatturaRicevutaRigaRow[],
        (dilazioni ?? []) as FatturaRicevutaDilazioneRow[]
      )
    );
  }
  return { success: true, fatture, count: fatture.length };
}

/** Dopo salvataggio: se il codice pending non è più sulle righe, togli dalla coda. */
export async function maybeClearFatturaCodaCatalogo(
  fatturaId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();
  const { data: fat } = await supabase
    .from("fatture_ricevute")
    .select("id, codice_catalogo_pending, richiede_aggiornamento_catalogo")
    .eq("id", fatturaId)
    .maybeSingle();
  if (
    !fat ||
    !(fat as { richiede_aggiornamento_catalogo?: boolean })
      .richiede_aggiornamento_catalogo
  ) {
    return;
  }
  const pending = String(
    (fat as { codice_catalogo_pending?: string | null })
      .codice_catalogo_pending ?? ""
  ).trim();
  if (!pending) {
    await supabase
      .from("fatture_ricevute")
      .update({
        richiede_aggiornamento_catalogo: false,
        codice_catalogo_pending: null,
        documento_stato: "registrata",
        updated_by: userId,
      })
      .eq("id", fatturaId);
    return;
  }
  const refs = await findCodiceRiferimenti(supabase, pending, "prodotto");
  const stillOnThis = refs.fatture.some((f) => f.fatturaId === fatturaId);
  const { data: righe } = await supabase
    .from("fatture_ricevute_righe")
    .select("codice")
    .eq("fattura_id", fatturaId);
  const still = ((righe ?? []) as Array<{ codice: string }>).some(
    (r) => r.codice.trim().toLowerCase() === pending.toLowerCase()
  );
  if (!still && !stillOnThis) {
    await supabase
      .from("fatture_ricevute")
      .update({
        richiede_aggiornamento_catalogo: false,
        codice_catalogo_pending: null,
        documento_stato: "registrata",
        updated_by: userId,
      })
      .eq("id", fatturaId);
  }
}
