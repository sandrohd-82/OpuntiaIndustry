import { z } from "zod";
import type {
  ListinoRow,
  ListinoRigaCondizioneRow,
  ListinoRigaRow,
  ListinoStato,
} from "@/types/database";

export const LISTINO_RIGA_UM = ["kg", "lt"] as const;
export type ListinoRigaUm = (typeof LISTINO_RIGA_UM)[number];

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
  prezzo: z.number().finite().positive("Il prezzo deve essere maggiore di zero"),
  unitaMisura: z.enum(LISTINO_RIGA_UM).default("kg"),
  ivaPercentuale: z.number().finite().min(0).max(100).optional().default(22),
  minQty: z.number().finite().min(0).optional().default(0),
  scontoMaxPct: z.number().finite().min(0).max(100).optional().default(0),
});

export const upsertListinoRigaCondizioneSchema = z
  .object({
    id: z.string().uuid().optional(),
    listinoRigaId: z.string().uuid(),
    qtyDa: z.number().finite().min(0, "Quantità da non valida"),
    qtyA: z.number().finite().positive().nullable().optional(),
    imballaggioVoceId: z.string().uuid(),
    scontoPct: z.number().finite().min(0).max(100, "Sconto 0–100"),
  })
  .superRefine((v, ctx) => {
    if (v.qtyA != null && v.qtyA <= v.qtyDa) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quantità a deve essere maggiore di quantità da.",
        path: ["qtyA"],
      });
    }
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

export type ListinoRigaCondizione = {
  id: string;
  listinoRigaId: string;
  qtyDa: number;
  qtyA: number | null;
  imballaggioVoceId: string;
  imballaggioCodice?: string;
  imballaggioNome?: string;
  scontoPct: number;
};

export type ListinoRiga = {
  id: string;
  listinoId: string;
  prodottoId: string;
  prodottoCodice?: string;
  prodottoNome?: string;
  prezzo: number;
  unitaMisura: ListinoRigaUm;
  ivaPercentuale: number;
  minQty: number;
  scontoMaxPct: number;
  condizioni: ListinoRigaCondizione[];
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
  prodotto?: { codice: string; nome: string },
  condizioni: ListinoRigaCondizione[] = []
): ListinoRiga {
  const um = row.unita_misura === "lt" ? "lt" : "kg";
  return {
    id: row.id,
    listinoId: row.listino_id,
    prodottoId: row.prodotto_id,
    prodottoCodice: prodotto?.codice,
    prodottoNome: prodotto?.nome,
    prezzo: Number(row.prezzo),
    unitaMisura: um,
    ivaPercentuale: Number(row.iva_percentuale),
    minQty: Number(row.min_qty),
    scontoMaxPct: Number(row.sconto_max_pct),
    condizioni,
  };
}

export function mapListinoRigaCondizione(
  row: ListinoRigaCondizioneRow,
  imballaggio?: { codice: string; nome: string }
): ListinoRigaCondizione {
  return {
    id: row.id,
    listinoRigaId: row.listino_riga_id,
    qtyDa: Number(row.qty_da),
    qtyA: row.qty_a == null ? null : Number(row.qty_a),
    imballaggioVoceId: row.imballaggio_voce_id,
    imballaggioCodice: imballaggio?.codice,
    imballaggioNome: imballaggio?.nome,
    scontoPct: Number(row.sconto_pct),
  };
}

export function listinoCondizioniSovrapposte(
  esistenti: Array<{ id?: string; qtyDa: number; qtyA: number | null }>,
  candidate: { id?: string; qtyDa: number; qtyA: number | null }
): boolean {
  const cEnd = candidate.qtyA ?? Number.POSITIVE_INFINITY;
  return esistenti.some((e) => {
    if (candidate.id && e.id === candidate.id) return false;
    const eEnd = e.qtyA ?? Number.POSITIVE_INFINITY;
    return candidate.qtyDa < eEnd && e.qtyDa < cEnd;
  });
}
