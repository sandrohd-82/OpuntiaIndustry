import { z } from "zod";

export type CatalogoSettore = {
  id: string;
  slug: string;
  nome: string;
  sortOrder: number;
  attivo: boolean;
};

export type ProdottoSettore = {
  id: string;
  nome: string;
  slug: string;
};

export const createCatalogoSettoreSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Il nome del settore è obbligatorio.")
    .max(80, "Nome settore troppo lungo."),
});

export type CreateCatalogoSettoreInput = z.infer<
  typeof createCatalogoSettoreSchema
>;

export function slugSettoreFromNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "settore";
}

export function normalizeNomeSettore(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

export function formatSettoriProdotto(
  settori: Array<{ nome: string }> | undefined
): string {
  if (!settori?.length) return "—";
  return settori.map((s) => s.nome).join(", ");
}
