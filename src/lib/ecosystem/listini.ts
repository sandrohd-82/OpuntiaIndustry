import { z } from "zod";
import type { ListinoRow, ListinoRigaRow, ListinoStato } from "@/types/database";

export const createListinoSchema = z.object({
  codice: z.string().trim().min(2, "Codice obbligatorio").max(40),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(160),
  validoDal: z.string().trim().min(8, "Data inizio obbligatoria"),
  validoAl: z.string().trim().optional().nullable(),
  note: z.string().trim().max(4000).optional().default(""),
});

export const upsertListinoRigaSchema = z.object({
  listinoId: z.string().uuid(),
  prodottoId: z.string().uuid(),
  prezzo: z.number().finite().min(0, "Prezzo non valido"),
  ivaPercentuale: z.number().finite().min(0).max(100).optional().default(22),
  minQty: z.number().finite().min(0).optional().default(0),
  scontoMaxPct: z.number().finite().min(0).max(100).optional().default(0),
});

export type Listino = {
  id: string;
  codice: string;
  nome: string;
  canale: "b2b" | "b2c";
  valuta: string;
  validoDal: string;
  validoAl: string | null;
  versione: number;
  stato: ListinoStato;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ListinoRiga = {
  id: string;
  listinoId: string;
  prodottoId: string;
  prodottoCodice?: string;
  prodottoNome?: string;
  prezzo: number;
  ivaPercentuale: number;
  minQty: number;
  scontoMaxPct: number;
};

export function mapListino(row: ListinoRow): Listino {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    canale: row.canale,
    valuta: row.valuta,
    validoDal: row.valido_dal,
    validoAl: row.valido_al,
    versione: row.versione,
    stato: row.stato,
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapListinoRiga(
  row: ListinoRigaRow,
  prodotto?: { codice: string; nome: string }
): ListinoRiga {
  return {
    id: row.id,
    listinoId: row.listino_id,
    prodottoId: row.prodotto_id,
    prodottoCodice: prodotto?.codice,
    prodottoNome: prodotto?.nome,
    prezzo: Number(row.prezzo),
    ivaPercentuale: Number(row.iva_percentuale),
    minQty: Number(row.min_qty),
    scontoMaxPct: Number(row.sconto_max_pct),
  };
}
