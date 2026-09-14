"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import {
  composeLottoIngressoMp,
  foglioIngressoSaveSchema,
  isValidLottoIngressoMp,
  MEZZO_FOTO_KINDS,
  nextSeqFromLotti,
  nuovoAutistaSchema,
  nuovoFornitoreRapidoSchema,
  nuovoMezzoSchema,
  prefixLottoDaData,
  type ConfezionamentoMp,
  type ConfezioneRiga,
  type FoglioIngressoMp,
  type IngressoMpOrigine,
  type IngressoMpStato,
  type MezzoFotoKind,
  type MezzoIngresso,
  type QuantitaTipoIngresso,
} from "@/lib/produzione/fogli-ingresso-mp";
import {
  buildAnteprimaUnita,
  composeCodiceUnita,
  parseUnitaScanInput,
  scanPayloadFromToken,
  type IngressoMpUnita,
} from "@/lib/produzione/ingresso-mp-unita";
import { normalizeTipologie } from "@/lib/amministrazione/catalogo-offerta";
import { createClient } from "@/lib/supabase/server";
import type { FornitoreTipologia } from "@/types/database";

const BUCKET = "produzione-ingresso-mp";

type FoglioRow = {
  id: string;
  codice: string;
  lotto_codice: string | null;
  versione: number;
  documento_stato: IngressoMpStato;
  origine?: IngressoMpOrigine | null;
  movimento_magazzino_id?: string | null;
  prodotto_proprio_id?: string | null;
  lotto_lavorazione?: string | null;
  fornitore_id: string | null;
  materia_prima_id: string | null;
  is_bio: boolean;
  quantita: number | string;
  quantita_unita: string;
  quantita_tipo: QuantitaTipoIngresso;
  ddt_produttore: string;
  ddt_data: string | null;
  ddt_file_path: string | null;
  ddt_file_name: string | null;
  carico_lato_destro_path: string | null;
  carico_lato_destro_name: string | null;
  carico_lato_sinistro_path: string | null;
  carico_lato_sinistro_name: string | null;
  arrivato_at: string;
  mezzo_id: string | null;
  autista_contatto_id: string | null;
  scarico_mezzo: string;
  operatore_muletto_id: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  note: string;
  gruppo_lettera?: string | null;
  created_at: string;
};

function mapFoglio(
  r: FoglioRow,
  extra: {
    fornitoreLabel: string;
    fornitoreTarga: string;
    fornitoreBio: boolean;
    materiaPrimaLabel: string;
    mezzoTarga: string | null;
    autistaLabel: string | null;
    operatoreLabel: string | null;
    confezioni: ConfezioneRiga[];
    unita: IngressoMpUnita[];
    prodottoProprioLabel?: string | null;
  }
): FoglioIngressoMp {
  const origine: IngressoMpOrigine =
    r.origine === "inventario_magazzino" ? "inventario_magazzino" : "ingresso";
  return {
    id: r.id,
    codice: r.codice,
    lottoCodice: r.lotto_codice,
    versione: r.versione,
    documentoStato: r.documento_stato,
    origine,
    lottoLavorazione: r.lotto_lavorazione ?? null,
    prodottoProprioId: r.prodotto_proprio_id ?? null,
    movimentoMagazzinoId: r.movimento_magazzino_id ?? null,
    fornitoreId: r.fornitore_id,
    fornitoreLabel: extra.fornitoreLabel,
    fornitoreTarga: extra.fornitoreTarga,
    fornitoreBio: extra.fornitoreBio,
    materiaPrimaId: r.materia_prima_id,
    materiaPrimaLabel:
      origine === "inventario_magazzino"
        ? extra.prodottoProprioLabel ||
          extra.materiaPrimaLabel ||
          "Inventario / settaggio magazzino"
        : extra.materiaPrimaLabel,
    isBio: r.is_bio,
    quantita: Number(r.quantita) || 0,
    quantitaUnita: r.quantita_unita,
    quantitaTipo: r.quantita_tipo,
    ddtProduttore: r.ddt_produttore ?? "",
    ddtData: r.ddt_data ? String(r.ddt_data).slice(0, 10) : null,
    ddtFilePath: r.ddt_file_path,
    ddtFileName: r.ddt_file_name,
    caricoLatoDestroPath: r.carico_lato_destro_path ?? null,
    caricoLatoDestroName: r.carico_lato_destro_name ?? null,
    caricoLatoSinistroPath: r.carico_lato_sinistro_path ?? null,
    caricoLatoSinistroName: r.carico_lato_sinistro_name ?? null,
    arrivatoAt: r.arrivato_at,
    mezzoId: r.mezzo_id,
    mezzoTarga: extra.mezzoTarga,
    autistaContattoId: r.autista_contatto_id,
    autistaLabel: extra.autistaLabel,
    scaricoMezzo: r.scarico_mezzo,
    operatoreMulettoId: r.operatore_muletto_id,
    operatoreMulettoLabel: extra.operatoreLabel,
    confirmedAt: r.confirmed_at,
    closedAt: r.closed_at,
    note: r.note ?? "",
    gruppoLettera: r.gruppo_lettera ?? null,
    confezioni: extra.confezioni,
    unita: extra.unita,
    createdAt: r.created_at,
  };
}

