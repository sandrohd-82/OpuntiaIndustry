import type { SedeCliente } from "@/lib/amministrazione/clienti";

/** Intestazione fissa del preventivo PDF (documento commerciale ISO). */
export const AGRINSICILIA_LETTERHEAD = {
  logoSrc: "/Agrinsicilia-Coop.png",
  logoAlt: "Agrinsicilia Coop",
  ragioneSociale:
    "AGRINSICILIA SOCIETA' COOPERATIVA AGRICOLA E SOCIALE A.R.L.",
  indirizzo: "Via Giovanni Pacini, 6 - 92027 - Licata (AG)",
  partitaIva: "03031180841",
  codiceFiscale: "03031180841",
  sito: "www.agrinsicilia.com",
  email: "info@agrinsicilia.com",
  cell: "+393208485846",
} as const;

export const OPUNTIA_ITALIA_LOGO = {
  src: "/OpuntiaItalia.png",
  alt: "Opuntia Italia",
} as const;

export type CoordinateBancarieAgrinsicilia = {
  banca: string;
  iban: string;
  bic: string;
  intestatario: string;
};

/** Coordinate ufficiali bonifico preventivo / fattura. */
export const AGRINSICILIA_COORDINATE: CoordinateBancarieAgrinsicilia = {
  banca: "BCC Don Rizzo Menfi",
  iban: "IT50L0894682990000000753139",
  bic: "ICRAITRRQA0",
  intestatario: AGRINSICILIA_LETTERHEAD.ragioneSociale,
};

export function coordinateBancarieFallback(): CoordinateBancarieAgrinsicilia {
  return {
    banca: (process.env.AGRINSICILIA_BANCA ?? AGRINSICILIA_COORDINATE.banca).trim(),
    iban: (
      process.env.AGRINSICILIA_IBAN ?? AGRINSICILIA_COORDINATE.iban
    )
      .replace(/\s+/g, "")
      .toUpperCase(),
    bic: (process.env.AGRINSICILIA_BIC ?? AGRINSICILIA_COORDINATE.bic)
      .replace(/\s+/g, "")
      .toUpperCase(),
    intestatario: AGRINSICILIA_LETTERHEAD.ragioneSociale,
  };
}

export type DestinatarioPreventivoKind = "cliente" | "possibile";

export type DestinatarioPreventivo = {
  kind: DestinatarioPreventivoKind;
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  codiceTarga: string;
  email: string;
  sede: SedeCliente;
};

export function formatPreventivoDataIt(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function yearFromPreventivoData(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4));
  return Number.isFinite(year) && year >= 2000
    ? year
    : new Date().getFullYear();
}

/** Numero documento visibile: N/ANNO (es. 12/2026). */
export function formatNumeroPreventivoDocumento(
  seq: number,
  year: number
): string {
  return `${seq}/${year}`;
}

export function formatDestinatarioIndirizzo(sede: SedeCliente): {
  via: string;
  capCitta: string;
} {
  const via = sede.indirizzo.trim();
  const cap = sede.cap.trim();
  const citta = sede.citta.trim().toUpperCase();
  const prov = sede.provincia.trim().toUpperCase();
  const loc = citta && prov ? `${citta} (${prov})` : citta || prov;
  const capCitta = [cap, loc].filter(Boolean).join(" ");
  return { via, capCitta };
}
