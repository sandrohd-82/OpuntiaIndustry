import { z } from "zod";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

const ROMANI = ["I", "II", "III", "IV"] as const;

function romanoTrimestre(trim: TrimestreNumero): string {
  return ROMANI[trim - 1] ?? String(trim);
}

export const DOCUMENTAZIONE_BANCA_BUCKET = "documentazione-bancaria";
export const DOCUMENTAZIONE_BANCA_MAX_BYTES = 40 * 1024 * 1024;

export const SLOT_DOCUMENTAZIONE_BANCA = [
  {
    id: "estratto_originale_excel",
    gruppo: "estratto_conto",
    titolo: "Estratto Conto Originale (EXCEL)",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "estratto_originale_pdf",
    gruppo: "estratto_conto",
    titolo: "Estratto Conto Originale (PDF)",
    ext: "pdf",
    mime: "application/pdf",
  },
  {
    id: "estratto_unico_csv",
    gruppo: "estratto_conto",
    titolo: "Estratto Conto Unico Foglio (CSV)",
    ext: "csv",
    mime: "text/csv",
  },
  {
    id: "estratto_unico_excel",
    gruppo: "estratto_conto",
    titolo: "Estratto Conto Unico Foglio (EXCEL)",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "prospetto_originale_excel",
    gruppo: "prospetto_scalare",
    titolo: "Prospetto Scalare Originale (EXCEL)",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "prospetto_originale_pdf",
    gruppo: "prospetto_scalare",
    titolo: "Prospetto Scalare Originale (PDF)",
    ext: "pdf",
    mime: "application/pdf",
  },
] as const;

export type SlotDocumentazioneBanca =
  (typeof SLOT_DOCUMENTAZIONE_BANCA)[number]["id"];

export type GruppoDocumentazioneBanca =
  (typeof SLOT_DOCUMENTAZIONE_BANCA)[number]["gruppo"];

export const GRUPPI_DOCUMENTAZIONE_BANCA: Array<{
  id: GruppoDocumentazioneBanca;
  titolo: string;
}> = [
  { id: "estratto_conto", titolo: "Estratto Conto" },
  { id: "prospetto_scalare", titolo: "Prospetto Scalare" },
];

const SLOT_IDS = SLOT_DOCUMENTAZIONE_BANCA.map((slot) => slot.id) as [
  SlotDocumentazioneBanca,
  ...SlotDocumentazioneBanca[],
];

export const slotDocumentazioneBancariaSchema = z.enum(SLOT_IDS);

export const periodoDocumentazioneBancariaSchema = z.object({
  anno: z.number().int().min(2000).max(2100),
  trimestre: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});

export function slotDocumentazioneBancaria(id: string) {
  return SLOT_DOCUMENTAZIONE_BANCA.find((slot) => slot.id === id) ?? null;
}

export function nomeFileDocumentazioneBancaria(
  slotId: SlotDocumentazioneBanca,
  anno: number,
  trim: TrimestreNumero
): string {
  const slot = slotDocumentazioneBancaria(slotId);
  if (!slot) return "";
  return `${slot.titolo} Trimestre ${romanoTrimestre(trim)} ${anno}.${slot.ext}`;
}

export function nomeCartellaDocumentiBanca(
  anno: number,
  trim: TrimestreNumero
): string {
  return `Documenti Banca ${romanoTrimestre(trim)} Trimestre ${anno}`;
}

export function cartellaGruppoDocumentiBanca(
  gruppo: GruppoDocumentazioneBanca
): string {
  if (gruppo === "estratto_conto") return "Estratto Conto";
  return "Prospetto Scalare";
}

export function estensioneAccettata(
  slotId: SlotDocumentazioneBanca,
  fileName: string
): boolean {
  const slot = slotDocumentazioneBancaria(slotId);
  if (!slot) return false;
  return fileName.trim().toLowerCase().endsWith(`.${slot.ext}`);
}
