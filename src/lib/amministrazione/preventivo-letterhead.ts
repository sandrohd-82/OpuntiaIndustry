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

/** Firma fissa in calce alla mail del preventivo e della spedizione. */
export const AGRINSICILIA_MAIL_FIRMA = `AGRINSICILIA Cooperativa agricola e sociale a.r.l.
S. leg.: G. Pacini 6, Licata 92027 ( AG )
Tel: Angelo 3208485846
P.IVA  IT03031180841
www.agrinsicilia.com`;

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

/** Primo numero del 2026 dopo l'azzeramento dei preventivi di prova. */
export const PREVENTIVO_PRIMO_NUMERO_2026 = 96;

/**
 * Numero documento visibile.
 * Fino al 31/12/2026: N/ANNO (es. 96/2026).
 * Dal 01/01/2027, in base alla data del preventivo: AA/NNN (es. 27/001).
 */
export function formatNumeroPreventivoDocumento(
  seq: number,
  year: number
): string {
  if (year >= 2027) {
    const yy = String(year % 100).padStart(2, "0");
    return `${yy}/${String(Math.trunc(seq)).padStart(3, "0")}`;
  }
  return `${Math.trunc(seq)}/${year}`;
}

/** Progressivo già usato in un numero salvato, oppure null se il formato non è dell'anno. */
export function seqDaNumeroPreventivo(
  numero: string,
  year: number
): number | null {
  const value = numero.trim();
  const pattern =
    year >= 2027
      ? new RegExp(`^${String(year % 100).padStart(2, "0")}/(\\d+)$`)
      : new RegExp(`^(\\d+)/${year}$`);
  const match = pattern.exec(value);
  if (!match?.[1]) return null;
  const seq = Number(match[1]);
  return Number.isInteger(seq) && seq > 0 ? seq : null;
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
