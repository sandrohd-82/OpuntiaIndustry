export const LEAD_TARGA_PLACEHOLDER = "Pc";

export function isLeadTargaPlaceholder(targa: string): boolean {
  return targa.trim().toUpperCase() === "PC";
}

export function isCodiceTargaClienteOppureLead(value: string): boolean {
  const v = value.trim().toUpperCase();
  return /^C[0-9A-F]{3}$/.test(v) || v === "PC";
}

export type LeadPromozioneStato = "aperta" | "completata" | "annullata";

export type LeadPromozioneAperta = {
  id: string;
  leadId: string;
  ragioneSociale: string;
  partitaIva: string;
  numeroFattura: string;
  dataFattura: string | null;
  totale: number | null;
  ficId: number | null;
  fatturaEmessaId: string | null;
};
