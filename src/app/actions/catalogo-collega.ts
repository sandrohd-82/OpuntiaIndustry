"use server";

import {
  findCodiceRiferimenti,
  type CatalogoLifecycleKind,
} from "@/lib/amministrazione/catalogo-lifecycle";
import {
  mapFatturaRicevutaRow,
  type Fattura,
} from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
  FatturaRicevutaDilazioneRow,
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
};

/** Soglia UI “possibile match” (suggerimento, non auto-link). */
export const RIGA_MATCH_SUGGEST_SCORE = 55;

function normalizeSearch(q: string): string {
  return q
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreText(query: string, codice: string, nome: string): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const c = normalizeSearch(codice);
  const n = normalizeSearch(nome);
  if (c === q || n === q) return 100;
  if (c.startsWith(q) || n.startsWith(q)) return 85;
  if (c.includes(q) || n.includes(q)) return 70;
  const tokens = q.split(" ").filter(Boolean);
  let hit = 0;
  for (const t of tokens) {
    if (c.includes(t) || n.includes(t)) hit += 1;
  }
  if (hit === 0) return 0;
  return Math.min(65, 30 + hit * 12);
}

type CatalogEntry = {
  kind: CatalogoLifecycleKind;
  id: string;
  codice: string;
  nome: string;
};

async function loadAziendaCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fornitoreId: string | null
): Promise<Set<string>> {
  const aziendaCodes = new Set<string>();
  if (!fornitoreId) return aziendaCodes;
  const { data: forn } = await supabase
    .from("fornitori")
    .select("servizi_offerti, prodotti_fornitore, prodotti_acquistati")
    .eq("id", fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn) return aziendaCodes;
  const row = forn as {
    servizi_offerti?: string[];
    prodotti_fornitore?: string[];
    prodotti_acquistati?: string[];
  };
  for (const arr of [
    row.servizi_offerti,
    row.prodotti_fornitore,
    row.prodotti_acquistati,
  ]) {
    for (const c of arr ?? []) {
      if (c?.trim()) aziendaCodes.add(c.trim().toLowerCase());
    }
  }
  return aziendaCodes;
}

async function loadCatalogEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  preferKind?: CatalogoLifecycleKind | null
): Promise<{ entries: CatalogEntry[]; error: string | null }> {
  const tables: Array<{
    kind: CatalogoLifecycleKind;
    table: "catalogo_servizi" | "catalogo_prodotti_fornitore" | "materie_prime";
  }> = [
    { kind: "servizio", table: "catalogo_servizi" },
    { kind: "prodotto", table: "catalogo_prodotti_fornitore" },
    { kind: "materia", table: "materie_prime" },
  ];
  const entries: CatalogEntry[] = [];
  for (const t of tables) {
    if (preferKind && preferKind !== t.kind) continue;
    const { data, error } = await supabase
      .from(t.table)
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(400);
    if (error) return { entries: [], error: error.message };
    for (const row of (data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
    }>) {
      entries.push({
        kind: t.kind,
        id: row.id,
        codice: row.codice,
        nome: row.nome,
      });
    }
  }
  return { entries, error: null };
}

function rankHits(input: {
  query: string;
  entries: CatalogEntry[];
  sameSet: Set<string>;
  aziendaCodes: Set<string>;
}): CollegaCatalogoHit[] {
  const q = input.query.trim();
  const hits: CollegaCatalogoHit[] = [];
  for (const row of input.entries) {
    const codeKey = row.codice.trim().toLowerCase();
    let source: CollegaCatalogoHit["source"] = "catalogo";
    let score = q ? scoreText(q, row.codice, row.nome) : 10;
    if (input.sameSet.has(codeKey)) {
      source = "stessa_fattura";
      score = Math.max(score, 95);
    } else if (input.aziendaCodes.has(codeKey)) {
      source = "stessa_azienda";
      score = Math.max(score, q ? score + 15 : 80);
    } else if (q && score < 30) {
      continue;
    } else if (!q && source === "catalogo") {
      continue;
    }
    hits.push({
      source,
      catalogoKind: row.kind,
      catalogoId: row.id,
      codice: row.codice,
      nome: row.nome,
      score,
    });
  }
  hits.sort((a, b) => {
    const order = { stessa_fattura: 0, stessa_azienda: 1, catalogo: 2 };
    const d = order[a.source] - order[b.source];
    if (d !== 0) return d;
    return b.score - a.score || a.codice.localeCompare(b.codice, "it");
  });
  return hits;
}

