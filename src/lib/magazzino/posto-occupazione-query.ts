import {
  etichettaPalletESacchi,
  pesoOccupazioneKg,
  riepilogoOccupazionePosto,
  targaProdottoOccupazione,
  type DettaglioElencoPosto,
  type OccupazioneLottoPianta,
  type PostoElementoTipo,
  type PostoOccupazione,
  type PostoPesoModo,
  type ProdottoLottoElenco,
  type RiepilogoElencoPosto,
} from "@/lib/magazzino/posto-occupazione";
import { createServiceClient } from "@/lib/supabase/server";

const CATALOG_PROPRIO = "prodotto_proprio";

export const OCC_SELECT =
  "id, ubicazione_id, tipo_elemento, movimentazione_voce_id, movimentazione_nome, imballaggio_voce_id, imballaggio_nome, quantita_elementi, codice_pallet, peso_modo, peso_complessivo_kg, peso_motivazione, prodotto_id, kg_allocati, lotto_interno_codice, lotto_esterno_id, lotto_esterno_codice, note";

type OccRow = {
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
};

type ElRow = {
  id: string;
  numero: string;
  peso_kg: number | string | null;
  scan_token: string;
};

export function mapOccupazione(
  row: OccRow,
  elementi: ElRow[]
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

export async function queryDettaglioOccupazionePosto(
  ubicazioneId: string
): Promise<
  | { success: true; dettaglio: DettaglioElencoPosto }
  | { success: false; error: string }
> {
  if (!ubicazioneId) {
    return { success: true, dettaglio: { occupazione: null, prodotto: null } };
  }
  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return { success: false, error: "Occupazione non disponibile." };
  }
  const { data, error } = await db
    .from("magazzino_posto_occupazioni")
    .select(OCC_SELECT)
    .eq("ubicazione_id", ubicazioneId)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return { success: true, dettaglio: { occupazione: null, prodotto: null } };
  }
  const row = data as OccRow;
  const { data: els } = await db
    .from("magazzino_posto_elementi")
    .select("id, numero, peso_kg, scan_token, sort_order")
    .eq("occupazione_id", row.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const occ = mapOccupazione(row, (els ?? []) as ElRow[]);
  let prodotto: ProdottoLottoElenco | null = null;
  if (occ.prodottoId) {
    const { data: p } = await db
      .from("prodotti_propri")
      .select("id, codice, nome")
      .eq("id", occ.prodottoId)
      .maybeSingle();
    if (p) {
      const r = p as { id: string; codice: string; nome: string };
      prodotto = { id: r.id, codice: r.codice, nome: r.nome };
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
      const { data: p } = await db
        .from("prodotti_propri")
        .select("id, codice, nome")
        .eq("id", mid)
        .maybeSingle();
      if (p) {
        const r = p as { id: string; codice: string; nome: string };
        prodotto = { id: r.id, codice: r.codice || codiceMov, nome: r.nome };
      } else if (codiceMov) {
        prodotto = { id: mid, codice: codiceMov, nome: "" };
      }
    }
  }
  return { success: true, dettaglio: { occupazione: occ, prodotto } };
}

export async function queryRiepilogoOccupazionePosti(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, RiepilogoElencoPosto> }
  | { success: false; error: string }
> {
  const ids = [...new Set(ubicazioneIds.filter(Boolean))];
  const perPosto: Record<string, RiepilogoElencoPosto> = {};
  if (!ids.length) return { success: true, perPosto };

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return { success: false, error: "Occupazione non disponibile." };
  }

  const rows: OccRow[] = [];
  const CHUNK = 80;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("magazzino_posto_occupazioni")
      .select(OCC_SELECT)
      .in("ubicazione_id", part)
      .eq("stato", "attivo")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    rows.push(...((data ?? []) as OccRow[]));
  }
  if (!rows.length) return { success: true, perPosto };

  const occIds = rows.map((r) => r.id);
  const prodottoIds = [
    ...new Set(rows.map((r) => r.prodotto_id).filter(Boolean)),
  ] as string[];

  const els: Array<ElRow & { occupazione_id: string }> = [];
  for (let i = 0; i < occIds.length; i += CHUNK) {
    const part = occIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("magazzino_posto_elementi")
      .select("id, numero, peso_kg, scan_token, occupazione_id")
      .in("occupazione_id", part)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    els.push(
      ...((data ?? []) as Array<ElRow & { occupazione_id: string }>)
    );
  }

  let prods: Array<{ id: string; codice: string }> = [];
  if (prodottoIds.length) {
    const { data, error } = await db
      .from("prodotti_propri")
      .select("id, codice")
      .in("id", prodottoIds);
    if (error) return { success: false, error: error.message };
    prods = (data ?? []) as Array<{ id: string; codice: string }>;
  }

  const elsByOcc = new Map<string, ElRow[]>();
  for (const e of els) {
    const list = elsByOcc.get(e.occupazione_id) ?? [];
    list.push(e);
    elsByOcc.set(e.occupazione_id, list);
  }
  const codiceByProd = new Map(prods.map((p) => [p.id, p.codice]));

  for (const row of rows) {
    const occ = mapOccupazione(row, elsByOcc.get(row.id) ?? []);
    const codice = row.prodotto_id
      ? codiceByProd.get(row.prodotto_id) ?? ""
      : "";
    perPosto[row.ubicazione_id] = {
      targa: targaProdottoOccupazione(occ, codice),
      quantitaTotaleKg: pesoOccupazioneKg(occ),
      testo: riepilogoOccupazionePosto(occ, codice),
    };
  }
  return { success: true, perPosto };
}

