"use server";

import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generaCodiceRandom,
  occupaPostoSchema,
  pesoOccupazioneKg,
  rettificaOccupazionePostoSchema,
  riepilogoOccupazionePosto,
  targaProdottoOccupazione,
  type DettaglioElencoPosto,
  type ImballaggioPostoOpt,
  type LottoDaSistemare,
  type OccupaPostoInput,
  type RettificaOccupazionePostoInput,
  type PostoElementoTipo,
  type PostoOccupazione,
  type PostoPesoModo,
  type ProdottoLottoElenco,
  type RiepilogoElencoPosto,
} from "@/lib/magazzino/posto-occupazione";

const CATALOG_PROPRIO = "prodotto_proprio";

async function codiceLibero(
  supabase: ReturnType<typeof createServiceClient>,
  tabella: "magazzino_posto_occupazioni" | "magazzino_posto_elementi",
  colonna: "codice_pallet" | "numero",
  lunghezza: number
): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const code = generaCodiceRandom(lunghezza);
    const { data } = await supabase
      .from(tabella)
      .select("id")
      .is("deleted_at", null)
      .ilike(colonna, code)
      .maybeSingle();
    if (!data) return code;
  }
  return `${generaCodiceRandom(lunghezza)}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

async function syncStatoUbicazione(
  supabase: ReturnType<typeof createServiceClient>,
  ubicazioneId: string,
  stato: "libero" | "occupato",
  userId: string
) {
  await supabase
    .from("magazzino_ubicazioni")
    .update({
      occupazione_stato: stato,
      occupazione_at: new Date().toISOString(),
      occupazione_by: userId,
      updated_by: userId,
    })
    .eq("id", ubicazioneId)
    .is("deleted_at", null);
}

function mapOccupazione(
  row: {
    id: string;
    ubicazione_id: string;
    tipo_elemento: string;
    movimentazione_voce_id?: string | null;
    movimentazione_nome?: string | null;
    imballaggio_voce_id: string | null;
    imballaggio_nome: string;
    quantita_elementi: number | null;
    codice_pallet: string;
    peso_modo?: string | null;
    peso_complessivo_kg?: number | string | null;
    peso_motivazione?: string | null;
    prodotto_id?: string | null;
    kg_allocati?: number | string | null;
    lotto_interno_codice: string | null;
    lotto_esterno_id: string | null;
    lotto_esterno_codice: string | null;
    note: string;
  },
  elementi: Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
  }>
): PostoOccupazione {
  const modo: PostoPesoModo =
    row.peso_modo === "complessivo" ? "complessivo" : "per_elemento";
  return {
    id: row.id,
    ubicazioneId: row.ubicazione_id,
    tipoElemento: row.tipo_elemento as PostoElementoTipo,
    movimentazioneVoceId: row.movimentazione_voce_id ?? null,
    movimentazioneNome: row.movimentazione_nome ?? "",
    imballaggioVoceId: row.imballaggio_voce_id,
    imballaggioNome: row.imballaggio_nome,
    quantitaElementi: row.quantita_elementi,
    codicePallet: row.codice_pallet,
    pesoModo: modo,
    pesoComplessivoKg:
      row.peso_complessivo_kg != null ? Number(row.peso_complessivo_kg) : null,
    pesoMotivazione: row.peso_motivazione ?? "",
    prodottoId: row.prodotto_id ?? null,
    kgAllocati: row.kg_allocati != null ? Number(row.kg_allocati) : null,
    lottoInternoCodice: row.lotto_interno_codice,
    lottoEsternoId: row.lotto_esterno_id,
    lottoEsternoCodice: row.lotto_esterno_codice,
    note: row.note,
    elementi: elementi.map((e) => ({
      id: e.id,
      numero: e.numero,
      pesoKg: e.peso_kg != null ? Number(e.peso_kg) : null,
      scanToken: e.scan_token,
    })),
  };
}

const OCC_SELECT =
  "id, ubicazione_id, tipo_elemento, movimentazione_voce_id, movimentazione_nome, imballaggio_voce_id, imballaggio_nome, quantita_elementi, codice_pallet, peso_modo, peso_complessivo_kg, peso_motivazione, prodotto_id, kg_allocati, lotto_interno_codice, lotto_esterno_id, lotto_esterno_codice, note";

async function catalogoImballaggiPosto(
  supabase: ReturnType<typeof createServiceClient>
): Promise<
  | { success: true; rows: ImballaggioPostoOpt[] }
  | { success: false; error: string }
> {
  const { data, error } = await supabase
    .from("imballaggi_voci")
    .select("id, codice, nome, stadio")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data ?? []) as ImballaggioPostoOpt[] };
}

export async function listImballaggiPostoAction(): Promise<
  | {
      success: true;
      movimentazioni: ImballaggioPostoOpt[];
      elementi: ImballaggioPostoOpt[];
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const cat = await catalogoImballaggiPosto(createServiceClient());
  if (!cat.success) return cat;
  return {
    success: true,
    movimentazioni: cat.rows.filter((v) => v.stadio === "movimentazione"),
    elementi: cat.rows.filter(
      (v) => v.stadio === "confezione" || v.stadio === "isolamento"
    ),
  };
}

export async function listMovimentazioniPostoAction(
  ubicazioneId: string
): Promise<
  | {
      success: true;
      ids: string[];
      voci: ImballaggioPostoOpt[];
      ristretto: boolean;
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const supabase = createServiceClient();
  const cat = await catalogoImballaggiPosto(supabase);
  if (!cat.success) return cat;
  const catalogo = cat.rows.filter((v) => v.stadio === "movimentazione");
  if (!ubicazioneId) {
    return { success: true, ids: [], voci: catalogo, ristretto: false };
  }
  const { data, error } = await supabase
    .from("magazzino_ubicazione_movimentazioni")
    .select("imballaggio_voce_id")
    .eq("ubicazione_id", ubicazioneId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const ids = [
    ...new Set(
      ((data ?? []) as { imballaggio_voce_id: string }[]).map(
        (r) => r.imballaggio_voce_id
      )
    ),
  ];
  const allowed = new Set(ids);
  const ristretto = allowed.size > 0;
  return {
    success: true,
    ids,
    voci: ristretto
      ? catalogo.filter((v) => allowed.has(v.id))
      : catalogo,
    ristretto,
  };
}

export async function listMovimentazioniPostiAction(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, string[]> }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, string[]> = {};
  for (const id of ids) perPosto[id] = [];
  if (!ids.length) return { success: true, perPosto };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_ubicazione_movimentazioni")
    .select("ubicazione_id, imballaggio_voce_id")
    .in("ubicazione_id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  for (const r of (data ?? []) as Array<{
    ubicazione_id: string;
    imballaggio_voce_id: string;
  }>) {
    const list = perPosto[r.ubicazione_id] ?? [];
    if (!list.includes(r.imballaggio_voce_id)) {
      list.push(r.imballaggio_voce_id);
    }
    perPosto[r.ubicazione_id] = list;
  }
  return { success: true, perPosto };
}

const TIPI_USCITA = new Set([
  "prelievo",
  "scarico",
  "uscita_produzione",
]);

function kgMovimentoFirmato(tipo: string, quantitaKg: number): number {
  const qty = Number(quantitaKg) || 0;
  return TIPI_USCITA.has(tipo) ? -Math.abs(qty) : qty;
}

async function kgSistematiPerLotti(
  supabase: ReturnType<typeof createServiceClient>,
  chiavi: Array<{ prodottoId: string; lottoInterno: string }>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!chiavi.length) return out;
  const { data } = await supabase
    .from("magazzino_posto_allocazioni")
    .select("prodotto_id, lotto_interno_codice, kg")
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .in(
      "prodotto_id",
      [...new Set(chiavi.map((c) => c.prodottoId))]
    );
  for (const r of (data ?? []) as Array<{
    prodotto_id: string;
    lotto_interno_codice: string;
    kg: number;
  }>) {
    const key = `${r.prodotto_id}|${r.lotto_interno_codice}`;
    out.set(key, Math.round(((out.get(key) ?? 0) + Number(r.kg)) * 1000) / 1000);
  }
  return out;
}

export async function listLottiDaSistemareAction(): Promise<
  | { success: true; lotti: LottoDaSistemare[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const supabase = createServiceClient();
  // Stessa fonte di Elenco e Quantità: magazzino_movimenti per prodotto_proprio
  // con lotto. Service role: dalla pianta (Strumenti) RLS movimenti non
  // include quella area. Nessun embed su prodotti_propri: la FK è stata tolta
  // (catalogo polimorfo) e PostgREST faceva fallire tutta la query.
  const pageSize = 1000;
  const movimenti: Array<{
    prodotto_id: string | null;
    prodotto_codice: string | null;
    quantita_kg: number;
    tipo: string;
    lotto_codice: string | null;
    lotto_esterno_id: string | null;
  }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("magazzino_movimenti")
      .select(
        "prodotto_id, prodotto_codice, quantita_kg, tipo, lotto_codice, lotto_esterno_id"
      )
      .eq("catalog_kind", CATALOG_PROPRIO)
      .is("deleted_at", null)
      .not("lotto_codice", "is", null)
      .range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    const rows = (data ?? []) as typeof movimenti;
    movimenti.push(...rows);
    if (rows.length < pageSize) break;
  }

  type Acc = LottoDaSistemare;
  const by = new Map<string, Acc>();
  const esternoIds = new Set<string>();
  const prodottoIds = new Set<string>();
  for (const r of movimenti) {
    const lotto = String(r.lotto_codice ?? "").trim();
    const prodottoId = String(r.prodotto_id ?? "");
    if (!lotto || !prodottoId) continue;
    const key = `${prodottoId}|${lotto}`;
    const signed = kgMovimentoFirmato(r.tipo, Number(r.quantita_kg) || 0);
    const prev = by.get(key);
    if (!prev) {
      prodottoIds.add(prodottoId);
      if (r.lotto_esterno_id) esternoIds.add(r.lotto_esterno_id);
      by.set(key, {
        prodottoId,
        prodottoCodice: String(r.prodotto_codice ?? "").trim(),
        prodottoNome: "",
        lottoInterno: lotto,
        lottoEsternoId: r.lotto_esterno_id,
        lottoEsternoCodice: null,
        kgCaricati: signed,
        kgSistemati: 0,
        kgDaSistemare: 0,
      });
    } else {
      prev.kgCaricati = Math.round((prev.kgCaricati + signed) * 1000) / 1000;
      if (!prev.lottoEsternoId && r.lotto_esterno_id) {
        prev.lottoEsternoId = r.lotto_esterno_id;
        esternoIds.add(r.lotto_esterno_id);
      }
    }
  }

  if (prodottoIds.size) {
    const { data: prodotti } = await supabase
      .from("prodotti_propri")
      .select("id, codice, nome")
      .in("id", [...prodottoIds]);
    const nomi = new Map(
      ((prodotti ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
        (p) => [p.id, p]
      )
    );
    for (const l of by.values()) {
      const p = nomi.get(l.prodottoId);
      if (!p) continue;
      l.prodottoNome = p.nome ?? "";
      if (!l.prodottoCodice) l.prodottoCodice = p.codice ?? "";
    }
  }

  if (esternoIds.size) {
    const { data: esterni } = await supabase
      .from("lotti_esterni")
      .select("id, codice")
      .in("id", [...esternoIds])
      .is("deleted_at", null);
    const codici = new Map(
      ((esterni ?? []) as Array<{ id: string; codice: string }>).map((e) => [
        e.id,
        e.codice,
      ])
    );
    for (const l of by.values()) {
      if (l.lottoEsternoId) {
        l.lottoEsternoCodice = codici.get(l.lottoEsternoId) ?? null;
      }
    }
  }

  const sistemati = await kgSistematiPerLotti(
    supabase,
    [...by.values()].map((l) => ({
      prodottoId: l.prodottoId,
      lottoInterno: l.lottoInterno,
    }))
  );
  const lotti = [...by.values()]
    .map((l) => {
      const kgSistemati = sistemati.get(`${l.prodottoId}|${l.lottoInterno}`) ?? 0;
      const kgDaSistemare =
        Math.round((l.kgCaricati - kgSistemati) * 1000) / 1000;
      return { ...l, kgSistemati, kgDaSistemare };
    })
    .filter((l) => l.kgDaSistemare > 0.0005)
    .sort((a, b) => {
      const c = a.prodottoCodice.localeCompare(b.prodottoCodice, "it");
      return c !== 0 ? c : a.lottoInterno.localeCompare(b.lottoInterno, "it");
    });
  return { success: true, lotti };
}

export async function getOccupazionePostoAction(
  ubicazioneId: string
): Promise<
  | { success: true; occupazione: PostoOccupazione | null }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  if (!ubicazioneId) return { success: true, occupazione: null };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("magazzino_posto_occupazioni")
    .select(OCC_SELECT)
    .eq("ubicazione_id", ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, occupazione: null };
  const row = data as Parameters<typeof mapOccupazione>[0];
  const { data: els } = await supabase
    .from("magazzino_posto_elementi")
    .select("id, numero, peso_kg, scan_token, sort_order")
    .eq("occupazione_id", row.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return {
    success: true,
    occupazione: mapOccupazione(
      row,
      (els ?? []) as Parameters<typeof mapOccupazione>[1]
    ),
  };
}

export async function dettaglioElencoPostoAction(
  ubicazioneId: string
): Promise<
  | { success: true; dettaglio: DettaglioElencoPosto }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  if (!ubicazioneId) {
    return { success: true, dettaglio: { occupazione: null, prodotto: null } };
  }
  const occRes = await getOccupazionePostoAction(ubicazioneId);
  if (!occRes.success) return occRes;
  const occ = occRes.occupazione;
  if (!occ) {
    return { success: true, dettaglio: { occupazione: null, prodotto: null } };
  }
  const db = createServiceClient();
  let prodotto: ProdottoLottoElenco | null = null;
  if (occ.prodottoId) {
    const { data } = await db
      .from("prodotti_propri")
      .select("id, codice, nome")
      .eq("id", occ.prodottoId)
      .maybeSingle();
    if (data) {
      const p = data as { id: string; codice: string; nome: string };
      prodotto = { id: p.id, codice: p.codice, nome: p.nome };
    }
  }
  if (!prodotto && occ.lottoInternoCodice) {
    const { data: mov } = await db
      .from("magazzino_movimenti")
      .select("prodotto_id, prodotto_codice")
      .eq("catalog_kind", CATALOG_PROPRIO)
      .eq("lotto_codice", occ.lottoInternoCodice)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const mid = (mov as { prodotto_id?: string } | null)?.prodotto_id;
    const codiceMov = String(
      (mov as { prodotto_codice?: string } | null)?.prodotto_codice ?? ""
    ).trim();
    if (mid) {
      const { data } = await db
        .from("prodotti_propri")
        .select("id, codice, nome")
        .eq("id", mid)
        .maybeSingle();
      if (data) {
        const p = data as { id: string; codice: string; nome: string };
        prodotto = { id: p.id, codice: p.codice || codiceMov, nome: p.nome };
      } else if (codiceMov) {
        prodotto = { id: mid, codice: codiceMov, nome: "" };
      }
    }
  }
  return { success: true, dettaglio: { occupazione: occ, prodotto } };
}

export async function listRiepilogoElencoPostiAction(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, RiepilogoElencoPosto> }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["magazzino", "strumenti", "amministrazione"]);
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, RiepilogoElencoPosto> = {};
  if (!ids.length) return { success: true, perPosto };

  const db = createServiceClient();
  const { data, error } = await db
    .from("magazzino_posto_occupazioni")
    .select(OCC_SELECT)
    .in("ubicazione_id", ids)
    .eq("stato", "attivo")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as Parameters<typeof mapOccupazione>[0][];
  if (!rows.length) return { success: true, perPosto };

  const occIds = rows.map((r) => r.id);
  const prodottoIds = [
    ...new Set(rows.map((r) => r.prodotto_id).filter(Boolean)),
  ] as string[];

  const [{ data: els }, { data: prods }] = await Promise.all([
    db
      .from("magazzino_posto_elementi")
      .select("id, numero, peso_kg, scan_token, occupazione_id")
      .in("occupazione_id", occIds)
      .is("deleted_at", null),
    prodottoIds.length
      ? db.from("prodotti_propri").select("id, codice").in("id", prodottoIds)
      : Promise.resolve({ data: [] as Array<{ id: string; codice: string }> }),
  ]);

  const elsByOcc = new Map<string, Parameters<typeof mapOccupazione>[1]>();
  for (const e of (els ?? []) as Array<
    Parameters<typeof mapOccupazione>[1][number] & { occupazione_id: string }
  >) {
    const list = elsByOcc.get(e.occupazione_id) ?? [];
    list.push(e);
    elsByOcc.set(e.occupazione_id, list);
  }
  const codiceByProd = new Map(
    ((prods ?? []) as Array<{ id: string; codice: string }>).map((p) => [
      p.id,
      p.codice,
    ])
  );

  for (const row of rows) {
    const occ = mapOccupazione(row, elsByOcc.get(row.id) ?? []);
    const codice = row.prodotto_id
      ? codiceByProd.get(row.prodotto_id) ?? ""
      : "";
    perPosto[row.ubicazione_id] = {
      targa: targaProdottoOccupazione(occ, codice),
      quantitaTotaleKg: pesoOccupazioneKg(occ),
      testo: riepilogoOccupazionePosto(occ),
    };
  }
  return { success: true, perPosto };
}

export async function occupaPostoAction(
  raw: OccupaPostoInput
): Promise<
  | { success: true; occupazione: PostoOccupazione }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "strumenti",
    "amministrazione",
  ]);
  const parsed = occupaPostoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati occupazione non validi.",
    };
  }
  const input = parsed.data;
  const supabase = createServiceClient();

  const { data: ubi } = await supabase
    .from("magazzino_ubicazioni")
    .select("id, codice, peso_max_kg")
    .eq("id", input.ubicazioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ubi) return { success: false, error: "Posto non trovato." };

  const { data: ammesse } = await createServiceClient()
    .from("magazzino_ubicazione_movimentazioni")
    .select("imballaggio_voce_id")
    .eq("ubicazione_id", input.ubicazioneId)
    .is("deleted_at", null);
  const okMov = new Set(
    ((ammesse ?? []) as { imballaggio_voce_id: string }[]).map(
      (r) => r.imballaggio_voce_id
    )
  );
  if (okMov.size && !okMov.has(input.movimentazioneVoceId)) {
    return {
      success: false,
      error: "Questa movimentazione non è ammessa su questo posto.",
    };
  }

  const { data: attiva } = await supabase
    .from("magazzino_posto_occupazioni")
    .select("id")
    .eq("ubicazione_id", input.ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (attiva) return { success: false, error: "Questo posto è già occupato." };

  const { data: voci } = await supabase
    .from("imballaggi_voci")
    .select("id, nome, stadio")
    .in("id", [input.movimentazioneVoceId, input.elementoVoceId])
    .is("deleted_at", null);
  const byId = new Map(
    ((voci ?? []) as { id: string; nome: string; stadio: string }[]).map((v) => [
      v.id,
      v,
    ])
  );
  const mov = byId.get(input.movimentazioneVoceId);
  const el = byId.get(input.elementoVoceId);
  if (!mov || mov.stadio !== "movimentazione") {
    return { success: false, error: "Tipo movimentazione non valido." };
  }
  if (!el || (el.stadio !== "confezione" && el.stadio !== "isolamento")) {
    return {
      success: false,
      error: "Tipo elemento: scegli un cartone o un sacchetto, non una movimentazione.",
    };
  }
  const tipoElemento = el.stadio as PostoElementoTipo;

  const lottiRes = await listLottiDaSistemareAction();
  if (!lottiRes.success) return lottiRes;
  const interno = input.lottoInternoCodice?.trim() || "";
  const esternoId = input.lottoEsternoId?.trim() || "";
  const lotto = lottiRes.lotti.find((l) => {
    if (input.prodottoId && l.prodottoId !== input.prodottoId) return false;
    if (interno && esternoId) {
      return l.lottoInterno === interno && l.lottoEsternoId === esternoId;
    }
    if (interno) return l.lottoInterno === interno;
    return Boolean(esternoId && l.lottoEsternoId === esternoId);
  });
  if (!lotto) {
    return {
      success: false,
      error: "Lotto non disponibile: restano solo lotti con quantità ancora da sistemare.",
    };
  }

  const kg =
    input.pesoModo === "complessivo"
      ? Number(input.pesoComplessivoKg)
      : (input.pesiElementiKg ?? []).reduce((s, n) => s + n, 0);
  const kgRound = Math.round(kg * 1000) / 1000;
  if (!(kgRound > 0)) {
    return { success: false, error: "Il peso da sistemare deve essere maggiore di zero." };
  }
  if (kgRound - lotto.kgDaSistemare > 0.0005) {
    return {
      success: false,
      error: `Su questo lotto restano ${lotto.kgDaSistemare.toLocaleString("it-IT")} kg da sistemare.`,
    };
  }
  const pesoMax = Number((ubi as { peso_max_kg?: number | null }).peso_max_kg);
  if (Number.isFinite(pesoMax) && pesoMax > 0 && kgRound > pesoMax) {
    return {
      success: false,
      error: `Il peso supera il massimo del posto (${pesoMax} kg).`,
    };
  }

  const codicePallet = await codiceLibero(
    supabase,
    "magazzino_posto_occupazioni",
    "codice_pallet",
    6
  );
  const qty = input.quantitaElementi;
  const { data: created, error } = await supabase
    .from("magazzino_posto_occupazioni")
    .insert({
      ubicazione_id: input.ubicazioneId,
      tipo_elemento: tipoElemento,
      movimentazione_voce_id: mov.id,
      movimentazione_nome: mov.nome,
      imballaggio_voce_id: el.id,
      imballaggio_nome: el.nome,
      quantita_elementi: qty,
      codice_pallet: codicePallet,
      peso_modo: input.pesoModo,
      peso_complessivo_kg:
        input.pesoModo === "complessivo" ? kgRound : null,
      peso_motivazione:
        input.pesoModo === "complessivo"
          ? (input.pesoMotivazione ?? "").trim()
          : "",
      prodotto_id: lotto.prodottoId,
      kg_allocati: kgRound,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      stato: "attivo",
      documento_stato: "bozza",
      note: input.note?.trim() || "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { success: false, error: error?.message ?? "Occupazione non salvata." };
  }
  const occId = (created as { id: string }).id;

  const elementi: Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
  }> = [];
  if (input.pesoModo === "per_elemento") {
    const pesi = input.pesiElementiKg ?? [];
    for (let i = 0; i < qty; i += 1) {
      const numero = await codiceLibero(
        supabase,
        "magazzino_posto_elementi",
        "numero",
        5
      );
      const { data: elRow, error: elErr } = await supabase
        .from("magazzino_posto_elementi")
        .insert({
          occupazione_id: occId,
          numero,
          peso_kg: pesi[i] ?? null,
          scan_token: randomUUID(),
          sort_order: i,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id, numero, peso_kg, scan_token")
        .single();
      if (elErr || !elRow) {
        return {
          success: false,
          error: elErr?.message ?? "Creazione elemento fallita.",
        };
      }
      elementi.push(elRow as (typeof elementi)[number]);
    }
  }

  const { error: allErr } = await supabase
    .from("magazzino_posto_allocazioni")
    .insert({
      occupazione_id: occId,
      ubicazione_id: input.ubicazioneId,
      prodotto_id: lotto.prodottoId,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      kg: kgRound,
      stato: "attivo",
      documento_stato: "bozza",
      created_by: auth.userId,
      updated_by: auth.userId,
    });
  if (allErr) return { success: false, error: allErr.message };

  await syncStatoUbicazione(supabase, input.ubicazioneId, "occupato", auth.userId);
  const occupazione = mapOccupazione(
    {
      id: occId,
      ubicazione_id: input.ubicazioneId,
      tipo_elemento: tipoElemento,
      movimentazione_voce_id: mov.id,
      movimentazione_nome: mov.nome,
      imballaggio_voce_id: el.id,
      imballaggio_nome: el.nome,
      quantita_elementi: qty,
      codice_pallet: codicePallet,
      peso_modo: input.pesoModo,
      peso_complessivo_kg:
        input.pesoModo === "complessivo" ? kgRound : null,
      peso_motivazione:
        input.pesoModo === "complessivo"
          ? (input.pesoMotivazione ?? "").trim()
          : "",
      prodotto_id: lotto.prodottoId,
      kg_allocati: kgRound,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      note: input.note?.trim() || "",
    },
    elementi
  );
  await writeAuditLog({
    entity_type: "magazzino_posto_occupazioni",
    entity_id: occId,
    action: "create",
    actor_id: auth.userId,
    summary: `Occupato posto ${(ubi as { codice?: string }).codice ?? ""} · ${mov.nome} · lotto ${lotto.lottoInterno}`,
    payload: {
      ubicazione_id: input.ubicazioneId,
      movimentazione: mov.nome,
      tipo_elemento: tipoElemento,
      elemento: el.nome,
      quantita: qty,
      peso_modo: input.pesoModo,
      kg: kgRound,
      codice_pallet: codicePallet,
      lotto_interno: lotto.lottoInterno,
      lotto_esterno: lotto.lottoEsternoCodice,
      prodotto_id: lotto.prodottoId,
    },
  });
  return { success: true, occupazione };
}

export async function liberaPostoAction(
  ubicazioneId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "strumenti",
    "amministrazione",
  ]);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("magazzino_posto_occupazioni")
    .select("id, codice_pallet")
    .eq("ubicazione_id", ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; codice_pallet: string } | null;
  if (!row) return { success: false, error: "Nessuna occupazione attiva." };
  const now = new Date().toISOString();
  await supabase
    .from("magazzino_posto_elementi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("occupazione_id", row.id)
    .is("deleted_at", null);
  await supabase
    .from("magazzino_posto_allocazioni")
    .update({
      stato: "liberato",
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("occupazione_id", row.id)
    .is("deleted_at", null);
  const { error } = await supabase
    .from("magazzino_posto_occupazioni")
    .update({
      stato: "liberato",
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id);
  if (error) return { success: false, error: error.message };
  await syncStatoUbicazione(supabase, ubicazioneId, "libero", auth.userId);
  await writeAuditLog({
    entity_type: "magazzino_posto_occupazioni",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Liberato posto, pallet ${row.codice_pallet} chiuso (numeri riusabili)`,
    payload: { ubicazione_id: ubicazioneId, codice_pallet: row.codice_pallet },
  });
  return { success: true };
}

