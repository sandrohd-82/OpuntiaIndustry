import { z } from "zod";
import type {
  ListinoRow,
  ListinoRigaCondizioneRow,
  ListinoRigaRow,
  ListinoStato,
} from "@/types/database";

export const LISTINO_RIGA_UM = ["kg", "lt"] as const;
export type ListinoRigaUm = (typeof LISTINO_RIGA_UM)[number];

export const LISTINO_CODICE_PREFIX = "B2B-";

export function listinoCodiceSlug(raw: string): string {
  let s = raw.trim();
  if (/^B2B-/i.test(s)) s = s.slice(4);
  s = s.replace(/-V\d+\s*$/i, "");
  return s.replace(/[^A-Za-z0-9]+/g, "").slice(0, 28);
}

export function parseListinoCodice(codice: string): {
  slug: string;
  versione: number;
} {
  const m = codice.trim().match(/^B2B-(.+)-V(\d+)$/i);
  if (m) {
    return {
      slug: listinoCodiceSlug(m[1]),
      versione: Number(m[2]) || 1,
    };
  }
  return { slug: listinoCodiceSlug(codice), versione: 1 };
}

export function buildListinoCodice(slug: string, versione: number): string {
  const s = listinoCodiceSlug(slug);
  const v =
    Number.isFinite(versione) && versione >= 1 ? Math.floor(versione) : 1;
  return `${LISTINO_CODICE_PREFIX}${s}-V${v}`;
}

export const createListinoSchema = z.object({
  codice: z.string().trim().min(1, "Inserisci il testo del codice"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(160),
  note: z.string().trim().max(4000).optional().default(""),
  modelloId: z.string().uuid().optional().nullable(),
  sostituisceId: z.string().uuid().optional().nullable(),
  versioneCodice: z.number().int().positive().optional(),
});

export const updateListinoSchema = z.object({
  id: z.string().uuid(),
  codice: z.string().trim().min(1, "Inserisci il testo del codice"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(160),
  note: z.string().trim().max(4000).optional().default(""),
});

export const LISTINO_DISPONIBILITA = [
  "in_produzione",
  "fuori_produzione",
  "non_disponibile",
] as const;
export type ListinoDisponibilita = (typeof LISTINO_DISPONIBILITA)[number];

export const LISTINO_DISPONIBILITA_LABEL: Record<ListinoDisponibilita, string> =
  {
    in_produzione: "In produzione",
    fuori_produzione: "Fuori produzione",
    non_disponibile: "Al momento non disponibile",
  };

export const upsertListinoRigaSchema = z
  .object({
    listinoId: z.string().uuid(),
    prodottoId: z.string().uuid(),
    prezzo: z.number().finite().min(0, "Prezzo non valido"),
    unitaMisura: z.enum(LISTINO_RIGA_UM).default("kg"),
    disponibilita: z.enum(LISTINO_DISPONIBILITA).default("in_produzione"),
    ivaPercentuale: z.number().finite().min(0).max(100).optional().default(22),
    minQty: z.number().finite().min(0).optional().default(0),
    scontoMaxPct: z.number().finite().min(0).max(100).optional().default(0),
  })
  .superRefine((v, ctx) => {
    if (v.disponibilita === "in_produzione" && v.prezzo <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Prezzo 0 solo se dichiari «fuori produzione» o «al momento non disponibile».",
        path: ["prezzo"],
      });
    }
  });

export function rigaListinoCompleta(r: {
  prezzo: number;
  disponibilita: ListinoDisponibilita;
}): boolean {
  if (r.disponibilita === "in_produzione") return r.prezzo > 0;
  return r.prezzo >= 0;
}

export const upsertListinoRigaCondizioneSchema = z
  .object({
    id: z.string().uuid().optional(),
    listinoRigaId: z.string().uuid(),
    qtyDa: z.number().finite().min(0, "Quantità da non valida"),
    qtyA: z.number().finite().positive().nullable().optional(),
    imballaggioVoceId: z.string().uuid(),
    scontoPct: z.number().finite().min(0).max(100, "Sconto 0–100"),
    kgConfezione: z.number().finite().positive("Indica i kg della confezione"),
    kgForzato: z.boolean().optional().default(false),
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
  sostituisceId: string | null;
  publishedAt: string | null;
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
  kgConfezione: number;
  kgStandard: number | null;
  kgForzato: boolean;
};

export type ListinoRiga = {
  id: string;
  listinoId: string;
  prodottoId: string;
  prodottoCodice?: string;
  prodottoNome?: string;
  prezzo: number;
  unitaMisura: ListinoRigaUm;
  disponibilita: ListinoDisponibilita;
  revisioneApprovata: boolean;
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
    sostituisceId: row.sostituisce_id ?? null,
    publishedAt: row.published_at ?? null,
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
    disponibilita:
      row.disponibilita === "fuori_produzione" ||
      row.disponibilita === "non_disponibile"
        ? row.disponibilita
        : "in_produzione",
    revisioneApprovata: Boolean(row.revisione_approvata),
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
    kgConfezione: Number(row.kg_confezione ?? 0),
    kgStandard: row.kg_standard == null ? null : Number(row.kg_standard),
    kgForzato: Boolean(row.kg_forzato),
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
