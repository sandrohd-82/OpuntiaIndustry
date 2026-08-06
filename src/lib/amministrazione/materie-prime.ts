import type { MateriaPrimaRow } from "@/types/database";

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

export function normalizeMateriaPrimaInput(
  input: MateriaPrimaInput
): MateriaPrimaInput {
  const isBio = Boolean(input.isBio);
  return {
    codice: input.codice.trim().toUpperCase(),
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