export async function queryOccupazioniPerProdotto(
  prodottoId: string,
  lotti: string[] = []
): Promise<
  | { success: true; perLotto: Record<string, OccupazioneLottoPianta> }
  | { success: false; error: string }
> {
  const perLotto: Record<string, OccupazioneLottoPianta> = {};
  if (!prodottoId && !lotti.length) return { success: true, perLotto };

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return { success: false, error: "Occupazione non disponibile." };
  }

  const rows: OccRow[] = [];
  const seen = new Set<string>();
  const pushRows = (list: OccRow[]) => {
    for (const r of list) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  };

  if (prodottoId) {
    const { data, error } = await db
      .from("magazzino_posto_occupazioni")
      .select(OCC_SELECT)
      .eq("prodotto_id", prodottoId)
      .eq("stato", "attivo")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    pushRows((data ?? []) as OccRow[]);
  }

  const lottiClean = [...new Set(lotti.map((s) => s.trim()).filter(Boolean))];
  const CHUNK = 80;
  for (let i = 0; i < lottiClean.length; i += CHUNK) {
    const part = lottiClean.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("magazzino_posto_occupazioni")
      .select(OCC_SELECT)
      .in("lotto_interno_codice", part)
      .eq("stato", "attivo")
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    pushRows((data ?? []) as OccRow[]);
  }

  if (!rows.length) return { success: true, perLotto };

  const occIds = rows.map((r) => r.id);
  const ubiIds = [...new Set(rows.map((r) => r.ubicazione_id))];
  const prodottoIds = [
    ...new Set(rows.map((r) => r.prodotto_id).filter(Boolean)),
  ] as string[];
  if (prodottoId) prodottoIds.push(prodottoId);

  const els: Array<ElRow & { occupazione_id: string }> = [];
  for (let i = 0; i < occIds.length; i += CHUNK) {
    const part = occIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from("magazzino_posto_elementi")
      .select("id, numero, peso_kg, scan_token, occupazione_id")
      .in("occupazione_id", part)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    els.push(...((data ?? []) as Array<ElRow & { occupazione_id: string }>));
  }

  const [{ data: ubis }, { data: prods }] = await Promise.all([
    db
      .from("magazzino_ubicazioni")
      .select("id, codice, nome")
      .in("id", ubiIds)
      .is("deleted_at", null),
    prodottoIds.length
      ? db.from("prodotti_propri").select("id, codice").in("id", prodottoIds)
      : Promise.resolve({ data: [] as Array<{ id: string; codice: string }> }),
  ]);

  const ubiById = new Map(
    ((ubis ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
      (u) => [u.id, u]
    )
  );
  const codiceByProd = new Map(
    ((prods ?? []) as Array<{ id: string; codice: string }>).map((p) => [
      p.id,
      p.codice,
    ])
  );
  const elsByOcc = new Map<string, ElRow[]>();
  for (const e of els) {
    const list = elsByOcc.get(e.occupazione_id) ?? [];
    list.push(e);
    elsByOcc.set(e.occupazione_id, list);
  }

  const codiceProdottoFallback = prodottoId
    ? codiceByProd.get(prodottoId) ?? ""
    : "";

  for (const row of rows) {
    const occ = mapOccupazione(row, elsByOcc.get(row.id) ?? []);
    const lotto = (occ.lottoInternoCodice || "").trim();
    if (!lotto) continue;
    const codice =
      (occ.prodottoId ? codiceByProd.get(occ.prodottoId) : "") ||
      codiceProdottoFallback;
    const targa = targaProdottoOccupazione(occ, codice);
    const ubi = ubiById.get(occ.ubicazioneId);
    const nEl = occ.quantitaElementi ?? occ.elementi.length;
    const tipoSacco = occ.imballaggioNome || (
      occ.tipoElemento === "confezione" ? "Cartone" : "Sacco"
    );
    const acc =
      perLotto[lotto] ??
      ({
        lottoInterno: lotto,
        prodottoId: occ.prodottoId || prodottoId,
        prodottoCodice: codice,
        riepilogo: "",
        palletCount: 0,
        elementiCount: 0,
        righe: [],
      } satisfies OccupazioneLottoPianta);
    acc.palletCount += 1;
    acc.elementiCount += Math.max(0, nEl);
    if (occ.elementi.length) {
      for (const el of occ.elementi) {
        acc.righe.push({
          elementoId: el.id,
          occupazioneId: occ.id,
          ubicazioneId: occ.ubicazioneId,
          postoCodice: ubi?.codice || "",
          postoNome: ubi?.nome || "",
          codiceElemento: el.numero,
          codicePallet: occ.codicePallet,
          pesoKg: el.pesoKg,
          tipoSacco,
          targa,
          lottoInterno: lotto,
        });
      }
    } else {
      acc.righe.push({
        elementoId: occ.id,
        occupazioneId: occ.id,
        ubicazioneId: occ.ubicazioneId,
        postoCodice: ubi?.codice || "",
        postoNome: ubi?.nome || "",
        codiceElemento: occ.codicePallet,
        codicePallet: occ.codicePallet,
        pesoKg: pesoOccupazioneKg(occ),
        tipoSacco,
        targa,
        lottoInterno: lotto,
      });
    }
    acc.riepilogo = etichettaPalletESacchi(
      acc.palletCount,
      acc.elementiCount,
      occ.tipoElemento
    );
    perLotto[lotto] = acc;
  }

  return { success: true, perLotto };
}
