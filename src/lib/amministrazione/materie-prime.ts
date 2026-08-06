import type { MateriaPrimaRow } from "@/types/database";

export type MateriaPrima = {
  id: string;
  codice: string;
  nome: string;
  note: string;
  createdAt: string;
};

export type MateriaPrimaInput = {
  codice: string;
  nome: string;
  note?: string;
};

export function normalizeMateriaPrimaInput(
  input: MateriaPrimaInput
): MateriaPrimaInput {
  return {
    codice: input.codice.trim().toUpperCase(),
    nome: input.nome.trim(),
    note: input.note?.trim() ?? "",
  };
}

export function mapMateriaPrimaRow(row: MateriaPrimaRow): MateriaPrima {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}