async function hydrateFogli(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: FoglioRow[]
): Promise<FoglioIngressoMp[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const fornIds = [
    ...new Set(
      rows.map((r) => r.fornitore_id).filter((x): x is string => Boolean(x))
    ),
  ];
  const mpIds = [
    ...new Set(
      rows.map((r) => r.materia_prima_id).filter((x): x is string => Boolean(x))
    ),
  ];
  const prodIds = [
    ...new Set(
      rows
        .map((r) => r.prodotto_proprio_id)
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const mezzoIds = [
    ...new Set(rows.map((r) => r.mezzo_id).filter((x): x is string => Boolean(x))),
  ];
  const autistaIds = [
    ...new Set(
      rows.map((r) => r.autista_contatto_id).filter((x): x is string => Boolean(x))
    ),
  ];
  const opIds = [
    ...new Set(
      rows.map((r) => r.operatore_muletto_id).filter((x): x is string => Boolean(x))
    ),
  ];

  const [forn, mp, mezzi, autisti, ops, confs, prods, unitaRows] = await Promise.all([
    fornIds.length
      ? supabase
          .from("fornitori")
          .select("id, codice_targa, ragione_sociale, bio_certificato_path")
          .in("id", fornIds)
      : Promise.resolve({ data: [] }),
    mpIds.length
      ? supabase.from("materie_prime").select("id, codice, nome").in("id", mpIds)
      : Promise.resolve({ data: [] }),
    mezzoIds.length
      ? supabase.from("produzione_mezzi").select("id, targa").in("id", mezzoIds)
      : Promise.resolve({ data: [] }),
    autistaIds.length
      ? supabase
          .from("rubrica_contatti")
          .select("id, nome, cognome")
          .in("id", autistaIds)
      : Promise.resolve({ data: [] }),
    opIds.length
      ? supabase
          .from("organigramma_persone")
          .select("id, nome, cognome")
          .in("id", opIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("produzione_fogli_ingresso_confezioni")
      .select("id, foglio_id, confezionamento_id, quantita_confezioni, peso_kg")
      .in("foglio_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    prodIds.length
      ? supabase
          .from("prodotti_propri")
          .select("id, codice, nome")
          .in("id", prodIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("produzione_fogli_ingresso_unita")
      .select(
        "id, foglio_id, confezione_id, confezionamento_id, tipo_nome, gruppo_lettera, indice_tipo, totale_tipo, codice_unita, scan_token, usato_at, created_at"
      )
      .in("foglio_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const fornMap = new Map(
    ((forn.data ?? []) as Array<{
      id: string;
      codice_targa: string;
      ragione_sociale: string;
      bio_certificato_path: string | null;
    }>).map((f) => [f.id, f])
  );
  const mpMap = new Map(
    ((mp.data ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
      (m) => [m.id, m]
    )
  );
  const mezzoMap = new Map(
    ((mezzi.data ?? []) as Array<{ id: string; targa: string }>).map((m) => [
      m.id,
      m.targa,
    ])
  );
  const autMap = new Map(
    ((autisti.data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (a) => [a.id, `${a.nome} ${a.cognome}`.trim()]
    )
  );
  const opMap = new Map(
    ((ops.data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (a) => [a.id, `${a.nome} ${a.cognome}`.trim()]
    )
  );
  const prodMap = new Map(
    ((prods.data ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
      (p) => [p.id, p]
    )
  );
  const confBy = new Map<string, ConfezioneRiga[]>();
  for (const c of (confs.data ?? []) as Array<{
    id: string;
    foglio_id: string;
    confezionamento_id: string;
    quantita_confezioni: number;
    peso_kg: number | null;
  }>) {
    const list = confBy.get(c.foglio_id) ?? [];
    list.push({
      id: c.id,
      confezionamentoId: c.confezionamento_id,
      quantitaConfezioni: c.quantita_confezioni,
      pesoKg: c.peso_kg != null ? Number(c.peso_kg) : null,
    });
    confBy.set(c.foglio_id, list);
  }

  const unitaBy = new Map<string, IngressoMpUnita[]>();
  for (const u of (unitaRows.data ?? []) as Array<{
    id: string;
    foglio_id: string;
    confezione_id: string | null;
    confezionamento_id: string;
    tipo_nome: string;
    gruppo_lettera: string;
    indice_tipo: number;
    totale_tipo: number;
    codice_unita: string;
    scan_token: string;
    usato_at: string | null;
  }>) {
    const list = unitaBy.get(u.foglio_id) ?? [];
    list.push({
      id: u.id,
      foglioId: u.foglio_id,
      confezioneId: u.confezione_id,
      confezionamentoId: u.confezionamento_id,
      tipoNome: u.tipo_nome,
      gruppoLettera: u.gruppo_lettera,
      indiceTipo: u.indice_tipo,
      totaleTipo: u.totale_tipo,
      codiceUnita: u.codice_unita,
      scanToken: u.scan_token,
      scanPayload: scanPayloadFromToken(u.scan_token),
      usatoAt: u.usato_at,
    });
    unitaBy.set(u.foglio_id, list);
  }

  return rows.map((r) => {
    const f = r.fornitore_id ? fornMap.get(r.fornitore_id) : undefined;
    const m = r.materia_prima_id ? mpMap.get(r.materia_prima_id) : undefined;
    const prod = r.prodotto_proprio_id
      ? prodMap.get(r.prodotto_proprio_id)
      : undefined;
    return mapFoglio(r, {
      fornitoreLabel:
        r.origine === "inventario_magazzino" && !f
          ? "Inventario / settaggio magazzino"
          : f
            ? `${f.codice_targa} — ${f.ragione_sociale}`
            : "—",
      fornitoreTarga: f?.codice_targa ?? "",
      prodottoProprioLabel: prod
        ? `${prod.codice} — ${prod.nome}`
        : null,
      fornitoreBio: Boolean(f?.bio_certificato_path),
      materiaPrimaLabel: m ? `${m.codice} — ${m.nome}` : "—",
      mezzoTarga: r.mezzo_id ? mezzoMap.get(r.mezzo_id) ?? null : null,
      autistaLabel: r.autista_contatto_id
        ? autMap.get(r.autista_contatto_id) ?? null
        : null,
      operatoreLabel: r.operatore_muletto_id
        ? opMap.get(r.operatore_muletto_id) ?? null
        : null,
      confezioni: confBy.get(r.id) ?? [],
      unita: unitaBy.get(r.id) ?? [],
    });
  });
}

export async function listConfezionamentiMpAction(): Promise<
  | { success: true; items: ConfezionamentoMp[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_confezionamenti_mp")
    .select("id, codice, nome, label_numero, media_peso_kg, conteggio_pesate")
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      label_numero: string;
      media_peso_kg: number | null;
      conteggio_pesate: number;
    }>).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      labelNumero: r.label_numero,
      mediaPesoKg: r.media_peso_kg != null ? Number(r.media_peso_kg) : null,
      conteggioPesate: r.conteggio_pesate,
    })),
  };
}

export async function listFornitoriIngressoAction(): Promise<
  | {
      success: true;
      items: Array<{
        id: string;
        label: string;
        targa: string;
        isBio: boolean;
        tipologie: FornitoreTipologia[];
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("id, codice_targa, ragione_sociale, bio_certificato_path, tipologie")
    .is("deleted_at", null)
    .order("codice_targa", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice_targa: string;
      ragione_sociale: string;
      bio_certificato_path: string | null;
      tipologie: FornitoreTipologia[] | null;
    }>).map((r) => ({
      id: r.id,
      label: `${r.codice_targa} — ${r.ragione_sociale}`,
      targa: r.codice_targa,
      isBio: Boolean(r.bio_certificato_path?.trim()),
      tipologie: normalizeTipologie(r.tipologie),
    })),
  };
}

export async function listMateriePrimeIngressoAction(): Promise<
  | {
      success: true;
      items: Array<{ id: string; label: string; isBio: boolean }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materie_prime")
    .select("id, codice, nome, is_bio")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      is_bio: boolean;
    }>).map((r) => ({
      id: r.id,
      label: `${r.codice} — ${r.nome}`,
      isBio: Boolean(r.is_bio),
    })),
  };
}

export async function listAutistiIngressoAction(
  fornitoreId: string
): Promise<
  | { success: true; items: Array<{ id: string; label: string }> }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  if (!fornitoreId) return { success: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .select("id, nome, cognome")
    .eq("azienda_tipo", "fornitore")
    .eq("azienda_id", fornitoreId)
    .is("deleted_at", null)
    .order("cognome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (r) => ({ id: r.id, label: `${r.nome} ${r.cognome}`.trim() })
    ),
  };
}

export async function listMezziIngressoAction(): Promise<
  { success: true; items: MezzoIngresso[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_mezzi")
    .select("id, targa, fornitore_id, azienda_nome")
    .is("deleted_at", null)
    .order("targa", { ascending: true });
  if (error) return { success: false, error: error.message };
  const mezzi = (data ?? []) as Array<{
    id: string;
    targa: string;
    fornitore_id: string | null;
    azienda_nome: string;
  }>;
  const ids = mezzi.map((m) => m.id);
  const fotoRes =
    ids.length === 0
      ? { data: [] }
      : await supabase
          .from("produzione_mezzi_foto")
          .select("id, mezzo_id, kind, storage_path")
          .in("mezzo_id", ids)
          .is("deleted_at", null);
  const fotoBy = new Map<
    string,
    MezzoIngresso["foto"]
  >();
  for (const f of (fotoRes.data ?? []) as Array<{
    id: string;
    mezzo_id: string;
    kind: MezzoFotoKind;
    storage_path: string;
  }>) {
    const list = fotoBy.get(f.mezzo_id) ?? [];
    list.push({ id: f.id, kind: f.kind, path: f.storage_path });
    fotoBy.set(f.mezzo_id, list);
  }
  return {
    success: true,
    items: mezzi.map((m) => ({
      id: m.id,
      targa: m.targa,
      fornitoreId: m.fornitore_id,
      aziendaNome: m.azienda_nome,
      foto: fotoBy.get(m.id) ?? [],
    })),
  };
}

export async function listFogliIngressoMpAction(filtro: {
  storico?: boolean;
}): Promise<
  { success: true; items: FoglioIngressoMp[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  let q = supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .is("deleted_at", null)
    .order("arrivato_at", { ascending: false })
    .limit(200);
  q = filtro.storico
    ? q.eq("documento_stato", "chiuso")
    : q.in("documento_stato", ["bozza", "registrato"]);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const items = await hydrateFogli(supabase, (data ?? []) as FoglioRow[]);
  return { success: true, items };
}

export async function getFoglioIngressoMpAction(
  id: string
): Promise<
  { success: true; item: FoglioIngressoMp } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Foglio non trovato." };
  }
  let items = await hydrateFogli(supabase, [data as FoglioRow]);
  let item = items[0];
  if (!item) return { success: false, error: "Foglio non trovato." };
  if (
    item.lottoCodice &&
    item.unita.length === 0 &&
    item.confezioni.some((c) => c.quantitaConfezioni > 0)
  ) {
    const units = await ensureUnitaIngressoMp(
      supabase,
      id,
      auth.userId,
      item.gruppoLettera
    );
    if (units.success && units.created > 0) {
      const { data: again } = await supabase
        .from("produzione_fogli_ingresso_mp")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (again) {
        items = await hydrateFogli(supabase, [again as FoglioRow]);
        item = items[0] ?? item;
      }
    }
  }
  return { success: true, item };
}

async function queryCodiciMpLavorata(): Promise<
  | {
      success: true;
      items: Array<{
        lotto: string;
        fornitoreTarga: string;
        fornitoreLabel: string;
        materiaPrima: string;
        arrivatoAt: string;
      }>;
    }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select(
      "lotto_codice, fornitore_id, materia_prima_id, arrivato_at, origine, fornitori(codice_targa, ragione_sociale), materie_prime(codice, nome)"
    )
    .is("deleted_at", null)
    .not("lotto_codice", "is", null)
    .in("documento_stato", ["registrato", "chiuso"])
    .order("arrivato_at", { ascending: false })
    .limit(300);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      lotto_codice: string;
      arrivato_at: string;
      origine?: string | null;
      fornitori:
        | { codice_targa: string; ragione_sociale: string }
        | { codice_targa: string; ragione_sociale: string }[]
        | null;
      materie_prime:
        | { codice: string; nome: string }
        | { codice: string; nome: string }[]
        | null;
    }>).map((r) => {
      const f = Array.isArray(r.fornitori) ? r.fornitori[0] : r.fornitori;
      const m = Array.isArray(r.materie_prime)
        ? r.materie_prime[0]
        : r.materie_prime;
      const inventario = r.origine === "inventario_magazzino";
      return {
        lotto: r.lotto_codice,
        fornitoreTarga: (f?.codice_targa ?? "").replace(/^F/i, ""),
        fornitoreLabel: inventario
          ? f
            ? `${f.codice_targa} — ${f.ragione_sociale} · inventario`
            : "Inventario / settaggio magazzino"
          : f
            ? `${f.codice_targa} — ${f.ragione_sociale}`
            : "—",
        materiaPrima: inventario
          ? "Inventario / settaggio magazzino"
          : m
            ? `${m.codice} — ${m.nome}`
            : "—",
        arrivatoAt: r.arrivato_at,
      };
    }),
  };
}

