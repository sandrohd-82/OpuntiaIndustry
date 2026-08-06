import type { MateriaPrimaRow } from "@/types/database";

/** Codice interno: lettere (a–z, A–Z), cifre e - _ /, case-sensitive. */
export const CODICE_MATERIA_PRIMA_RE = /^[A-Za-z0-9\-_\/]+$/;

export type MateriaPrima = {
  id: string;
  codice: string;
  nome: string;
  note: string;
  isBio: boolean;
  fornitoreBioId: string | null;
  bioCertificato: string;
  bioCodice: string;
  createdAt: string;
};

export type MateriaPrimaInput = {
  codice: string;
  nome: string;
  note?: string;
  isBio?: boolean;
  fornitoreBioId?: string | null;
  bioCertificato?: string;
  bioCodice?: string;
};

export function sanitizeCodiceMateriaPrima(value: string): string {
  return value.replace(/[^A-Za-z0-9\-_\/]/g, "");
}

export function isValidCodiceMateriaPrima(codice: string): boolean {
  return CODICE_MATERIA_PRIMA_RE.test(codice) && codice.length >= 1;
}

export function normalizeMateriaPrimaInput(
  input: MateriaPrimaInput
): MateriaPrimaInput {
  const isBio = Boolean(input.isBio);
  return {
    codice: sanitizeCodiceMateriaPrima(input.codice.trim()),
    nome: input.nome.trim(),
    note: input.note?.trim() ?? "",
    isBio,
    fornitoreBioId: isBio ? input.fornitoreBioId ?? null : null,
    bioCertificato: isBio ? (input.bioCertificato?.trim() ?? "") : "",
    bioCodice: isBio ? (input.bioCodice?.trim() ?? "") : "",
  };
}

export function mapMateriaPrimaRow(row: MateriaPrimaRow): MateriaPrima {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    note: row.note ?? "",
    isBio: Boolean(row.is_bio),
    fornitoreBioId: row.fornitore_bio_id,
    bioCertificato: row.bio_certificato ?? "",
    bioCodice: row.bio_codice ?? "",
    createdAt: row.created_at,
  };
}
