"use server";

import { createClient } from "@/lib/supabase/server";
import {
  calcolaConsegnaCapacita,
  calcoloConsegnaInputSchema,
  stagioneFromDate,
  type CapacitaCalcoloResult,
  type EssiccatoreCapacita,
  type LineaProduzione,
  type LineaProduzioneCodice,
  type ResaBaseline,
  type StagioneProduzione,
} from "@/lib/amministrazione/produzione-capacita";
import { requireAreaAccess } from "@/lib/areas/guard";

async function loadLinee(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<LineaProduzione[]> {
  const { data, error } = await supabase
    .from("produzione_linee")
    .select(
      "codice, nome, prefissi_prodotto, usa_essiccatori, capacita_ingresso_giornaliera_kg"
    )
    .is("deleted_at", null);
  if (error) {
    console.error("[produzione_linee]", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    codice: r.codice as LineaProduzioneCodice,
    nome: String(r.nome),
    prefissiProdotto: (r.prefissi_prodotto as string[]) ?? [],
    usaEssiccatori: Boolean(r.usa_essiccatori),
    capacitaIngressoGiornalieraKg:
      r.capacita_ingresso_giornaliera_kg == null
        ? null
        : Number(r.capacita_ingresso_giornaliera_kg),
  }));
}

async function loadEssiccatori(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<EssiccatoreCapacita[]> {
  const { data, error } = await supabase
    .from("produzione_essiccatori")
    .select("id, codice, nome, capacita_ingresso_kg, attivo")
    .is("deleted_at", null);
  if (error) {
    console.error("[produzione_essiccatori]", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    codice: String(r.codice),
    nome: String(r.nome),
    capacitaIngressoKg: Number(r.capacita_ingresso_kg),
    attivo: Boolean(r.attivo),
  }));
}

async function loadReseBaseline(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ResaBaseline[]> {
  const { data, error } = await supabase
    .from("produzione_resa_baseline")
    .select(
      "linea_codice, stagione, resa_percentuale_min, resa_percentuale_max, resa_percentuale_media"
    )
    .is("deleted_at", null);
  if (error) {
    console.error("[produzione_resa_baseline]", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    lineaCodice: r.linea_codice as LineaProduzioneCodice,
    stagione: r.stagione as StagioneProduzione,
    resaPercentualeMin: Number(r.resa_percentuale_min),
    resaPercentualeMax: Number(r.resa_percentuale_max),
    resaPercentualeMedia: Number(r.resa_percentuale_media),
  }));
}

/**
 * Medie rese da osservazioni reali (non test) — base ML futura.
 * Chiave: `${linea}|${stagione}`.
 */
async function loadReseMedieOsservate(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("produzione_resa_osservazioni")
    .select(
      "data_lavorazione, linea_codice, kg_ingresso, kg_uscita, resa_percentuale, is_test"
    )
    .is("deleted_at", null)
    .eq("is_test", false)
    .gt("kg_ingresso", 0);
  if (error) {
    console.error("[produzione_resa_osservazioni]", error.message);
    return {};
  }

  const acc = new Map<string, { sumPct: number; n: number }>();
  for (const row of data ?? []) {
    const stagione = stagioneFromDate(String(row.data_lavorazione));
    const key = `${row.linea_codice}|${stagione}`;
    let pct = Number(row.resa_percentuale);
    if (!Number.isFinite(pct) || pct <= 0) {
      const ing = Number(row.kg_ingresso);
      const usc = Number(row.kg_uscita);
      if (ing > 0) pct = (usc / ing) * 100;
    }
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const cur = acc.get(key) ?? { sumPct: 0, n: 0 };
    cur.sumPct += pct;
    cur.n += 1;
    acc.set(key, cur);
  }

  const out: Record<string, number> = {};
  for (const [key, v] of acc) {
    if (v.n >= 3) out[key] = Math.round((v.sumPct / v.n) * 10000) / 10000;
  }
  return out;
}

export async function getGiacenzaProdottoAction(
  prodottoId: string
): Promise<
  | { success: true; quantitaKg: number }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_giacenze")
    .select("quantita_kg")
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    quantitaKg: data ? Number(data.quantita_kg) : 0,
  };
}

export async function calcolaConsegnaOrdineAction(
  raw: unknown
): Promise<
  | { success: true; calcolo: CapacitaCalcoloResult; giacenzaKg: number }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = calcoloConsegnaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati calcolo non validi.",
    };
  }
  const input = parsed.data;
  if (input.consegnaTipo === "data" && !input.dataRichiesta) {
    return { success: false, error: "Indica la data di consegna desiderata." };
  }

  const supabase = await createClient();
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dataPartenza = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [linee, essiccatori, reseBaseline, reseMedie, giacenzaRow] =
    await Promise.all([
      loadLinee(supabase),
      loadEssiccatori(supabase),
      loadReseBaseline(supabase),
      loadReseMedieOsservate(supabase),
      supabase
        .from("magazzino_giacenze")
        .select("quantita_kg")
        .eq("prodotto_id", input.prodottoId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (giacenzaRow.error) {
    return { success: false, error: giacenzaRow.error.message };
  }
  const giacenzaKg = giacenzaRow.data
    ? Number(giacenzaRow.data.quantita_kg)
    : 0;

  const calcolo = calcolaConsegnaCapacita({
    prodottoCodice: input.prodottoCodice,
    quantitaKg: input.quantitaKg,
    dataPartenza,
    consegnaTipo: input.consegnaTipo,
    dataRichiesta: input.dataRichiesta ?? null,
    urgente: input.urgente,
    usaMagazzino: input.usaMagazzino,
    usaSabato: input.usaSabato,
    giacenzaKg,
    linee,
    essiccatori,
    reseBaseline,
    reseMedieOsservate: reseMedie,
  });

  return {
    success: true,
    calcolo,
    giacenzaKg,
  };
}