export async function listCodiciMpLavorataAction(): Promise<
  Awaited<ReturnType<typeof queryCodiciMpLavorata>>
> {
  await requireAreaAccess("produzione");
  return queryCodiciMpLavorata();
}

export async function listCodiciMpLavorataMagazzinoAction(): Promise<
  Awaited<ReturnType<typeof queryCodiciMpLavorata>>
> {
  await requireAreaAccess("magazzino");
  return queryCodiciMpLavorata();
}

export async function createFornitoreRapidoIngressoAction(raw: unknown): Promise<
  | {
      success: true;
      id: string;
      label: string;
      targa: string;
      isBio: false;
      tipologie: FornitoreTipologia[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoFornitoreRapidoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati fornitore non validi.",
    };
  }
  const supabase = await createClient();
  const { data: usedRows } = await supabase
    .from("fornitori")
    .select("codice_targa");
  const used = ((usedRows ?? []) as Array<{ codice_targa: string }>).map(
    (r) => r.codice_targa
  );
  let targa: string;
  try {
    targa = nextSequentialCodiceTarga("F", used);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Targa fornitore non disponibile.",
    };
  }
  const empty = "";
  const { data, error } = await supabase
    .from("fornitori")
    .insert({
      codice_targa: targa,
      ragione_sociale: parsed.data.ragioneSociale,
      partita_iva: parsed.data.partitaIva,
      codice_fiscale: parsed.data.partitaIva,
      email: empty,
      pec: empty,
      sdi_code: empty,
      telefono: empty,
      sito_web: empty,
      tipologie: parsed.data.tipologie ?? ["materia_prima"],
      servizi_offerti: [],
      prodotti_fornitore: [],
      sede_amm_nazione: empty,
      sede_amm_provincia: empty,
      sede_amm_citta: empty,
      sede_amm_cap: empty,
      sede_amm_indirizzo: empty,
      sede_mag_nazione: empty,
      sede_mag_provincia: empty,
      sede_mag_citta: empty,
      sede_mag_cap: empty,
      sede_mag_indirizzo: empty,
      prodotti_acquistati: [],
      bio_certificato: "",
      bio_certificato_path: "",
      bio_codice: "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice_targa, ragione_sociale")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fornitore fallita." };
  }
  void writeAuditLog({
    entity_type: "fornitori",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Fornitore rapido ingresso MP ${data.codice_targa}`,
    payload: { ragione_sociale: data.ragione_sociale },
  });
  return {
    success: true,
    id: data.id,
    targa: data.codice_targa,
    label: `${data.codice_targa} — ${data.ragione_sociale}`,
    isBio: false,
    tipologie: parsed.data.tipologie ?? ["materia_prima"],
  };
}

export async function createMezzoIngressoAction(raw: unknown): Promise<
  { success: true; item: MezzoIngresso } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoMezzoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mezzo non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_mezzi")
    .insert({
      targa: parsed.data.targa.trim().toUpperCase(),
      fornitore_id: parsed.data.fornitoreId ?? null,
      azienda_nome: parsed.data.aziendaNome?.trim() ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, targa, fornitore_id, azienda_nome")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Mezzo non salvato." };
  }
  void writeAuditLog({
    entity_type: "produzione_mezzi",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Mezzo ingresso ${data.targa}`,
    payload: { targa: data.targa },
  });
  return {
    success: true,
    item: {
      id: data.id,
      targa: data.targa,
      fornitoreId: data.fornitore_id,
      aziendaNome: data.azienda_nome,
      foto: [],
    },
  };
}

