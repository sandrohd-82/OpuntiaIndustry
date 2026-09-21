import {
  type DettaglioElencoPosto,
  type PostoElementoTipo,
  type PostoOccupazione,
  type PostoPesoModo,
  type ProdottoLottoElenco,
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
