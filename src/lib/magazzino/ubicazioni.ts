import { z } from "zod";

export const UBICAZIONE_TIPI = ["riponibile"] as const;
export type UbicazioneTipo = (typeof UBICAZIONE_TIPI)[number];

export const UBICAZIONE_OCCUPAZIONI = ["libero", "occupato"] as const;
export type UbicazioneOccupazione = (typeof UBICAZIONE_OCCUPAZIONI)[number];

export const UBICAZIONE_OCCUPAZIONE_LABEL: Record<
  UbicazioneOccupazione,
  string
> = {
  libero: "Libero",
  occupato: "Occupato",
};

export const UBICAZIONE_MISURA_UNITA = ["cm", "m"] as const;
export type UbicazioneMisuraUnita = (typeof UBICAZIONE_MISURA_UNITA)[number];

export type UbicazioneCapienza = {
  pesoMaxKg: number | null;
  misuraUnita: UbicazioneMisuraUnita;
  maxLarghezza: number | null;
  maxProfondita: number | null;
  maxAltezza: number | null;
  minLarghezza: number | null;
  minProfondita: number | null;
  minAltezza: number | null;
  occupazione: UbicazioneOccupazione;
};

export const CAPIENZA_DEFAULT: UbicazioneCapienza = {
  pesoMaxKg: null,
  misuraUnita: "cm",
  maxLarghezza: null,
  maxProfondita: null,
  maxAltezza: null,
  minLarghezza: null,
  minProfondita: null,
  minAltezza: null,
  occupazione: "libero",
};

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
} & Partial<UbicazioneCapienza>;