export async function createAutistaIngressoAction(raw: unknown): Promise<
  | { success: true; id: string; label: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoAutistaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati autista non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data: mansioneAutista } = await supabase
    .from("rubrica_mansioni")
    .select("id, nome")
    .eq("codice", "autista")
    .is("deleted_at", null)
    .maybeSingle();
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .insert({
      nome: v.nome,
      cognome: v.cognome,
      telefono: v.telefono,
      email: "",
      rapporto: "referente",
      azienda_tipo: "fornitore",
      azienda_id: v.fornitoreId,
      azienda_label: v.fornitoreLabel,
      mansione_id: mansioneAutista?.id ?? null,
      mansione: mansioneAutista?.nome ?? "Autista",
      note: v.note,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, nome, cognome")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Autista non salvato." };
  }
  await supabase.from("fornitori_referenti").insert({
    fornitore_id: v.fornitoreId,
    contatto_id: data.id,
    created_by: auth.userId,
  });
  return {
    success: true,
    id: data.id,
    label: `${data.nome} ${data.cognome}`.trim(),
  };
}

async function replaceConfezioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string,
  userId: string,
  righe: ConfezioneRiga[]
) {
  await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("foglio_id", foglioId)
    .is("deleted_at", null);
  if (righe.length === 0) return;
  const { error } = await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .insert(
      righe.map((r, i) => ({
        foglio_id: foglioId,
        confezionamento_id: r.confezionamentoId,
        quantita_confezioni: r.quantitaConfezioni,
        peso_kg: r.pesoKg ?? null,
        sort_order: i,
        created_by: userId,
        updated_by: userId,
      }))
    );
  if (error) throw new Error(error.message);
}

