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

export function unisciAreePiante(
  liste: MappaAreaDisegnata[][]
): MappaAreaDisegnata[] {
  const byKey = new Map<string, MappaAreaDisegnata>();
  for (const lista of liste) {
    for (const a of lista) {
      const key = a.ubicazioneId || a.id;
      if (!byKey.has(key)) byKey.set(key, a);
    }
  }
  return [...byKey.values()];
}

export function areeElencoConsultazione(aree: MappaAreaDisegnata[]): {
  id: string;
  codice: string;
  nome: string;
}[] {
  const haLivelli = aree.some((a) => a.parentId);
  const isPadre = (a: MappaAreaDisegnata) =>
    aree.some(
      (c) => c.parentId && (c.parentId === a.ubicazioneId || c.parentId === a.id)
    );
  const visibili = haLivelli ? aree.filter((a) => !isPadre(a)) : aree;
  return visibili
    .map((a) => {
      const parent = aree.find(
        (p) => p.ubicazioneId === a.parentId || p.id === a.parentId
      );
      const codice = haLivelli
        ? parent
          ? codicePostoFiglio(parent.codice, a.codice)
          : a.codice
        : letteraColonna(a.codice);
      return { id: a.ubicazioneId || a.id, codice, nome: a.nome };
    })
    .sort((a, b) => a.codice.localeCompare(b.codice, "it"));
}

function letteraColonna(codice: string): string {
  const m = codice.trim().match(/[A-Za-z]+$/);
  return (m?.[0] ?? codice).toUpperCase();
}

export function codicePostoFiglio(parentCodice: string, figlio: string): string {
  const p = parentCodice.trim().toUpperCase();
  const f = figlio.trim().toUpperCase();
  if (!p) return f;
  if (f.startsWith(p)) return f;
  return `${p}${f}`;
}
