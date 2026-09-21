import { z } from "zod";

/** Categoria: lotti comunicati all’esterno (clienti, fatture, DDT). Max 10 caratteri. */
export const LOTTO_ESTERNO_TIPI = [
  "prodotto_uscita",
  "prodotto_uscita_composito",
] as const;
export type LottoEsternoTipo = (typeof LOTTO_ESTERNO_TIPI)[number];

export const LOTTO_USCITA_RE =
  /^(0[1-9]|[1-4][0-9]|5[0-3])([0-9]{2})([0-9A-F]{6})$/;

export const VISIBILITA_CHIAVI = [
  "raccolto",
  "arrivo",
  "attesa",
  "foglio",
  "personale",
  "essiccazione",
  "parametri",
  "magazzino",
  "imballaggio",
  "spedizione",
  "lotti_interni",
  "lotti_componenti",
] as const;
export type VisibilitaChiave = (typeof VISIBILITA_CHIAVI)[number];

export const VISIBILITA_LABEL: Record<VisibilitaChiave, string> = {
  raccolto: "Raccolto (Gestionale Fornitori)",
  arrivo: "Arrivo in azienda",
  attesa: "Attesa prima della lavorazione",
  foglio: "Foglio di lavorazione",
  personale: "Personale coinvolto",
  essiccazione: "Essiccazione / aree",
  parametri: "Parametri di processo",
  magazzino: "Ingresso in magazzino",
  imballaggio: "Imballaggio",
  spedizione: "Spedizione",
  lotti_interni: "Lotti e targhe interne (FL, MP, L-)",
  lotti_componenti: "Lotti inclusi (se composito)",
};

export const VISIBILITA_DEFAULT: Record<VisibilitaChiave, boolean> = {
  raccolto: false,
  arrivo: true,
  attesa: true,
  foglio: true,
  personale: false,
  essiccazione: true,
  parametri: false,
  magazzino: true,
  imballaggio: false,
  spedizione: false,
  lotti_interni: false,
  lotti_componenti: true,
};

export type LottoEsterno = {
  id: string;
  codice: string;
  tipo: LottoEsternoTipo;
  settimana: number;
  anno: number;
  seqHex: string;
  foglioLavorazioneId: string | null;
  foglioCodice: string | null;
  prodottoCodice: string | null;
  prodottoNome: string | null;
  isComposito: boolean;
  versione: number;
  documentoStato: "bozza" | "registrato" | "chiuso";
  publicToken: string;
  publicEnabled: boolean;
  visibilita: Record<VisibilitaChiave, boolean>;
  note: string;
  generatedAt: string;
  componenti: Array<{
    id: string;
    codice: string;
    quantita: number | null;
    unita: string;
  }>;
};

export type TimelineEvento = {
  key: VisibilitaChiave;
  at: string | null;
  titolo: string;
  dettaglio: string;
  interno?: string;
  pending?: boolean;
};

export function isoWeekAndYear(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { week, year };
}

export function prefixSsaa(week: number, year: number): string {
  const ss = String(week).padStart(2, "0");
  const aa = String(year % 100).padStart(2, "0");
  return `${ss}${aa}`;
}

export function formatHex6(n: number): string {
  return Math.max(1, n).toString(16).toUpperCase().padStart(6, "0");
}

export function parseHex6(raw: string): number | null {
  if (!/^[0-9A-F]{6}$/i.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  return Number.isFinite(n) ? n : null;
}

export function composeLottoUscita(
  week: number,
  year: number,
  seq: number
): string {
  return `${prefixSsaa(week, year)}${formatHex6(seq)}`;
}

export function isValidLottoUscita(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return LOTTO_USCITA_RE.test(v);
}

export function parseLottoUscita(raw: string): {
  week: number;
  year: number;
  seqHex: string;
  seq: number;
} | null {
  const v = raw.trim().toUpperCase();
  const m = v.match(LOTTO_USCITA_RE);
  if (!m) return null;
  const week = Number(m[1]);
  const aa = Number(m[2]);
  const seqHex = m[3];
  const seq = parseHex6(seqHex);
  if (seq == null) return null;
  return { week, year: 2000 + aa, seqHex, seq };
}

export function nextSeqFromCodici(codici: string[], prefix: string): number {
  let max = 0;
  for (const raw of codici) {
    if (!raw.startsWith(prefix) || raw.length !== 10) continue;
    const n = parseHex6(raw.slice(4));
    if (n != null && n > max) max = n;
  }
  return max + 1;
}

export function mergeVisibilita(
  raw: unknown
): Record<VisibilitaChiave, boolean> {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...VISIBILITA_DEFAULT };
  for (const k of VISIBILITA_CHIAVI) {
    if (typeof src[k] === "boolean") out[k] = src[k];
  }
  return out;
}

export function publicLottoUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/public/lotto/${encodeURIComponent(token)}`;
}

export function labelTipoLottoEsterno(tipo: LottoEsternoTipo): string {
  return tipo === "prodotto_uscita_composito"
    ? "Lotto inclusivo (più lotti interni di uscita)"
    : "Lotto prodotto in uscita";
}

export const visibilitaSaveSchema = z.object({
  id: z.string().uuid(),
  visibilita: z.record(z.string(), z.boolean()),
  publicEnabled: z.boolean().optional(),
  note: z.string().max(2000).optional(),
});

export const compositoCreateSchema = z.object({
  lottiIds: z
    .array(z.string().uuid())
    .min(2, "Servono almeno due lotti per un lotto inclusivo."),
  note: z.string().max(500).optional(),
  componenti: z
    .array(
      z.object({
        lottoId: z.string().uuid(),
        quantitaKg: z.number().nonnegative(),
      })
    )
    .optional(),
});

export const lottoUscitaAnteprima = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidLottoUscita, "Lotto in uscita non valido.");
