import { splitNumeroForFic } from "@/lib/amministrazione/fattura-emissione";
import { isNumeroFatturaEmessa } from "@/lib/amministrazione/numero-fattura";

export type FatturaNumerata = {
  numero: number;
  data: string;
};

/** Progressivo visto da Fatture in Cloud. Non riassegna la serie. */
export function progressivoVersoFic(numeroFattura: string): number | null {
  if (!isNumeroFatturaEmessa(numeroFattura)) return null;
  const split = splitNumeroForFic(numeroFattura);
  return Number.isFinite(split.number) && split.number > 0 ? split.number : null;
}

/**
 * Fatture in Cloud rifiuta un numero più alto con una data anteriore
 * a una fattura già emessa. Non converte e non sceglie un altro progressivo.
 */
export function fatturaCheBloccaData(input: {
  data: string;
  numeroPrevisto: number | null;
  esistenti: readonly FatturaNumerata[];
}): FatturaNumerata | null {
  let blocco: FatturaNumerata | null = null;
  for (const voce of input.esistenti) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(voce.data) || voce.data <= input.data) continue;
    if (input.numeroPrevisto != null && voce.numero >= input.numeroPrevisto) continue;
    if (
      !blocco ||
      voce.data > blocco.data ||
      (voce.data === blocco.data && voce.numero < blocco.numero)
    ) {
      blocco = voce;
    }
  }
  return blocco;
}

/** La data resta quella chiesta, oppure il giorno dello stacco se non è anteriore al blocco. */
export function dataEmissioneAccettabile(input: {
  richiesta: string;
  oggi: string;
  blocco: string | null;
}): string {
  if (!input.blocco || input.richiesta >= input.blocco) return input.richiesta;
  return input.oggi >= input.blocco ? input.oggi : input.blocco;
}

export function messaggioDataFatturaBloccata(blocco: FatturaNumerata): string {
  const [anno, mese, giorno] = blocco.data.split("-");
  return `Fatture in Cloud non accetta questa data: la fattura n° ${blocco.numero} del ${giorno}/${mese}/${anno} ha un numero più basso e una data successiva. La data documento deve essere il ${giorno}/${mese}/${anno} o un giorno successivo.`;
}

/** Legge il 409 di Fatture in Cloud. Null se il testo non è quel conflitto. */
export function conflittoDataDaErroreFic(testo: string): FatturaNumerata | null {
  if (!/409/.test(testo) || !/numero inferiore/i.test(testo)) return null;
  const match = testo.match(/n[°º]\s*(\d+)\s+del\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!match) return null;
  return {
    numero: Number(match[1]),
    data: `${match[4]}-${match[3]}-${match[2]}`,
  };
}
