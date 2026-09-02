import { z } from "zod";
import {
  isListinoLingua,
  type GeoNazione,
} from "@/lib/ecosystem/geo-nazioni";
import type {
  ListinoRow,
  ListinoRigaCondizioneRow,
  ListinoRigaRow,
  ListinoStato,
} from "@/types/database";

export const LISTINO_RIGA_UM = ["kg", "lt"] as const;
export type ListinoRigaUm = (typeof LISTINO_RIGA_UM)[number];

export const LISTINO_CODICE_PREFIX = "B2B-";
export const LISTINO_SCONTO_TARGA_PREFIX = "Sc";
export const LISTINO_SCONTO_TARGA_DIGITS = 5;

export function normalizeTargaSconto(raw: string): string {
  let s = raw.trim().replace(/\s+/g, "");
  if (/^sc/i.test(s)) s = s.slice(2);
  const digits = s.replace(/\D/g, "").slice(0, LISTINO_SCONTO_TARGA_DIGITS);
  return `${LISTINO_SCONTO_TARGA_PREFIX}${digits.padStart(LISTINO_SCONTO_TARGA_DIGITS, "0")}`;
}

export function targaScontoDigits(raw: string): string {
  return normalizeTargaSconto(raw).slice(LISTINO_SCONTO_TARGA_PREFIX.length);
}

export function isValidTargaSconto(code: string): boolean {
  const n = normalizeTargaSconto(code);
  return (
    new RegExp(
      `^${LISTINO_SCONTO_TARGA_PREFIX}\\d{${LISTINO_SCONTO_TARGA_DIGITS}}$`
    ).test(n) && n !== `${LISTINO_SCONTO_TARGA_PREFIX}00000`
  );
}

