import { z } from "zod";

export const UBICAZIONE_TIPI = ["riponibile"] as const;
export type UbicazioneTipo = (typeof UBICAZIONE_TIPI)[number];

export type MappaAreaDisegnata = {
  id: string;
  ubicazioneId: string;
  codice: string;
  nome: string;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UbicazioneElenco = {
  id: string;
  codice: string;
  nome: string;
  parentId: string | null;
  parentCodice: string | null;
  luogoNome: string;
  etichetta: string;
};

export function etichettaUbicazione(
  codice: string,
  nome: string,
  parentCodice?: string | null,
  luogoNome?: string
): string {
  const posto =
    parentCodice && !codice.toUpperCase().startsWith(parentCodice.toUpperCase())
      ? `${parentCodice}${codice}`
      : codice;
  const base = nome.trim() ? `${posto} — ${nome.trim()}` : posto;
  const luogo = (luogoNome ?? "").trim();
  return luogo ? `${luogo} · ${base}` : base;
}

export const mappaAreaInputSchema = z.object({
  id: z.string().uuid().optional(),
  ubicazioneId: z.string().uuid().optional(),
  codice: z.string().trim().min(1).max(40),
  nome: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export function codicePostoFiglio(parentCodice: string, figlio: string): string {
  const p = parentCodice.trim().toUpperCase();
  const f = figlio.trim().toUpperCase();
  if (!p) return f;
  if (f.startsWith(p)) return f;
  return `${p}${f}`;
}