export type UbicazioneElenco = {
  id: string;
  codice: string;
  nome: string;
  parentId: string | null;
  parentCodice: string | null;
  luogoNome: string;
  etichetta: string;
  mappaOrigineId?: string | null;
  vistaOrigine?: string;
  /** Viste (fogli) dove questo posto è disegnato. */
  visteDisegno?: string[];
  /** Id fogli dove questo posto è disegnato (Dentro usa gli altri fogli). */
  mappeDisegno?: string[];
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

function numOpz(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parseOccupazione(v: unknown): UbicazioneOccupazione {
  return v === "occupato" ? "occupato" : "libero";
}

export function parseMisuraUnita(v: unknown): UbicazioneMisuraUnita {
  return v === "m" ? "m" : "cm";
}

export function capienzaDaRiga(u: {
  peso_max_kg?: unknown;
  misura_unita?: unknown;
  misura_max_larghezza?: unknown;
  misura_max_profondita?: unknown;
  misura_max_altezza?: unknown;
  misura_min_larghezza?: unknown;
  misura_min_profondita?: unknown;
  misura_min_altezza?: unknown;
  occupazione_stato?: unknown;
} | null | undefined): UbicazioneCapienza {
  if (!u) return { ...CAPIENZA_DEFAULT };
  return {
    pesoMaxKg: numOpz(u.peso_max_kg),
    misuraUnita: parseMisuraUnita(u.misura_unita),
    maxLarghezza: numOpz(u.misura_max_larghezza),
    maxProfondita: numOpz(u.misura_max_profondita),
    maxAltezza: numOpz(u.misura_max_altezza),
    minLarghezza: numOpz(u.misura_min_larghezza),
    minProfondita: numOpz(u.misura_min_profondita),
    minAltezza: numOpz(u.misura_min_altezza),
    occupazione: parseOccupazione(u.occupazione_stato),
  };
}

export function capienzaDi(
  a: Partial<UbicazioneCapienza> | null | undefined
): UbicazioneCapienza {
  return {
    pesoMaxKg: a?.pesoMaxKg ?? null,
    misuraUnita: a?.misuraUnita === "m" ? "m" : "cm",
    maxLarghezza: a?.maxLarghezza ?? null,
    maxProfondita: a?.maxProfondita ?? null,
    maxAltezza: a?.maxAltezza ?? null,
    minLarghezza: a?.minLarghezza ?? null,
    minProfondita: a?.minProfondita ?? null,
    minAltezza: a?.minAltezza ?? null,
    occupazione: a?.occupazione === "occupato" ? "occupato" : "libero",
  };
}

/** True se il posto ha almeno un valore di capienza impostato. */
export function postoHaSettaggi(
  a: Partial<UbicazioneCapienza> | null | undefined
): boolean {
  const c = capienzaDi(a);
  return (
    c.pesoMaxKg != null ||
    c.maxLarghezza != null ||
    c.maxProfondita != null ||
    c.maxAltezza != null ||
    c.minLarghezza != null ||
    c.minProfondita != null ||
    c.minAltezza != null
  );
}

export type FonteSettaggioPosto = {
  ubicazioneId: string;
  nome: string;
  capienza: UbicazioneCapienza;
};

export function applicaCapienza(
  area: MappaAreaDisegnata,
  c: UbicazioneCapienza
): MappaAreaDisegnata {
  return { ...area, ...c };
}

/** Stesso posto su altre viste + padre + figli (non i fratelli). */
export function idsUbicazioniCollegate(
  aree: Array<{ ubicazioneId: string; parentId: string | null }>,
  pivotId: string | null
): Set<string> {
  const out = new Set<string>();
  if (!pivotId) return out;
  out.add(pivotId);
  const pivot = aree.find((a) => a.ubicazioneId === pivotId);
  if (pivot?.parentId) out.add(pivot.parentId);
  const coda = [pivotId];
  while (coda.length) {
    const id = coda.pop()!;
    for (const a of aree) {
      if (a.parentId === id && a.ubicazioneId && !out.has(a.ubicazioneId)) {
        out.add(a.ubicazioneId);
        coda.push(a.ubicazioneId);
      }
    }
  }
  return out;
}

export function stileAreaPosto(opts: {
  occupazione: UbicazioneOccupazione;
  accesa: boolean;
  primaria?: boolean;
}): { fill: string; stroke: string; text: string; strokeWidth: number } {
  const primaria = Boolean(opts.primaria);
  if (opts.occupazione === "occupato") {
    return {
      fill: opts.accesa ? "rgba(20,83,45,0.78)" : "rgba(21,128,61,0.52)",
      stroke: opts.accesa ? "#052e16" : "#14532d",
      text: opts.accesa ? "#ecfdf5" : "#14532d",
      strokeWidth: primaria ? 3.4 : opts.accesa ? 2.6 : 1.6,
    };
  }
  return {
    fill: opts.accesa ? "rgba(45,212,191,0.48)" : "rgba(13,148,136,0.12)",
    stroke: opts.accesa ? "#0f766e" : "#0d9488",
    text: "#134e4a",
    strokeWidth: primaria ? 3.2 : opts.accesa ? 2.4 : 1.6,
  };
}

const misuraOpz = z
  .union([z.number().positive().max(100000), z.null()])
  .optional();

export const aggiornaUbicazioneCapienzaSchema = z
  .object({
    ubicazioneId: z.string().uuid(),
    pesoMaxKg: misuraOpz,
    misuraUnita: z.enum(UBICAZIONE_MISURA_UNITA).default("cm"),
    maxLarghezza: misuraOpz,
    maxProfondita: misuraOpz,
    maxAltezza: misuraOpz,
    minLarghezza: misuraOpz,
    minProfondita: misuraOpz,
    minAltezza: misuraOpz,
  })
  .superRefine((v, ctx) => {
    const coppie: Array<[number | null | undefined, number | null | undefined, string]> =
      [
        [v.minLarghezza, v.maxLarghezza, "larghezza"],
        [v.minProfondita, v.maxProfondita, "profondità"],
        [v.minAltezza, v.maxAltezza, "altezza"],
      ];
    for (const [min, max, nome] of coppie) {
      if (min != null && max != null && min > max) {
        ctx.addIssue({
          code: "custom",
          message: `La misura minima di ${nome} non può superare la massima.`,
        });
      }
    }
  });

export type AggiornaUbicazioneCapienzaInput = z.infer<
  typeof aggiornaUbicazioneCapienzaSchema
>;

export const mappaAreaInputSchema = z.object({
  id: z.string().uuid().optional(),
  ubicazioneId: z.string().uuid().optional(),
  /** Solo remap parent in importo: non è l'identità da aggiornare. */
  copiaDaUbicazioneId: z.string().uuid().optional(),
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
  occupazione: UbicazioneOccupazione;
  haSettaggi: boolean;
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
      return {
        id: a.ubicazioneId || a.id,
        codice,
        nome: a.nome,
        occupazione: capienzaDi(a).occupazione,
        haSettaggi: postoHaSettaggi(a),
      };
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

/** Anteprima posizione operativa (colonna + ripiano), es. A + 1 → A1. */
export function previewPosizioneOperativa(
  parentCodice: string,
  codiceInserito: string
): string {
  return codicePostoFiglio(parentCodice, codiceInserito);
}

/** Dal posto A1 e madre A torna il codice locale (1) per il campo editor. */
export function codiceLocaleDi(operativo: string, parentCodice: string): string {
  const p = parentCodice.trim().toUpperCase();
  const o = operativo.trim().toUpperCase();
  if (p && o.startsWith(p) && o.length > p.length) return o.slice(p.length);
  return o;
}

/**
 * Codice locale quando si cambia colonna (D1 + padre D → 1, poi E → E1).
 * Evita di produrre ED1 se il campo ha ancora il codice operativo vecchio.
 */
export function localePerNuovoParent(
  codiceInserito: string,
  parentVecchioCodice: string | null | undefined,
  parentNuovoCodice: string | null | undefined
): string {
  const c = codiceInserito.trim().toUpperCase();
  const nuovo = (parentNuovoCodice ?? "").trim().toUpperCase();
  const vecchio = (parentVecchioCodice ?? "").trim().toUpperCase();
  if (nuovo && c.startsWith(nuovo) && c.length > nuovo.length) {
    return c.slice(nuovo.length);
  }
  if (vecchio && c.startsWith(vecchio) && c.length > vecchio.length) {
    return c.slice(vecchio.length);
  }
  return c;
}