export function nextTargaSconto(used: Iterable<string>): string {
  const taken = new Set(
    [...used].map((c) => normalizeTargaSconto(c)).filter(Boolean)
  );
  const max = 10 ** LISTINO_SCONTO_TARGA_DIGITS - 1;
  for (let i = 1; i <= max; i++) {
    const candidate = `${LISTINO_SCONTO_TARGA_PREFIX}${String(i).padStart(LISTINO_SCONTO_TARGA_DIGITS, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Nessuna targa sconto Sc disponibile (Sc00001–Sc99999).");
}

export function listinoCodiceSlug(raw: string): string {
  let s = raw.trim();
  if (/^B2B-/i.test(s)) s = s.slice(4);
  s = s.replace(/-V\d+\s*$/i, "");
  return s.replace(/[^A-Za-z0-9]+/g, "").slice(0, 28);
}

export function parseListinoCodice(codice: string): {
  slug: string;
  versione: number;
  locale: string | null;
} {
  const loc = codice.trim().match(/^B2B-(.+)-([A-Za-z]{2})-V(\d+)$/i);
  if (loc && isListinoLingua(loc[2].toLowerCase())) {
    return {
      slug: listinoCodiceSlug(loc[1]),
      versione: Number(loc[3]) || 1,
      locale: loc[2].toLowerCase(),
    };
  }
  const m = codice.trim().match(/^B2B-(.+)-V(\d+)$/i);
  if (m) {
    return {
      slug: listinoCodiceSlug(m[1]),
      versione: Number(m[2]) || 1,
      locale: null,
    };
  }
  return { slug: listinoCodiceSlug(codice), versione: 1, locale: null };
}

export function buildListinoCodice(slug: string, versione: number): string {
  const s = listinoCodiceSlug(slug);
  const v =
    Number.isFinite(versione) && versione >= 1 ? Math.floor(versione) : 1;
  return `${LISTINO_CODICE_PREFIX}${s}-V${v}`;
}

export function buildListinoCodiceLocale(
  slug: string,
  locale: string,
  versione: number
): string {
  const s = listinoCodiceSlug(slug);
  const loc = locale.trim().toUpperCase().slice(0, 2);
  const v =
    Number.isFinite(versione) && versione >= 1 ? Math.floor(versione) : 1;
  return `${LISTINO_CODICE_PREFIX}${s}-${loc}-V${v}`;
}

export const createListinoSchema = z
  .object({
    codice: z.string().trim().min(1, "Inserisci il testo del codice"),
    nome: z.string().trim().min(1, "Nome obbligatorio").max(160),
    note: z.string().trim().max(4000).optional().default(""),
    modelloId: z.string().uuid().optional().nullable(),
    sostituisceId: z.string().uuid().optional().nullable(),
    versioneCodice: z.number().int().positive().optional(),
    nazioneIds: z.array(z.string().uuid()).optional().default([]),
  })
  .superRefine((v, ctx) => {
    const fromCopy = Boolean(v.modelloId || v.sostituisceId);
    if (!fromCopy && (!v.nazioneIds || v.nazioneIds.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seleziona almeno una nazione coperta dal listino.",
        path: ["nazioneIds"],
      });
    }
  });

export const updateListinoSchema = z.object({
  id: z.string().uuid(),
  codice: z.string().trim().min(1, "Inserisci il testo del codice"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(160),
  note: z.string().trim().max(4000).optional().default(""),
  nazioneIds: z
    .array(z.string().uuid())
    .min(1, "Seleziona almeno una nazione")
    .optional(),
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

export function isQtyMultiploConfezione(
  qty: number,
  kgConfezione: number
): boolean {
  if (!Number.isFinite(qty) || qty < 0) return false;
  if (!Number.isFinite(kgConfezione) || kgConfezione <= 0) return false;
  const q = Math.round(qty * 1000);
  const step = Math.round(kgConfezione * 1000);
  if (step <= 0) return false;
  return q % step === 0;
}

export function multipliConfezioneVicini(
  qty: number,
  kgConfezione: number
): { down: number; up: number } {
  const step = kgConfezione;
  const down = Math.round(Math.floor((qty + 1e-9) / step) * step * 1000) / 1000;
  const up = Math.round(Math.ceil((qty - 1e-9) / step) * step * 1000) / 1000;
  return { down: Math.max(0, down), up };
}

export function avvisoQtyConfezione(input: {
  qtyDa: number;
  qtyA: number | null;
  kgConfezione: number;
}): string | null {
  if (!Number.isFinite(input.kgConfezione) || input.kgConfezione <= 0) {
    return null;
  }
  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
  const pack = fmt(input.kgConfezione);
  const parts: string[] = [];
  if (Number.isFinite(input.qtyDa) && !isQtyMultiploConfezione(input.qtyDa, input.kgConfezione)) {
    const { down, up } = multipliConfezioneVicini(input.qtyDa, input.kgConfezione);
    parts.push(
      `Qty da deve essere multiplo della confezione da ${pack} kg (es. ${fmt(down)} o ${fmt(up)})`
    );
  }
  if (
    input.qtyA != null &&
    Number.isFinite(input.qtyA) &&
    !isQtyMultiploConfezione(input.qtyA, input.kgConfezione)
  ) {
    const { down, up } = multipliConfezioneVicini(input.qtyA, input.kgConfezione);
    parts.push(
      `Qty a deve essere multiplo della confezione da ${pack} kg (es. ${fmt(down)} o ${fmt(up)})`
    );
  }
  return parts.length ? parts.join(". ") + "." : null;
}

function refineQtyConfezione(
  v: { qtyDa: number; qtyA?: number | null; kgConfezione: number },
  ctx: z.RefinementCtx
) {
  if (v.qtyA != null && v.qtyA < v.qtyDa) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Quantità a deve essere maggiore o uguale a quantità da. Uguali = sconto solo per quella quantità (es. un bigbag da 500 kg).",
      path: ["qtyA"],
    });
  }
  const msg = avvisoQtyConfezione({
    qtyDa: v.qtyDa,
    qtyA: v.qtyA ?? null,
    kgConfezione: v.kgConfezione,
  });
  if (msg) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: msg,
      path: ["qtyDa"],
    });
  }
}

export const listinoRigaCondizioneSyncItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    qtyDa: z.number().finite().min(0, "Quantità da non valida"),
    qtyA: z.number().finite().positive().nullable().optional(),
    imballaggioVoceId: z.string().uuid(),
    scontoPct: z.number().finite().min(0).max(100, "Sconto 0–100"),
    kgConfezione: z.number().finite().positive("Indica i kg della confezione"),
    kgForzato: z.boolean().optional().default(false),
    targa: z.string().trim().optional().default(""),
  })
  .superRefine(refineQtyConfezione)
  .superRefine((v, ctx) => {
    if (v.targa && !isValidTargaSconto(v.targa)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targa sconto: Sc + 5 cifre (es. Sc00001). Non usare Sc00000.",
        path: ["targa"],
      });
    }
  });

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
    syncCondizioni: z.boolean().optional().default(false),
    condizioni: z
      .array(listinoRigaCondizioneSyncItemSchema)
      .optional()
      .default([]),
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
    targa: z.string().trim().optional().default(""),
  })
  .superRefine(refineQtyConfezione)
  .superRefine((v, ctx) => {
    if (v.targa && !isValidTargaSconto(v.targa)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targa sconto: Sc + 5 cifre (es. Sc00001). Non usare Sc00000.",
        path: ["targa"],
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
  locale: string;
  listinoOrigineId: string | null;
  nazioni: GeoNazione[];
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
  targa: string;
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

export function mapListino(
  row: ListinoRow,
  nazioni: GeoNazione[] = []
): Listino {
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
    locale: row.locale || "it",
    listinoOrigineId: row.listino_origine_id ?? null,
    nazioni,
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
    targa: row.targa || "",
  };
}

const SCONTO_PREVIEW: Record<
  string,
  { al: (um: string, euro: string) => string; da: string; daA: string }
> = {
  it: {
    al: (um, euro) => `Al ${um} ${euro} €`,
    da: "sconto applicato per ordini da {da} €",
    daA: "sconto applicato per ordini da {da} a {a} €",
  },
  en: {
    al: (um, euro) => `Per ${um} ${euro} €`,
    da: "discount applied for orders from {da} €",
    daA: "discount applied for orders from {da} to {a} €",
  },
  de: {
    al: (um, euro) => `Pro ${um} ${euro} €`,
    da: "Rabatt für Bestellungen ab {da} €",
    daA: "Rabatt für Bestellungen von {da} bis {a} €",
  },
  fr: {
    al: (um, euro) => `Au ${um} ${euro} €`,
    da: "remise appliquée pour commandes à partir de {da} €",
    daA: "remise appliquée pour commandes de {da} à {a} €",
  },
  es: {
    al: (um, euro) => `Al ${um} ${euro} €`,
    da: "descuento aplicado para pedidos desde {da} €",
    daA: "descuento aplicado para pedidos de {da} a {a} €",
  },
  pt: {
    al: (um, euro) => `Ao ${um} ${euro} €`,
    da: "desconto aplicado para encomendas a partir de {da} €",
    daA: "desconto aplicado para encomendas de {da} a {a} €",
  },
};

export function previewScontoListino(input: {
  prezzo: number;
  scontoPct: number;
  qtyDa: number;
  qtyA: number | null;
  unitaMisura: ListinoRigaUm;
  locale?: string;
}): string | null {
  if (!Number.isFinite(input.prezzo) || input.prezzo <= 0) return null;
  if (!Number.isFinite(input.scontoPct) || input.scontoPct < 0) return null;
  const pct = Math.min(100, input.scontoPct);
  const unitario =
    Math.round(input.prezzo * (1 - pct / 100) * 100) / 100;
  const qtyDa = Number.isFinite(input.qtyDa) ? input.qtyDa : 0;
  const importoDa = Math.round(qtyDa * unitario * 100) / 100;
  const euro = (n: number) =>
    n.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const labels = SCONTO_PREVIEW[input.locale ?? "it"] ?? SCONTO_PREVIEW.it;
  const alKg = labels.al(input.unitaMisura, euro(unitario));
  if (input.qtyA == null || !Number.isFinite(input.qtyA)) {
    return `${alKg} — ${labels.da.replace("{da}", euro(importoDa))}`;
  }
  const importoA = Math.round(input.qtyA * unitario * 100) / 100;
  if (input.qtyA === input.qtyDa) {
    const q = input.qtyDa.toLocaleString("it-IT", { maximumFractionDigits: 3 });
    return `${alKg} — sconto solo per quantità ${q} ${input.unitaMisura} (ordine da ${euro(importoDa)} €)`;
  }
  return `${alKg} — ${labels.daA
    .replace("{da}", euro(importoDa))
    .replace("{a}", euro(importoA))}`;
}

export function listinoCondizioniSovrapposte(
  esistenti: Array<{ id?: string; qtyDa: number; qtyA: number | null }>,
  candidate: { id?: string; qtyDa: number; qtyA: number | null }
): boolean {
  const cEnd = candidate.qtyA ?? Number.POSITIVE_INFINITY;
  return esistenti.some((e) => {
    if (candidate.id && e.id === candidate.id) return false;
    const eEnd = e.qtyA ?? Number.POSITIVE_INFINITY;
    return candidate.qtyDa <= eEnd && e.qtyDa <= cEnd;
  });
}
