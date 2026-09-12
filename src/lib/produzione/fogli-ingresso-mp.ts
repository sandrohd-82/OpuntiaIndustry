import { z } from "zod";

export const INGRESSO_MP_STATI = ["bozza", "registrato", "chiuso"] as const;
export type IngressoMpStato = (typeof INGRESSO_MP_STATI)[number];

export const QUANTITA_TIPI = ["reale", "stimato"] as const;
export type QuantitaTipoIngresso = (typeof QUANTITA_TIPI)[number];

export const MEZZO_FOTO_KINDS = [
  "fronte_targa",
  "laterale",
  "retro_targa",
  "cassone",
] as const;
export type MezzoFotoKind = (typeof MEZZO_FOTO_KINDS)[number];

export const MEZZO_FOTO_LABEL: Record<MezzoFotoKind, string> = {
  fronte_targa: "Fronte e targa",
  laterale: "Laterale",
  retro_targa: "Retro e targa",
  cassone: "Cassone interno",
};

export const LOTTO_MP_RE = /^[0-9]{6}[0-9A-F]{5}$/;

/** Solo la pagina Foglio Ingresso MP legge questa chiave. */
export const FOGLIO_INGRESSO_TEST_KEY =
  "opuntia.page.foglio-ingresso-mp.modalita-test";

export function prefixLottoDaData(d: Date): string {
  const gg = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aa = String(d.getFullYear() % 100).padStart(2, "0");
  return `${gg}${mm}${aa}`;
}

export function formatHex5(n: number): string {
  return Math.max(1, n).toString(16).toUpperCase().padStart(5, "0");
}

export function parseHex5(raw: string): number | null {
  if (!/^[0-9A-F]{5}$/i.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  return Number.isFinite(n) ? n : null;
}

export function composeLottoIngressoMp(prefixGgmmaa: string, seq: number): string {
  return `${prefixGgmmaa}${formatHex5(seq)}`;
}

export function nextSeqFromLotti(lotti: string[], prefix: string): number {
  let max = 0;
  for (const raw of lotti) {
    if (!raw.startsWith(prefix) || raw.length !== 11) continue;
    const n = parseHex5(raw.slice(6));
    if (n != null && n > max) max = n;
  }
  return max + 1;
}

export function isValidLottoIngressoMp(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  if (!LOTTO_MP_RE.test(v)) return false;
  const gg = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const aa = 2000 + Number(v.slice(4, 6));
  const dt = new Date(aa, mm - 1, gg);
  return dt.getFullYear() === aa && dt.getMonth() === mm - 1 && dt.getDate() === gg;
}

export function labelStatoIngresso(stato: IngressoMpStato): string {
  if (stato === "bozza") return "Bozza";
  if (stato === "registrato") return "Registrato";
  return "Chiuso";
}

export type ConfezionamentoMp = {
  id: string;
  codice: string;
  nome: string;
  labelNumero: string;
  mediaPesoKg: number | null;
  conteggioPesate: number;
};

export type MezzoIngresso = {
  id: string;
  targa: string;
  fornitoreId: string | null;
  aziendaNome: string;
  foto: Array<{ id: string; kind: MezzoFotoKind; path: string; url?: string | null }>;
};

export type ConfezioneRiga = {
  id?: string;
  confezionamentoId: string;
  quantitaConfezioni: number;
  pesoKg: number | null;
};

export type FoglioIngressoMp = {
  id: string;
  codice: string;
  lottoCodice: string | null;
  versione: number;
  documentoStato: IngressoMpStato;
  fornitoreId: string;
  fornitoreLabel: string;
  fornitoreTarga: string;
  fornitoreBio: boolean;
  materiaPrimaId: string;
  materiaPrimaLabel: string;
  isBio: boolean;
  quantita: number;
  quantitaUnita: string;
  quantitaTipo: QuantitaTipoIngresso;
  ddtProduttore: string;
  ddtData: string | null;
  ddtFilePath: string | null;
  ddtFileName: string | null;
  arrivatoAt: string;
  mezzoId: string | null;
  mezzoTarga: string | null;
  autistaContattoId: string | null;
  autistaLabel: string | null;
  scaricoMezzo: string;
  operatoreMulettoId: string | null;
  operatoreMulettoLabel: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  note: string;
  confezioni: ConfezioneRiga[];
  createdAt: string;
};

export const confezioneRigaSchema = z.object({
  id: z.string().uuid().optional(),
  confezionamentoId: z.string().uuid("Seleziona il confezionamento"),
  quantitaConfezioni: z.number().int().positive("Numero confezioni > 0"),
  pesoKg: z.number().positive().nullable().optional(),
});

export const foglioIngressoSaveSchema = z.object({
  id: z.string().uuid().optional(),
  fornitoreId: z.string().uuid("Seleziona il fornitore"),
  materiaPrimaId: z.string().uuid("Seleziona il tipo materiale"),
  isBio: z.boolean(),
  quantita: z.number().positive("Quantità maggiore di zero"),
  quantitaUnita: z.string().trim().min(1).max(8).default("kg"),
  quantitaTipo: z.enum(QUANTITA_TIPI),
  ddtProduttore: z.string().max(200).default(""),
  ddtData: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data documento DDT non valida")
      .nullable()
      .optional()
  ),
  ddtFilePath: z.string().max(500).nullable().optional(),
  ddtFileName: z.string().max(200).nullable().optional(),
  arrivatoAt: z.string().min(1, "Data e ora arrivo obbligatorie"),
  mezzoId: z.string().uuid().nullable().optional(),
  autistaContattoId: z.string().uuid().nullable().optional(),
  scaricoMezzo: z.string().trim().min(1).max(80).default("muletto"),
  operatoreMulettoId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).optional().default(""),
  confezioni: z
    .array(confezioneRigaSchema)
    .min(1, "Aggiungi almeno un confezionamento"),
});

export type FoglioIngressoSaveInput = z.infer<typeof foglioIngressoSaveSchema>;

export const nuovoFornitoreRapidoSchema = z.object({
  ragioneSociale: z.string().trim().min(2).max(200),
  partitaIva: z.string().trim().min(5).max(20),
  tipologie: z
    .array(z.enum(["servizio", "prodotto", "materia_prima", "contributo"]))
    .optional()
    .default(["materia_prima"]),
});

export const nuovoMezzoSchema = z.object({
  targa: z.string().trim().min(4).max(20),
  fornitoreId: z.string().uuid().nullable().optional(),
  aziendaNome: z.string().trim().max(200).optional().default(""),
});

export const nuovoAutistaSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  cognome: z.string().trim().min(1).max(80),
  telefono: z.string().trim().max(60).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  fornitoreId: z.string().uuid(),
  fornitoreLabel: z.string().trim().min(1).max(200),
});
