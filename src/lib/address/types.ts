export type PaeseKind = "comune" | "frazione";

export type PaeseSuggestion = {
  id: string;
  cap: string;
  /** Eventuali CAP multipli del comune (solo suggerimento). */
  caps?: string[];
  paese: string;
  citta: string;
  provincia: string;
  siglaProvincia: string;
  nazione: string;
  label: string;
  kind?: PaeseKind;
  /** Comune di appartenenza quando è una frazione. */
  comune?: string;
};

export type StreetSuggestion = {
  id: string;
  label: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  nazione: string;
};
