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

/** Giorno civile in Italia, quello in cui si stacca o si emette la fattura. */
export function giornoOperazione(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * La data fattura è il giorno dell'operazione.
 * Se una fattura già emessa ha una data successiva, non si torna indietro.
 */
export function dataDelGiornoDiEmissione(input: {
  oggi: string;
  blocco: string | null;
}): string {
  if (!input.blocco || input.oggi >= input.blocco) return input.oggi;
  return input.blocco;
}

/** Conserva i giorni tra data documento e scadenza quando la data fattura si sposta. */
export function spostaScadenza(input: {
  origine: string;
  scadenza: string;
  nuova: string;
}): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(input.nuova)) return input.scadenza;
  if (!iso.test(input.scadenza)) return input.nuova;
  if (!iso.test(input.origine) || input.origine === input.nuova) {
    return input.scadenza < input.nuova ? input.nuova : input.scadenza;
  }
  const origine = Date.parse(`${input.origine}T00:00:00Z`);
  const scadenza = Date.parse(`${input.scadenza}T00:00:00Z`);
  const giorni = Math.max(0, Math.round((scadenza - origine) / 86_400_000));
  const spostata = new Date(Date.parse(`${input.nuova}T00:00:00Z`) + giorni * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return spostata < input.nuova ? input.nuova : spostata;
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