export async function rimuoviElementoPostoAction(
  elementoId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "strumenti",
    "amministrazione",
  ]);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("magazzino_posto_elementi")
    .select("id, numero, occupazione_id")
    .eq("id", elementoId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as {
    id: string;
    numero: string;
    occupazione_id: string;
  } | null;
  if (!row) return { success: false, error: "Elemento già rimosso." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("magazzino_posto_elementi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "magazzino_posto_elementi",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Rimosso elemento ${row.numero} (numero riusabile)`,
    payload: {
      occupazione_id: row.occupazione_id,
      numero: row.numero,
    },
  });
  return { success: true };
}

export async function rettificaOccupazionePostoAction(
  raw: RettificaOccupazionePostoInput
): Promise<
  | { success: true; occupazione: PostoOccupazione }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "magazzino",
    "strumenti",
    "amministrazione",
  ]);
  const parsed = rettificaOccupazionePostoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati rettifica non validi.",
    };
  }
  const input = parsed.data;
  const supabase = createServiceClient();
  const { data: row, error: rowErr } = await supabase
    .from("magazzino_posto_occupazioni")
    .select(`${OCC_SELECT}, versione`)
    .eq("id", input.occupazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (rowErr) return { success: false, error: rowErr.message };
  if (!row) return { success: false, error: "Occupazione non trovata." };
  const occRow = row as Parameters<typeof mapOccupazione>[0] & {
    versione?: number;
  };

  const { data: els } = await supabase
    .from("magazzino_posto_elementi")
    .select("id, numero, peso_kg, scan_token, sort_order")
    .eq("occupazione_id", occRow.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const esistenti = (els ?? []) as Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
    sort_order: number;
  }>;

  const kg =
    input.pesoModo === "complessivo"
      ? Number(input.pesoComplessivoKg)
      : (input.pesiElementiKg ?? []).reduce((s, n) => s + n, 0);
  const kgRound = Math.round(kg * 1000) / 1000;
  if (!(kgRound > 0)) {
    return { success: false, error: "Il peso deve essere maggiore di zero." };
  }

  const interno = input.lottoInternoCodice?.trim() || occRow.lotto_interno_codice || "";
  const esternoId = input.lottoEsternoId?.trim() || occRow.lotto_esterno_id || "";
  const stessoLotto =
    interno === (occRow.lotto_interno_codice || "") &&
    esternoId === (occRow.lotto_esterno_id || "");

  const lottiRes = await listLottiDaSistemareAction();
  if (!lottiRes.success) return lottiRes;
  let lotto = lottiRes.lotti.find((l) => {
    if (input.prodottoId && l.prodottoId !== input.prodottoId) return false;
    if (interno && esternoId) {
      return l.lottoInterno === interno && l.lottoEsternoId === esternoId;
    }
    if (interno) return l.lottoInterno === interno;
    return Boolean(esternoId && l.lottoEsternoId === esternoId);
  });
  if (!lotto && stessoLotto && occRow.prodotto_id) {
    lotto = {
      prodottoId: occRow.prodotto_id,
      prodottoCodice: "",
      prodottoNome: "",
      lottoInterno: occRow.lotto_interno_codice || "",
      lottoEsternoId: occRow.lotto_esterno_id,
      lottoEsternoCodice: occRow.lotto_esterno_codice,
      kgCaricati: 0,
      kgSistemati: 0,
      kgDaSistemare: Number(occRow.kg_allocati ?? 0),
    };
  }
  if (!lotto) {
    return {
      success: false,
      error: "Lotto non disponibile per la rettifica.",
    };
  }
  const kgGiaQui = stessoLotto ? Number(occRow.kg_allocati ?? 0) : 0;
  if (kgRound - (lotto.kgDaSistemare + kgGiaQui) > 0.0005) {
    return {
      success: false,
      error: `Su questo lotto restano ${(lotto.kgDaSistemare + kgGiaQui).toLocaleString("it-IT")} kg utilizzabili.`,
    };
  }

  const { data: ubi } = await supabase
    .from("magazzino_ubicazioni")
    .select("peso_max_kg")
    .eq("id", occRow.ubicazione_id)
    .maybeSingle();
  const pesoMax = Number((ubi as { peso_max_kg?: number | null } | null)?.peso_max_kg);
  if (Number.isFinite(pesoMax) && pesoMax > 0 && kgRound > pesoMax) {
    return {
      success: false,
      error: `Il peso supera il massimo del posto (${pesoMax} kg).`,
    };
  }

  const now = new Date().toISOString();
  const qty = input.quantitaElementi;
  const elementiOut: Array<{
    id: string;
    numero: string;
    peso_kg: number | string | null;
    scan_token: string;
  }> = [];

  if (input.pesoModo === "complessivo") {
    if (esistenti.length) {
      await supabase
        .from("magazzino_posto_elementi")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("occupazione_id", occRow.id)
        .is("deleted_at", null);
    }
  } else {
    const pesi = input.pesiElementiKg ?? [];
    const keep = esistenti.slice(0, qty);
    const extra = esistenti.slice(qty);
    if (extra.length) {
      await supabase
        .from("magazzino_posto_elementi")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .in(
          "id",
          extra.map((e) => e.id)
        );
    }
    for (let i = 0; i < keep.length; i += 1) {
      const e = keep[i];
      await supabase
        .from("magazzino_posto_elementi")
        .update({
          peso_kg: pesi[i] ?? null,
          sort_order: i,
          updated_by: auth.userId,
        })
        .eq("id", e.id);
      elementiOut.push({
        id: e.id,
        numero: e.numero,
        peso_kg: pesi[i] ?? null,
        scan_token: e.scan_token,
      });
    }
    for (let i = keep.length; i < qty; i += 1) {
      const numero = await codiceLibero(
        supabase,
        "magazzino_posto_elementi",
        "numero",
        5
      );
      const { data: elRow, error: elErr } = await supabase
        .from("magazzino_posto_elementi")
        .insert({
          occupazione_id: occRow.id,
          numero,
          peso_kg: pesi[i] ?? null,
          scan_token: randomUUID(),
          sort_order: i,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id, numero, peso_kg, scan_token")
        .single();
      if (elErr || !elRow) {
        return {
          success: false,
          error: elErr?.message ?? "Creazione elemento fallita.",
        };
      }
      elementiOut.push(elRow as (typeof elementiOut)[number]);
    }
  }

  const notaRettifica = `[Rettifica ${new Date().toLocaleDateString("it-IT")}] ${input.giustificazione.trim()}`;
  const noteBase = (input.note ?? occRow.note ?? "").trim();
  const note = noteBase
    ? `${noteBase}\n${notaRettifica}`
    : notaRettifica;

  const { error: upErr } = await supabase
    .from("magazzino_posto_occupazioni")
    .update({
      quantita_elementi: qty,
      peso_modo: input.pesoModo,
      peso_complessivo_kg:
        input.pesoModo === "complessivo" ? kgRound : null,
      peso_motivazione:
        input.pesoModo === "complessivo" ? input.giustificazione.trim() : "",
      prodotto_id: lotto.prodottoId,
      kg_allocati: kgRound,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      note,
      versione: Number(occRow.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", occRow.id);
  if (upErr) return { success: false, error: upErr.message };

  const { error: allUp } = await supabase
    .from("magazzino_posto_allocazioni")
    .update({
      prodotto_id: lotto.prodottoId,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      kg: kgRound,
      updated_by: auth.userId,
    })
    .eq("occupazione_id", occRow.id)
    .is("deleted_at", null);
  if (allUp) return { success: false, error: allUp.message };

  const occupazione = mapOccupazione(
    {
      ...occRow,
      quantita_elementi: qty,
      peso_modo: input.pesoModo,
      peso_complessivo_kg:
        input.pesoModo === "complessivo" ? kgRound : null,
      peso_motivazione:
        input.pesoModo === "complessivo" ? input.giustificazione.trim() : "",
      prodotto_id: lotto.prodottoId,
      kg_allocati: kgRound,
      lotto_interno_codice: lotto.lottoInterno,
      lotto_esterno_id: lotto.lottoEsternoId,
      lotto_esterno_codice: lotto.lottoEsternoCodice,
      note,
    },
    elementiOut
  );
  await writeAuditLog({
    entity_type: "magazzino_posto_occupazioni",
    entity_id: occRow.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Rettifica occupazione pallet ${occRow.codice_pallet}`,
    payload: {
      giustificazione: input.giustificazione.trim(),
      prima: {
        qty: occRow.quantita_elementi,
        kg: occRow.kg_allocati,
        lotto: occRow.lotto_interno_codice,
        peso_modo: occRow.peso_modo,
      },
      dopo: {
        qty,
        kg: kgRound,
        lotto: lotto.lottoInterno,
        peso_modo: input.pesoModo,
      },
    },
  });
  return { success: true, occupazione };
}
