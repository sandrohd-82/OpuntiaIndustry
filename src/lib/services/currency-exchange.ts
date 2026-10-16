/**
 * Cambio fiscale per fatture in valuta estera.
 * Il tasso è quello BCE diffuso da Frankfurter, nel formato Banca d'Italia:
 * quante unità di valuta estera per 1 euro (es. 1 EUR = 1,0850 USD).
 * Importo fiscale EUR = importo in valuta / tasso.
 * La data del tasso è la data di emissione, oppure il giorno lavorativo
 * precedente se quel giorno il cambio non è pubblicato.
 */

export const VALUTE_FATTURA_ESTERA = [
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "TRY",
] as const;

export type FonteTassoCambio = "AUTO_ECB" | "MANUAL_OPERATOR";

export type TassoCambioFiscale = {
  valuta: string;
  /** Unità di valuta estera per 1 euro. */
  tasso: number;
  /** Giorno del listino effettivamente usato (YYYY-MM-DD). */
  dataCambio: string;
  fonte: "AUTO_ECB";
};

const GIORNI_INDIETRO = 10;

export function importoFiscaleEuro(importoValuta: number, tassoPerEuro: number): number {
  if (!(importoValuta >= 0) || !(tassoPerEuro > 0)) {
    throw new Error("Importo o tasso di cambio non valido.");
  }
  return Math.round((importoValuta / tassoPerEuro + Number.EPSILON) * 100) / 100;
}

function giornoPrima(iso: string): string {
  const data = new Date(`${iso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function tassoArrotondato(valore: number): number {
  return Math.round((valore + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/**
 * Tasso ufficiale del giorno di emissione.
 * Se il listino di quel giorno non c'è, risale fino a 10 giorni.
 * Se il servizio non risponde, l'errore va gestito con l'inserimento manuale.
 */
export async function tassoUfficialePerEuro(
  valuta: string,
  dataFattura: string
): Promise<TassoCambioFiscale> {
  const codice = valuta.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(codice)) {
    throw new Error("Valuta non valida.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataFattura)) {
    throw new Error("Data fattura non valida.");
  }
  if (codice === "EUR") {
    return { valuta: "EUR", tasso: 1, dataCambio: dataFattura, fonte: "AUTO_ECB" };
  }

  let giorno = dataFattura;
  let ultimoMessaggio = "Cambio non pubblicato per questa data.";
  for (let passo = 0; passo < GIORNI_INDIETRO; passo += 1) {
    const url = `https://api.frankfurter.app/${giorno}?from=EUR&to=${codice}`;
    let risposta: Response;
    try {
      risposta = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error(
        "Il servizio dei cambi BCE non è raggiungibile. Inserisci il tasso ufficiale a mano."
      );
    }
    if (risposta.status === 404) {
      giorno = giornoPrima(giorno);
      continue;
    }
    if (!risposta.ok) {
      throw new Error(
        "Il servizio dei cambi BCE non è raggiungibile. Inserisci il tasso ufficiale a mano."
      );
    }
    const corpo = (await risposta.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const grezzo = corpo.rates?.[codice];
    const dataListino = corpo.date ?? "";
    if (typeof grezzo === "number" && grezzo > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dataListino)) {
      if (dataListino > dataFattura) {
        giorno = giornoPrima(giorno);
        continue;
      }
      return {
        valuta: codice,
        tasso: tassoArrotondato(grezzo),
        dataCambio: dataListino,
        fonte: "AUTO_ECB",
      };
    }
    ultimoMessaggio = "Cambio non pubblicato per questa data.";
    giorno = giornoPrima(giorno);
  }
  throw new Error(ultimoMessaggio);
}