/** Cerca voci da collegare: stessa fattura → stessa azienda → catalogo fulltext. */
export async function searchCollegaCatalogoAction(input: {
  query: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  preferKind?: CatalogoLifecycleKind | null;
}): Promise<
  | { success: true; hits: CollegaCatalogoHit[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const sameSet = new Set(
    input.sameInvoiceCodici.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );
  const aziendaCodes = await loadAziendaCodes(supabase, input.fornitoreId);
  const loaded = await loadCatalogEntries(supabase, input.preferKind);
  if (loaded.error) return { success: false, error: loaded.error };
  const hits = rankHits({
    query: input.query,
    entries: loaded.entries,
    sameSet,
    aziendaCodes,
  });
  return { success: true, hits: hits.slice(0, 40) };
}

/**
 * Scan righe fattura: suggerimenti match descrizione↔catalogo (nessuna auto-associazione).
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
  const aziendaCodes = await loadAziendaCodes(supabase, input.fornitoreId);
  const loaded = await loadCatalogEntries(supabase, null);
  if (loaded.error) return { success: false, error: loaded.error };

  // Se non passano catalogCodiciValidi, deriva dagli entries caricati
  if (validSet.size === 0) {
    for (const e of loaded.entries) {
      validSet.add(e.codice.trim().toLowerCase());
    }
  }

  const hints: RigaCatalogoMatchHint[] = [];

  for (const riga of input.righe) {
    const codice = (riga.codice ?? "").trim();
    const codeKey = codice.toLowerCase();
    const desc = (riga.descrizione ?? "").trim();

    if (pending && codeKey && codeKey === pending) {
      hints.push({ key: riga.key, status: "da_sostituire", best: null });
      continue;
    }

    const inCatalog =
      Boolean(codeKey) && codeKey !== "—" && validSet.has(codeKey);

    if (!desc) {
      hints.push({
        key: riga.key,
        status: inCatalog
          ? "ok"
          : codeKey && codeKey !== "—"
            ? "codice_orfano"
            : "nessun_match",
        best: null,
      });
      continue;
    }

    const ranked = rankHits({
      query: desc,
      entries: loaded.entries,
      sameSet,
      aziendaCodes,
    });
    const best =
      ranked.find((h) => h.codice.trim().toLowerCase() !== codeKey) ??
      ranked[0] ??
      null;
    const score = best?.score ?? 0;

    if (inCatalog && best && best.codice.trim().toLowerCase() === codeKey) {
      hints.push({ key: riga.key, status: "ok", best });
      continue;
    }

    if (best && score >= RIGA_MATCH_SUGGEST_SCORE) {
      if (inCatalog && best.codice.trim().toLowerCase() === codeKey) {
        hints.push({ key: riga.key, status: "ok", best });
      } else {
        hints.push({ key: riga.key, status: "possibile_match", best });
      }
      continue;
    }

    if (inCatalog) {
      hints.push({ key: riga.key, status: "ok", best: null });
      continue;
    }

    if (codeKey && codeKey !== "—") {
      hints.push({ key: riga.key, status: "codice_orfano", best: null });
      continue;
    }

    hints.push({ key: riga.key, status: "nessun_match", best: null });
  }

  return { success: true, hints };
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
  if (!fat || !(fat as { richiede_aggiornamento_catalogo?: boolean }).richiede_aggiornamento_catalogo) {
    return;
  }
  const pending = String(
    (fat as { codice_catalogo_pending?: string | null }).codice_catalogo_pending ??
      ""
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
  // Also check servizio/materia - findCodice only one kind. Check righe directly:
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