export async function saveFoglioIngressoMpAction(raw: unknown): Promise<
  { success: true; item: FoglioIngressoMp } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = foglioIngressoSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati foglio non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data: forn } = await supabase
    .from("fornitori")
    .select("id, bio_certificato_path")
    .eq("id", v.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn) return { success: false, error: "Fornitore non trovato." };
  const fornBio = Boolean(
    (forn as { bio_certificato_path?: string }).bio_certificato_path?.trim()
  );
  if (v.isBio && !fornBio) {
    return {
      success: false,
      error:
        "Il materiale bio è consentito solo se il fornitore ha il certificato caricato.",
    };
  }

  const payload = {
    fornitore_id: v.fornitoreId,
    materia_prima_id: v.materiaPrimaId,
    is_bio: v.isBio,
    quantita: v.quantita,
    quantita_unita: v.quantitaUnita,
    quantita_tipo: v.quantitaTipo,
    ddt_produttore: v.ddtProduttore,
    ddt_data: v.ddtData || null,
    ddt_file_path: v.ddtFilePath ?? null,
    ddt_file_name: v.ddtFileName ?? null,
    carico_lato_destro_path: v.caricoLatoDestroPath,
    carico_lato_destro_name: v.caricoLatoDestroName ?? null,
    carico_lato_sinistro_path: v.caricoLatoSinistroPath,
    carico_lato_sinistro_name: v.caricoLatoSinistroName ?? null,
    arrivato_at: new Date(v.arrivatoAt).toISOString(),
    mezzo_id: v.mezzoId ?? null,
    autista_contatto_id: v.autistaContattoId ?? null,
    scarico_mezzo: v.scaricoMezzo,
    operatore_muletto_id: v.operatoreMulettoId ?? null,
    note: v.note,
    updated_by: auth.userId,
  };

  let id = v.id;
  if (id) {
    const { data: existing } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("id, documento_stato, versione")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return { success: false, error: "Foglio non trovato." };
    if ((existing as { documento_stato: string }).documento_stato === "chiuso") {
      return { success: false, error: "Il foglio chiuso non è modificabile." };
    }
    const { error } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .update({
        ...payload,
        versione: Number((existing as { versione: number }).versione ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
  } else {
    const stamp = new Date();
    const codice = `FIMP-${prefixLottoDaData(stamp)}-${formatHex5Local(
      Math.floor(Math.random() * 0xfffff) + 1
    )}`;
    const { data, error } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .insert({
        ...payload,
        codice,
        documento_stato: "bozza",
        origine: "ingresso",
        versione: 1,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio fallito." };
    }
    id = data.id;
  }
  if (!id) return { success: false, error: "Salvataggio fallito." };

  try {
    await replaceConfezioni(
      supabase,
      id,
      auth.userId,
      v.confezioni.map((r) => ({
        id: r.id,
        confezionamentoId: r.confezionamentoId,
        quantitaConfezioni: r.quantitaConfezioni,
        pesoKg: r.pesoKg ?? null,
      }))
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Confezionamenti non salvati.",
    };
  }

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: id,
    action: v.id ? "update" : "create",
    actor_id: auth.userId,
    summary: v.id
      ? `Aggiornato foglio ingresso MP`
      : `Creato foglio ingresso MP`,
    payload: {
      fornitore_id: v.fornitoreId,
      materia_prima_id: v.materiaPrimaId,
      quantita: v.quantita,
      quantita_tipo: v.quantitaTipo,
      carico_lato_destro_path: v.caricoLatoDestroPath,
      carico_lato_sinistro_path: v.caricoLatoSinistroPath,
    },
  });

  return getFoglioIngressoMpAction(id);
}

function formatHex5Local(n: number): string {
  return Math.max(1, n).toString(16).toUpperCase().padStart(5, "0");
}

export async function ensureFoglioMpInventarioDaCarico(input: {
  lottoMp: string;
  lottoLavorazione: string;
  movimentoId?: string | null;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantitaKg: number;
  unita: string;
  targaFornitore: string;
  motivoLabel: string;
  note: string;
  userId: string;
}): Promise<
  | { success: true; foglioId: string; foglioCodice: string; created: boolean }
  | { success: false; error: string }
> {
  if (!isValidLottoIngressoMp(input.lottoMp)) {
    return { success: false, error: "Codice MP lavorata non valido." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("id, codice, origine")
    .eq("lotto_codice", input.lottoMp)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const row = existing as {
      id: string;
      codice: string;
      origine?: string | null;
    };
    const patch: Record<string, unknown> = {
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    };
    if (input.movimentoId) {
      patch.movimento_magazzino_id = input.movimentoId;
    }
    if (row.origine === "inventario_magazzino") {
      patch.prodotto_proprio_id = input.prodottoId;
      patch.lotto_lavorazione = input.lottoLavorazione;
    }
    await supabase
      .from("produzione_fogli_ingresso_mp")
      .update(patch)
      .eq("id", row.id);
    return {
      success: true,
      foglioId: row.id,
      foglioCodice: row.codice,
      created: false,
    };
  }

  let fornitoreId: string | null = null;
  const targa = input.targaFornitore.trim().toUpperCase();
  if (targa && targa !== "INV") {
    const naked = targa.replace(/^F/, "");
    const candidates = [...new Set([targa, `F${naked}`])];
    const { data: fornRows } = await supabase
      .from("fornitori")
      .select("id")
      .is("deleted_at", null)
      .in("codice_targa", candidates)
      .limit(1);
    fornitoreId =
      ((fornRows ?? []) as Array<{ id: string }>)[0]?.id ?? null;
  }

  const now = new Date();
  const codice = `FIMP-${prefixLottoDaData(now)}-${formatHex5Local(
    Math.floor(Math.random() * 0xfffff) + 1
  )}`;
  const note = [
    "Generato per carico/settaggio merce magazzino (non da ingresso produttore).",
    `Lotto lavorazione: ${input.lottoLavorazione}`,
    `Prodotto: ${input.prodottoCodice} — ${input.prodottoNome}`,
    `Quantità: ${input.quantitaKg} ${input.unita}`,
    `Motivo: ${input.motivoLabel}`,
    input.note.trim() ? `Note carico: ${input.note.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .insert({
      codice,
      lotto_codice: input.lottoMp,
      versione: 1,
      documento_stato: "chiuso",
      origine: "inventario_magazzino",
      movimento_magazzino_id: input.movimentoId ?? null,
      prodotto_proprio_id: input.prodottoId,
      lotto_lavorazione: input.lottoLavorazione,
      fornitore_id: fornitoreId,
      materia_prima_id: null,
      is_bio: false,
      quantita: input.quantitaKg,
      quantita_unita: input.unita || "kg",
      quantita_tipo: "reale",
      ddt_produttore: "INVENTARIO / SETTAGGIO MAGAZZINO",
      arrivato_at: now.toISOString(),
      scarico_mezzo: "inventario",
      note,
      confirmed_at: now.toISOString(),
      confirmed_by: input.userId,
      closed_at: now.toISOString(),
      closed_by: input.userId,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id, codice")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("produzione_fogli_ingresso_mp")
        .select("id, codice")
        .eq("lotto_codice", input.lottoMp)
        .is("deleted_at", null)
        .maybeSingle();
      if (again) {
        const row = again as { id: string; codice: string };
        return {
          success: true,
          foglioId: row.id,
          foglioCodice: row.codice,
          created: false,
        };
      }
    }
    return {
      success: false,
      error: error?.message ?? "Creazione foglio MP inventario fallita.",
    };
  }
  const created = data as { id: string; codice: string };
  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: created.id,
    action: "create",
    actor_id: input.userId,
    summary: `Foglio Codice MP Lavorata ${input.lottoMp} da carico/settaggio magazzino`,
    payload: {
      origine: "inventario_magazzino",
      lotto_mp: input.lottoMp,
      lotto_lavorazione: input.lottoLavorazione,
      movimento_id: input.movimentoId,
      prodotto_id: input.prodottoId,
      quantita_kg: input.quantitaKg,
    },
  });
  return {
    success: true,
    foglioId: created.id,
    foglioCodice: created.codice,
    created: true,
  };
}

async function ensureUnitaIngressoMp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string,
  userId: string,
  letteraEsistente?: string | null
): Promise<
  | { success: true; lettera: string; created: number }
  | { success: false; error: string }
> {
  const { data: already } = await supabase
    .from("produzione_fogli_ingresso_unita")
    .select("id")
    .eq("foglio_id", foglioId)
    .is("deleted_at", null)
    .limit(1);
  if ((already ?? []).length > 0) {
    return {
      success: true,
      lettera: String(letteraEsistente ?? "").trim() || "A",
      created: 0,
    };
  }

  const { data: confs, error: confErr } = await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .select("id, confezionamento_id, quantita_confezioni, sort_order")
    .eq("foglio_id", foglioId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (confErr) return { success: false, error: confErr.message };

  const righe = (confs ?? []) as Array<{
    id: string;
    confezionamento_id: string;
    quantita_confezioni: number;
  }>;
  const totale = righe.reduce(
    (acc, r) => acc + Math.max(0, Number(r.quantita_confezioni) || 0),
    0
  );
  if (totale < 1) {
    return {
      success: true,
      lettera: String(letteraEsistente ?? "").trim() || "",
      created: 0,
    };
  }

  let lettera = String(letteraEsistente ?? "").trim().toUpperCase();
  if (!/^[A-Z]$/.test(lettera)) {
    const { data: nextL, error: letErr } = await supabase.rpc(
      "next_ingresso_mp_lettera"
    );
    if (letErr || !nextL) {
      return {
        success: false,
        error: letErr?.message ?? "Lettera di gruppo non assegnata.",
      };
    }
    lettera = String(nextL).trim().toUpperCase();
    const { error: upLet } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .update({
        gruppo_lettera: lettera,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", foglioId);
    if (upLet) return { success: false, error: upLet.message };
  }

  const { data: firstN, error: seqErr } = await supabase.rpc(
    "alloc_ingresso_mp_unita_hex_seq",
    { p_count: totale }
  );
  if (seqErr || firstN == null) {
    return {
      success: false,
      error: seqErr?.message ?? "Progressivo contenitori non assegnato.",
    };
  }
  let nextN = Number(firstN);

  const catIds = [...new Set(righe.map((r) => r.confezionamento_id))];
  const { data: cats } = await supabase
    .from("produzione_confezionamenti_mp")
    .select("id, nome")
    .in("id", catIds);
  const nomeBy = new Map(
    ((cats ?? []) as Array<{ id: string; nome: string }>).map((c) => [
      c.id,
      c.nome,
    ])
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const r of righe) {
    const q = Math.max(0, Number(r.quantita_confezioni) || 0);
    const tipo = nomeBy.get(r.confezionamento_id)?.trim() || "Contenitore";
    for (let i = 1; i <= q; i += 1) {
      const token = crypto.randomUUID();
      rows.push({
        foglio_id: foglioId,
        confezione_id: r.id,
        confezionamento_id: r.confezionamento_id,
        tipo_nome: tipo,
        gruppo_lettera: lettera,
        indice_tipo: i,
        totale_tipo: q,
        codice_unita: composeCodiceUnita(nextN),
        scan_token: token,
        documento_stato: "emesso",
        versione: 1,
        created_by: userId,
        updated_by: userId,
      });
      nextN += 1;
    }
  }

  const { error: insErr } = await supabase
    .from("produzione_fogli_ingresso_unita")
    .insert(rows);
  if (insErr) return { success: false, error: insErr.message };

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: foglioId,
    action: "unita_generate",
    actor_id: userId,
    summary: `Emessi ${rows.length} fogli contenitore gruppo ${lettera}`,
    payload: {
      gruppo_lettera: lettera,
      quantita_unita: rows.length,
      primo_codice: rows[0]?.codice_unita,
      ultimo_codice: rows[rows.length - 1]?.codice_unita,
    },
  });

  return { success: true, lettera, created: rows.length };
}

export async function generaLottoIngressoMpAction(
  foglioId: string
): Promise<
  | { success: true; lottoCodice: string; item: FoglioIngressoMp }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .eq("id", foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Foglio non trovato." };
  }
  const foglio = row as FoglioRow;
  if (foglio.documento_stato === "chiuso") {
    return { success: false, error: "Foglio chiuso." };
  }
  if (foglio.lotto_codice) {
    const units = await ensureUnitaIngressoMp(
      supabase,
      foglioId,
      auth.userId,
      foglio.gruppo_lettera
    );
    if (!units.success) return units;
    const cur = await getFoglioIngressoMpAction(foglioId);
    if (!cur.success) return cur;
    return { success: true, lottoCodice: foglio.lotto_codice, item: cur.item };
  }

  const arrivato = new Date(foglio.arrivato_at);
  const prefix = prefixLottoDaData(arrivato);
  const { data: esistenti } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice")
    .is("deleted_at", null)
    .like("lotto_codice", `${prefix}%`);
  const seq = nextSeqFromLotti(
    ((esistenti ?? []) as Array<{ lotto_codice: string | null }>).map(
      (r) => r.lotto_codice ?? ""
    ),
    prefix
  );
  const lotto = composeLottoIngressoMp(prefix, seq);
  if (!isValidLottoIngressoMp(lotto)) {
    return { success: false, error: "Formato lotto non valido." };
  }

  const { error: upErr } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      lotto_codice: lotto,
      documento_stato: "registrato",
      versione: Number(foglio.versione ?? 1) + 1,
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.userId,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", foglioId);
  if (upErr) return { success: false, error: upErr.message };

  await aggiornaMedieConfezioni(supabase, foglioId, Number(foglio.quantita));

  const units = await ensureUnitaIngressoMp(
    supabase,
    foglioId,
    auth.userId,
    foglio.gruppo_lettera
  );
  if (!units.success) return units;

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: foglioId,
    action: "lotto_generate",
    actor_id: auth.userId,
    summary: `Generato lotto MP ${lotto}${
      units.lettera ? ` · gruppo ${units.lettera}` : ""
    }`,
    payload: {
      lotto_codice: lotto,
      prefix,
      gruppo_lettera: units.lettera || null,
      unita: units.created,
    },
  });

  const cur = await getFoglioIngressoMpAction(foglioId);
  if (!cur.success) return cur;
  return { success: true, lottoCodice: lotto, item: cur.item };
}

async function aggiornaMedieConfezioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string,
  quantitaTotale: number
) {
  const { data: righe } = await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .select("confezionamento_id, quantita_confezioni, peso_kg")
    .eq("foglio_id", foglioId)
    .is("deleted_at", null);
  const list = (righe ?? []) as Array<{
    confezionamento_id: string;
    quantita_confezioni: number;
    peso_kg: number | null;
  }>;
  if (list.length === 0) return;
  for (const r of list) {
    const n = r.quantita_confezioni;
    const pesoRiga =
      r.peso_kg != null && Number(r.peso_kg) > 0
        ? Number(r.peso_kg)
        : list.length === 1
          ? quantitaTotale
          : null;
    if (pesoRiga == null || n <= 0) continue;
    const pesoPezzo = pesoRiga / n;
    const { data: cat } = await supabase
      .from("produzione_confezionamenti_mp")
      .select("media_peso_kg, conteggio_pesate")
      .eq("id", r.confezionamento_id)
      .maybeSingle();
    const prev = cat as {
      media_peso_kg: number | null;
      conteggio_pesate: number;
    } | null;
    const c = prev?.conteggio_pesate ?? 0;
    const media = prev?.media_peso_kg != null ? Number(prev.media_peso_kg) : 0;
    const nextCount = c + n;
    const nextMedia =
      nextCount <= 0 ? pesoPezzo : (media * c + pesoPezzo * n) / nextCount;
    await supabase
      .from("produzione_confezionamenti_mp")
      .update({
        media_peso_kg: Math.round(nextMedia * 1000) / 1000,
        conteggio_pesate: nextCount,
      })
      .eq("id", r.confezionamento_id);
  }
}

export async function chiudiFoglioIngressoMpAction(
  foglioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice, documento_stato, versione")
    .eq("id", foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { success: false, error: "Foglio non trovato." };
  if (!(data as { lotto_codice: string | null }).lotto_codice) {
    return { success: false, error: "Genera prima il codice lotto." };
  }
  const { error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      documento_stato: "chiuso",
      versione: Number((data as { versione?: number }).versione ?? 1) + 1,
      closed_at: new Date().toISOString(),
      closed_by: auth.userId,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", foglioId);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: foglioId,
    action: "close",
    actor_id: auth.userId,
    summary: `Chiuso foglio ingresso MP`,
    payload: { lotto_codice: (data as { lotto_codice: string }).lotto_codice },
  });
  return { success: true };
}

export async function uploadIngressoMpFileAction(
  formData: FormData
): Promise<
  | { success: true; path: string; fileName: string; url: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "ddt");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un file o scatta una foto." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { success: false, error: "File troppo grande (max 8 MB)." };
  }
  const mime = file.type || "application/octet-stream";
  const ok =
    mime.startsWith("image/") || mime === "application/pdf";
  if (!ok) return { success: false, error: "Consentiti immagini o PDF." };
  const ext = mime === "application/pdf" ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const folder = kind.startsWith("mezzo")
    ? "mezzi"
    : kind.startsWith("carico")
      ? "carico"
      : "ddt";
  const path = `${folder}/${ownerId || auth.userId}/${Date.now()}-${kind}.${ext}`;
  const supabase = await createClient();
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) return { success: false, error: error.message };
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  return {
    success: true,
    path,
    fileName: file.name || path,
    url: signed?.signedUrl ?? "",
  };
}

export async function attachDdtFoglioAction(input: {
  foglioId: string;
  path: string;
  fileName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      ddt_file_path: input.path,
      ddt_file_name: input.fileName,
      updated_by: auth.userId,
    })
    .eq("id", input.foglioId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function attachCaricoFotoFoglioAction(input: {
  foglioId: string;
  lato: "destro" | "sinistro";
  path: string;
  fileName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  if (input.lato !== "destro" && input.lato !== "sinistro") {
    return { success: false, error: "Lato foto carico non valido." };
  }
  const supabase = await createClient();
  const patch =
    input.lato === "destro"
      ? {
          carico_lato_destro_path: input.path,
          carico_lato_destro_name: input.fileName,
        }
      : {
          carico_lato_sinistro_path: input.path,
          carico_lato_sinistro_name: input.fileName,
        };
  const { error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      ...patch,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.foglioId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: input.foglioId,
    action: "update",
    actor_id: auth.userId,
    summary: `Foto carico lato ${input.lato} sul foglio ingresso MP`,
    payload: { lato: input.lato, path: input.path },
  });
  return { success: true };
}

export async function attachMezzoFotoAction(input: {
  mezzoId: string;
  kind: MezzoFotoKind;
  path: string;
  fileName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  if (!MEZZO_FOTO_KINDS.includes(input.kind)) {
    return { success: false, error: "Tipo foto non valido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("produzione_mezzi_foto").insert({
    mezzo_id: input.mezzoId,
    kind: input.kind,
    storage_path: input.path,
    file_name: input.fileName,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signedIngressoMpUrlAction(
  path: string
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? "URL non disponibile." };
  }
  return { success: true, url: data.signedUrl };
}

const provaFoglioSchema = z.object({
  foglio: foglioIngressoSaveSchema,
  generaLotto: z.boolean().optional().default(false),
  chiudi: z.boolean().optional().default(false),
  fornitoreLocale: z
    .object({
      isBio: z.boolean(),
      label: z.string().trim().max(240).optional().default(""),
    })
    .optional(),
});

/**
 * Dry-run della sola pagina Foglio Ingresso MP: stessi controlli del reale,
 * nessuna scrittura su DB, storage o audit.
 */
export async function peekIngressoMpLetteraAction(): Promise<
  | { success: true; lettera: string; prossimoNumero: number }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const [{ data, error }, { data: nextHex }] = await Promise.all([
    supabase.rpc("peek_ingresso_mp_lettera"),
    supabase.rpc("peek_ingresso_mp_unita_hex"),
  ]);
  const letteraRaw = error ? "A" : String(data ?? "A").trim().toUpperCase();
  const lettera = /^[A-Z]$/.test(letteraRaw) ? letteraRaw : "A";
  const prossimoNumero =
    typeof nextHex === "number" && nextHex > 0 ? nextHex : Number(nextHex) || 1;
  return {
    success: true,
    lettera,
    prossimoNumero: prossimoNumero > 0 ? prossimoNumero : 1,
  };
}

export async function provaFoglioIngressoMpAction(raw: unknown): Promise<
  | {
      success: true;
      skippedPersist: true;
      lottoCodice: string | null;
      codiceFoglio: string;
      lettera: string | null;
      unita: IngressoMpUnita[];
      messaggio: string;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = provaFoglioSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati foglio non validi.",
    };
  }
  const { foglio: v, generaLotto, chiudi, fornitoreLocale } = parsed.data;
  const supabase = await createClient();

  const { data: forn } = await supabase
    .from("fornitori")
    .select("id, bio_certificato_path, codice_targa, ragione_sociale")
    .eq("id", v.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn && !fornitoreLocale) {
    return { success: false, error: "Fornitore non trovato." };
  }
  const fornBio = forn
    ? Boolean(
        (forn as { bio_certificato_path?: string }).bio_certificato_path?.trim()
      )
    : Boolean(fornitoreLocale?.isBio);
  if (v.isBio && !fornBio) {
    return {
      success: false,
      error:
        "Il materiale bio è consentito solo se il fornitore ha il certificato caricato.",
    };
  }

  const { data: mp } = await supabase
    .from("materie_prime")
    .select("id")
    .eq("id", v.materiaPrimaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mp) return { success: false, error: "Tipo materiale non trovato." };

  let codiceFoglio = `FIMP-${prefixLottoDaData(new Date(v.arrivatoAt))}-ANTEPRIMA`;
  let lottoEsistente: string | null = null;
  let stato: IngressoMpStato = "bozza";
  if (v.id) {
    const { data: existing } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("codice, lotto_codice, documento_stato")
      .eq("id", v.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return { success: false, error: "Foglio non trovato." };
    const row = existing as {
      codice: string;
      lotto_codice: string | null;
      documento_stato: IngressoMpStato;
    };
    if (row.documento_stato === "chiuso") {
      return { success: false, error: "Il foglio chiuso non è modificabile." };
    }
    codiceFoglio = row.codice;
    lottoEsistente = row.lotto_codice;
    stato = row.documento_stato;
  }

  let lottoCodice = lottoEsistente;
  if (generaLotto && !lottoCodice) {
    const arrivato = new Date(v.arrivatoAt);
    const prefix = prefixLottoDaData(arrivato);
    const { data: esistenti } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("lotto_codice")
      .is("deleted_at", null)
      .like("lotto_codice", `${prefix}%`);
    const seq = nextSeqFromLotti(
      ((esistenti ?? []) as Array<{ lotto_codice: string | null }>).map(
        (r) => r.lotto_codice ?? ""
      ),
      prefix
    );
    const lotto = composeLottoIngressoMp(prefix, seq);
    if (!isValidLottoIngressoMp(lotto)) {
      return { success: false, error: "Formato lotto non valido." };
    }
    lottoCodice = lotto;
  }

  if (chiudi && !lottoCodice) {
    return { success: false, error: "Genera prima il codice lotto." };
  }

  let letteraPeek = "";
  let primoHex = 1;
  if (lottoCodice || generaLotto) {
    const [{ data: peek }, { data: nextHex }] = await Promise.all([
      supabase.rpc("peek_ingresso_mp_lettera"),
      supabase.rpc("peek_ingresso_mp_unita_hex"),
    ]);
    letteraPeek = String(peek ?? "").trim().toUpperCase();
    if (!/^[A-Z]$/.test(letteraPeek)) letteraPeek = "A";
    const n = typeof nextHex === "number" ? nextHex : Number(nextHex);
    if (Number.isFinite(n) && n > 0) primoHex = n;
  }

  const catIds = [...new Set(v.confezioni.map((r) => r.confezionamentoId))];
  const { data: cats } = catIds.length
    ? await supabase
        .from("produzione_confezionamenti_mp")
        .select("id, nome")
        .in("id", catIds)
    : { data: [] };
  const nomeBy = new Map(
    ((cats ?? []) as Array<{ id: string; nome: string }>).map((c) => [
      c.id,
      c.nome,
    ])
  );
  const unita = buildAnteprimaUnita({
    lettera: letteraPeek || "A",
    primoNumero: primoHex,
    righe: v.confezioni.map((r) => ({
      confezionamentoId: r.confezionamentoId,
      tipoNome: nomeBy.get(r.confezionamentoId)?.trim() || "Contenitore",
      quantitaConfezioni: r.quantitaConfezioni,
    })),
  });
  const totCont = unita.length;

  const messaggio = chiudi
    ? `Controlli ok. Il foglio ${codiceFoglio} sarebbe stato chiuso.`
    : generaLotto
      ? `Controlli ok. Sarebbe stato assegnato il lotto ${lottoCodice} (stato Registrato)${
          letteraPeek
            ? `, gruppo ${letteraPeek}, ${totCont} fogli contenitore (id unici non assegnati in test)`
            : ""
        }.`
      : stato === "registrato"
        ? `Controlli ok. Il foglio ${codiceFoglio} sarebbe stato aggiornato.`
        : `Controlli ok. Sarebbe stata salvata la bozza ${codiceFoglio}.`;

  return {
    success: true,
    skippedPersist: true,
    lottoCodice,
    codiceFoglio,
    lettera: letteraPeek || null,
    unita,
    messaggio,
  };
}

export async function anteprimaFornitoreRapidoIngressoAction(
  raw: unknown
): Promise<
  | {
      success: true;
      id: string;
      label: string;
      targa: string;
      isBio: false;
      tipologie: FornitoreTipologia[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoFornitoreRapidoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati fornitore non validi.",
    };
  }
  const supabase = await createClient();
  const piva = parsed.data.partitaIva.trim();
  const { data: dup } = await supabase
    .from("fornitori")
    .select("id")
    .is("deleted_at", null)
    .ilike("partita_iva", piva)
    .maybeSingle();
  if (dup) {
    return { success: false, error: "Partita IVA già presente in anagrafica." };
  }
  const { data: usedRows } = await supabase.from("fornitori").select("codice_targa");
  const used = ((usedRows ?? []) as Array<{ codice_targa: string }>).map(
    (r) => r.codice_targa
  );
  let targa: string;
  try {
    targa = nextSequentialCodiceTarga("F", used);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Targa fornitore non disponibile.",
    };
  }
  return {
    success: true,
    id: crypto.randomUUID(),
    targa,
    label: `${targa} — ${parsed.data.ragioneSociale.trim()}`,
    isBio: false,
    tipologie: parsed.data.tipologie ?? ["materia_prima"],
  };
}

export async function anteprimaMezzoIngressoAction(raw: unknown): Promise<
  { success: true; item: MezzoIngresso } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoMezzoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mezzo non validi.",
    };
  }
  const targa = parsed.data.targa.trim().toUpperCase();
  const supabase = await createClient();
  const { data: dup } = await supabase
    .from("produzione_mezzi")
    .select("id")
    .is("deleted_at", null)
    .ilike("targa", targa)
    .maybeSingle();
  if (dup) return { success: false, error: "Targa mezzo già registrata." };
  return {
    success: true,
    item: {
      id: crypto.randomUUID(),
      targa,
      fornitoreId: parsed.data.fornitoreId ?? null,
      aziendaNome: parsed.data.aziendaNome?.trim() ?? "",
      foto: [],
    },
  };
}

export async function anteprimaAutistaIngressoAction(raw: unknown): Promise<
  | { success: true; id: string; label: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoAutistaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati autista non validi.",
    };
  }
  return {
    success: true,
    id: crypto.randomUUID(),
    label: `${parsed.data.nome} ${parsed.data.cognome}`.trim(),
  };
}

export type UnitaIngressoLookup = {
  id: string;
  codiceUnita: string;
  tipoNome: string;
  gruppoLettera: string;
  lottoCodice: string | null;
  usatoAt: string | null;
};

async function findUnitaIngressoByScan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: string
): Promise<
  | {
      id: string;
      codice_unita: string;
      tipo_nome: string;
      gruppo_lettera: string;
      usato_at: string | null;
      foglio_id: string;
    }
  | null
> {
  const parsed = parseUnitaScanInput(raw);
  if (!parsed.token && !parsed.codice) return null;
  let q = supabase
    .from("produzione_fogli_ingresso_unita")
    .select("id, codice_unita, tipo_nome, gruppo_lettera, usato_at, foglio_id")
    .is("deleted_at", null);
  q = parsed.token
    ? q.eq("scan_token", parsed.token)
    : q.eq("codice_unita", parsed.codice);
  const { data } = await q.maybeSingle();
  return data
    ? (data as {
        id: string;
        codice_unita: string;
        tipo_nome: string;
        gruppo_lettera: string;
        usato_at: string | null;
        foglio_id: string;
      })
    : null;
}

export async function lookupUnitaIngressoMpAction(
  barcodeRaw: string
): Promise<
  | { success: true; found: true; item: UnitaIngressoLookup }
  | { success: true; found: false }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["produzione", "magazzino"]);
  const supabase = await createClient();
  const row = await findUnitaIngressoByScan(supabase, barcodeRaw);
  if (!row) return { success: true, found: false };
  const { data: foglio } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice")
    .eq("id", row.foglio_id)
    .maybeSingle();
  return {
    success: true,
    found: true,
    item: {
      id: row.id,
      codiceUnita: row.codice_unita,
      tipoNome: row.tipo_nome,
      gruppoLettera: row.gruppo_lettera,
      lottoCodice:
        (foglio as { lotto_codice?: string | null } | null)?.lotto_codice ??
        null,
      usatoAt: row.usato_at,
    },
  };
}

export async function registraUsoUnitaIngressoMpAction(input: {
  barcode: string;
  modo: "carico" | "scarico";
}): Promise<
  | { success: true; item: UnitaIngressoLookup; alreadyUsed: false }
  | { success: false; error: string; alreadyUsed?: true }
> {
  const { auth } = await requireAnyAreaAccess(["produzione", "magazzino"]);
  const supabase = await createClient();
  const row = await findUnitaIngressoByScan(supabase, input.barcode);
  if (!row) {
    return { success: false, error: "Contenitore ingresso non riconosciuto." };
  }
  if (row.usato_at) {
    return {
      success: false,
      alreadyUsed: true,
      error: `Il contenitore ${row.codice_unita} è già stato registrato e non può essere usato di nuovo.`,
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("produzione_fogli_ingresso_unita")
    .update({
      usato_at: now,
      usato_by: auth.userId,
      usato_modo: input.modo,
      documento_stato: "usato",
      versione: 2,
      updated_by: auth.userId,
      updated_at: now,
    })
    .eq("id", row.id)
    .is("usato_at", null)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from("produzione_fogli_ingresso_unita")
    .select("usato_at")
    .eq("id", row.id)
    .maybeSingle();
  if (!(check as { usato_at?: string | null } | null)?.usato_at) {
    return {
      success: false,
      alreadyUsed: true,
      error: `Il contenitore ${row.codice_unita} è già stato registrato e non può essere usato di nuovo.`,
    };
  }

  const { data: foglio } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice")
    .eq("id", row.foglio_id)
    .maybeSingle();

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_unita",
    entity_id: row.id,
    action: "unita_uso",
    actor_id: auth.userId,
    summary: `Registrato contenitore ${row.codice_unita} (${input.modo})`,
    payload: {
      codice_unita: row.codice_unita,
      modo: input.modo,
      foglio_id: row.foglio_id,
    },
  });

  return {
    success: true,
    alreadyUsed: false,
    item: {
      id: row.id,
      codiceUnita: row.codice_unita,
      tipoNome: row.tipo_nome,
      gruppoLettera: row.gruppo_lettera,
      lottoCodice:
        (foglio as { lotto_codice?: string | null } | null)?.lotto_codice ??
        null,
      usatoAt: now,
    },
  };
}
