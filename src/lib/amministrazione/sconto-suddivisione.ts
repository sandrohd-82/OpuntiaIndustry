export const SUDDIVISIONE_STATI = [
  "non_richiesta",
  "in_attesa",
  "approvata",
  "rifiutata",
] as const;
export type SuddivisioneStato = (typeof SUDDIVISIONE_STATI)[number];

export type GradoSuddivisione = "sottoposto" | "senior" | "azienda";
export type ApprovatoreSuddivisione = "senior" | "azienda";

export type SuddivisioneInput = {
  scontoPct: number;
  attiva: boolean;
  quotaAziendaPct: number;
  quotaCommercialePct: number;
};

export type SuddivisioneRisolta = {
  attiva: boolean;
  quotaAziendaPct: number;
  quotaCommercialePct: number;
  stato: SuddivisioneStato;
  approvatore: ApprovatoreSuddivisione | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pct(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return round2(Math.min(100, value));
}

export function validaQuoteSuddivisione(
  input: SuddivisioneInput
): { ok: true; quotaAziendaPct: number; quotaCommercialePct: number } | { ok: false; error: string } {
  const sconto = pct(input.scontoPct);
  const azienda = pct(input.quotaAziendaPct);
  const commerciale = pct(input.quotaCommercialePct);
  if (!input.attiva || sconto <= 0) {
    return { ok: true, quotaAziendaPct: 0, quotaCommercialePct: sconto };
  }
  if (Math.abs(azienda + commerciale - sconto) > 0.05) {
    return {
      ok: false,
      error: `Le quote devono sommare allo sconto ${sconto.toLocaleString("it-IT")}%. Ora sono ${round2(azienda + commerciale).toLocaleString("it-IT")}%.`,
    };
  }
  return { ok: true, quotaAziendaPct: azienda, quotaCommercialePct: commerciale };
}

/**
 * Il più alto tra i coinvolti firma.
 * Commerciale sotto il Senior: firma il Senior, salvo che inserisca già il Senior o l'azienda.
 * Senior e azienda: firma l'azienda, salvo che inserisca già l'azienda.
 */
export function risolviSuddivisione(input: {
  scontoPct: number;
  attiva: boolean;
  quotaAziendaPct: number;
  quotaCommercialePct: number;
  inseritore: GradoSuddivisione;
  commercialeAssegnatoSenior: boolean;
}): { ok: true; value: SuddivisioneRisolta } | { ok: false; error: string } {
  const quote = validaQuoteSuddivisione(input);
  if (!quote.ok) return quote;
  const sconto = pct(input.scontoPct);
  if (!input.attiva || sconto <= 0 || quote.quotaAziendaPct <= 0) {
    return {
      ok: true,
      value: {
        attiva: false,
        quotaAziendaPct: 0,
        quotaCommercialePct: sconto,
        stato: "non_richiesta",
        approvatore: null,
      },
    };
  }
  const approvatore: ApprovatoreSuddivisione = input.commercialeAssegnatoSenior
    ? "azienda"
    : "senior";
  const giaApprovata =
    input.inseritore === "azienda" ||
    (approvatore === "senior" && input.inseritore === "senior");
  return {
    ok: true,
    value: {
      attiva: true,
      quotaAziendaPct: quote.quotaAziendaPct,
      quotaCommercialePct: quote.quotaCommercialePct,
      stato: giaApprovata ? "approvata" : "in_attesa",
      approvatore,
    },
  };
}

export function etichettaApprovatoreSuddivisione(
  approvatore: ApprovatoreSuddivisione | null
): string {
  if (approvatore === "azienda") return "Amministratore o Super Admin";
  if (approvatore === "senior") return "Senior della linea";
  return "";
}

/**
 * Provvigione sull'imponibile. Senza suddivisione approvata lo sconto resta
 * tutto a carico del commerciale (base = imponibile già scontato).
 * Con suddivisione approvata si reintegra solo la quota azienda.
 */
export function imponibilePerProvvigione(input: {
  imponibileNetto: number;
  scontoPct: number;
  quotaCommercialePct: number;
  suddivisioneApprovata: boolean;
}): number {
  const netto = Number.isFinite(input.imponibileNetto) ? input.imponibileNetto : 0;
  const sconto = pct(input.scontoPct);
  if (!input.suddivisioneApprovata || sconto <= 0 || sconto >= 100) {
    return round2(netto);
  }
  const lordo = netto / (1 - sconto / 100);
  const quotaComm = pct(input.quotaCommercialePct);
  return round2(lordo * (1 - quotaComm / 100));
}

export function parseSuddivisioneStato(value: unknown): SuddivisioneStato {
  if (
    value === "non_richiesta" ||
    value === "in_attesa" ||
    value === "approvata" ||
    value === "rifiutata"
  ) {
    return value;
  }
  return "non_richiesta";
}
