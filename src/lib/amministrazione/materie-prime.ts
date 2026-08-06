import type { MateriaPrimaRow } from "@/types/database";

/** Prefisso fisso del codice interno (come F per i fornitori). */
export const CODICE_MATERIA_PRIMA_PREFIX = "Mp";

/** Codice completo: Mp + corpo (lettere, cifre, - _ /), case-sensitive. */
export const CODICE_MATERIA_PRIMA_RE = /^Mp[A-Za-z0-9\-_\/]+$/;

const BODY_RE = /[^A-Za-z0-9\-_\/]/g;

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

export function sanitizeCodiceMateriaPrimaBody(value: string): string {
  let body = value.replace(BODY_RE, "");
  // Evita che l'utente ridigiti il prefisso nel corpo
  while (body.startsWith(CODICE_MATERIA_PRIMA_PREFIX)) {
    body = body.slice(CODICE_MATERIA_PRIMA_PREFIX.length);
  }
  if (body.length >= 2 && body.slice(0, 2).toLowerCase() === "mp") {
    body = body.slice(2);
  }
  return body;
}

export function composeCodiceMateriaPrima(body: string): string {
  return (
    CODICE_MATERIA_PRIMA_PREFIX + sanitizeCodiceMateriaPrimaBody(body)
  );
}

export function stripCodiceMateriaPrimaPrefix(codice: string): string {
  if (codice.startsWith(CODICE_MATERIA_PRIMA_PREFIX)) {
    return codice.slice(CODICE_MATERIA_PRIMA_PREFIX.length);
  }
  if (codice.length >= 2 && codice.slice(0, 2).toLowerCase() === "mp") {
    return codice.slice(2);
  }
  return codice;
}

/** Normalizza un codice completo forzando il prefisso Mp. */
export function sanitizeCodiceMateriaPrima(value: string): string {
  return composeCodiceMateriaPrima(stripCodiceMateriaPrimaPrefix(value.trim()));
}

export function isValidCodiceMateriaPrima(codice: string): boolean {
  return CODICE_MATERIA_PRIMA_RE.test(codice);
}

export function normalizeMateriaPrimaInput(
  input: MateriaPrimaInput
): MateriaPrimaInput {
  const isBio = Boolean(input.isBio);
  return {
    codice: sanitizeCodiceMateriaPrima(input.codice),
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
