export const ACCETTAZIONE_SENIOR_STATI = [
  "non_richiesta",
  "in_attesa",
  "accettata",
  "rifiutata",
] as const;

export type AccettazioneSeniorStato = (typeof ACCETTAZIONE_SENIOR_STATI)[number];

export function parseAccettazioneSeniorStato(
  value: unknown
): AccettazioneSeniorStato {
  if (
    value === "in_attesa" ||
    value === "accettata" ||
    value === "rifiutata"
  ) {
    return value;
  }
  return "non_richiesta";
}

export function accettazioneSeniorBloccaInvio(
  stato: AccettazioneSeniorStato | null | undefined
): boolean {
  return stato === "in_attesa" || stato === "rifiutata";
}

export function labelAccettazioneSenior(
  stato: AccettazioneSeniorStato | null | undefined
): string {
  if (stato === "in_attesa") return "In attesa del senior";
  if (stato === "rifiutata") return "Rifiutato dal senior";
  if (stato === "accettata") return "Accettato dal senior";
  return "";
}
