import {
  prezzoScontatoUnitario,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";

export type FatturaStoricoLink = {
  id: string;
  numeroInterno: string;
  dataEmissione: string;
};

export type SpedizioneIvaStoricoHint = {
  applicataInPassato: boolean;
  count: number;
  ultima: FatturaStoricoLink | null;
  fatture: FatturaStoricoLink[];
};

export type ProdottoCondizioneStorico = {
  fatturaId: string;
  numeroInterno: string;
  dataEmissione: string;
  prezzoUnitario: number;
  scontoPercentuale: number;
  prezzoNetto: number;
  quantita: number;
};

export type ProdottoPrezzoStoricoHint = {
  hasParticolari: boolean;
  condizioni: ProdottoCondizioneStorico[];
};

/** Path interno per aprire la fattura in nuova scheda. */
export function fatturaDetailPath(
  kind: FatturaKind,
  fatturaId: string
): string {
  const segment = kind === "emessa" ? "emesse" : "ricevute";
  return `/app/amministrazione/fatture/${segment}/${fatturaId}`;
}

export function prodottoStoricoKey(input: {
  prodottoId: string | null | undefined;
  codice: string | null | undefined;
}): string | null {
  if (input.prodottoId) return `id:${input.prodottoId}`;
  const codice = (input.codice ?? "").trim().toUpperCase();
  if (!codice || codice === "—") return null;
  return `cod:${codice}`;
}

/** Condizione “particolare”: sconto > 0 oppure più prezzi di listino distinti. */
export function hasCondizioniParticolari(
  condizioni: ProdottoCondizioneStorico[]
): boolean {
  if (condizioni.length === 0) return false;
  if (condizioni.some((c) => c.scontoPercentuale > 0)) return true;
  const prezzi = new Set(
    condizioni.map((c) => Number(c.prezzoUnitario).toFixed(2))
  );
  return prezzi.size > 1;
}

export function toCondizioneStorico(input: {
  fatturaId: string;
  numeroInterno: string;
  dataEmissione: string;
  prezzoUnitario: number;
  scontoPercentuale: number;
  quantita: number;
}): ProdottoCondizioneStorico {
  const sconto = Math.min(100, Math.max(0, input.scontoPercentuale));
  return {
    fatturaId: input.fatturaId,
    numeroInterno: input.numeroInterno,
    dataEmissione: input.dataEmissione,
    prezzoUnitario: input.prezzoUnitario,
    scontoPercentuale: sconto,
    prezzoNetto: prezzoScontatoUnitario(input.prezzoUnitario, sconto),
    quantita: input.quantita,
  };
}
