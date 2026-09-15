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
} as const;

export type DestinatarioPreventivoKind = "cliente" | "possibile";

export type DestinatarioPreventivo = {
  kind: DestinatarioPreventivoKind;
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  codiceTarga: string;
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
