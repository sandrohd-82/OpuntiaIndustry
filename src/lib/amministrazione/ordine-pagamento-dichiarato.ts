/** Quante rate risultano già pagate, per la riga dell'elenco ordini. */
export function riepilogoDilazioniPagate(
  rate: readonly { stato: string; importo: number }[]
): { pagate: number; aperte: number; importoPagato: number } {
  let pagate = 0;
  let aperte = 0;
  let importoPagato = 0;
  for (const rata of rate) {
    if (rata.stato === "pagato") {
      pagate += 1;
      importoPagato += Number(rata.importo) || 0;
    } else if (rata.stato === "da_pagare") {
      aperte += 1;
    }
  }
  return {
    pagate,
    aperte,
    importoPagato: Math.round((importoPagato + Number.EPSILON) * 100) / 100,
  };
}

/**
 * In elenco la rata si vede solo se esiste una dilazione ancora aperta.
 * Fattura saldata, anche se nata a rate, mostra solo «Saldata».
 */
export function etichettaPagamentoRiga(input: {
  pagato: boolean;
  dilazioni: { pagate: number; aperte: number; importoPagato: number } | null | undefined;
}):
  | { tipo: "saldata" }
  | { tipo: "rata"; pagate: number; aperte: number; importoPagato: number }
  | { tipo: "aperto" } {
  const dilazioni = input.dilazioni ?? null;
  const haDilazione = Boolean(
    dilazioni && dilazioni.pagate + dilazioni.aperte > 0
  );
  if (input.pagato) return { tipo: "saldata" };
  if (haDilazione && dilazioni && dilazioni.aperte === 0 && dilazioni.pagate > 0) {
    return { tipo: "saldata" };
  }
  if (haDilazione && dilazioni && dilazioni.pagate > 0 && dilazioni.aperte > 0) {
    return {
      tipo: "rata",
      pagate: dilazioni.pagate,
      aperte: dilazioni.aperte,
      importoPagato: dilazioni.importoPagato,
    };
  }
  return { tipo: "aperto" };
}

export type RataDichiarazione = {
  id: string;
  importo: number;
  stato: "pagato" | "da_pagare" | "annullata";
  dataScadenza: string;
};

/**
 * Pagamento per intero oppure di una sola rata.
 * L'importo non si digita: è il totale della fattura o l'importo della rata.
 * L'ordine risulta saldato solo quando non restano rate da pagare.
 */
export function decisionePagamentoDichiarato(input: {
  dataPagamento: string;
  fatturaTotale: number | null;
  fatturaAnnullata?: boolean;
  rate: readonly RataDichiarazione[];
  scelta: string;
}):
  | {
      ok: true;
      importo: number;
      rateDaSegnare: string[];
      saldata: boolean;
      descrizione: string;
    }
  | { ok: false; motivo: string } {
  const base = importoPagamentoDaFattura({
    dataPagamento: input.dataPagamento,
    fatturaTotale: input.fatturaTotale,
    fatturaAnnullata: input.fatturaAnnullata,
  });
  if (!base.ok) return base;
  const attive = input.rate.filter((rata) => rata.stato !== "annullata");
  const aperte = attive.filter((rata) => rata.stato === "da_pagare");
  const scelta = input.scelta.trim();
  if (scelta === "intero" || (scelta === "" && attive.length === 0)) {
    const importo = aperte.length
      ? aperte.reduce((totale, rata) => totale + rata.importo, 0)
      : base.importo;
    return {
      ok: true,
      importo,
      rateDaSegnare: aperte.map((rata) => rata.id),
      saldata: true,
      descrizione: "Fattura pagata per intero",
    };
  }
  if (attive.length === 0) {
    return {
      ok: false,
      motivo: "Non ci sono rate. Dichiara la fattura pagata per intero.",
    };
  }
  const rata = attive.find((voce) => voce.id === scelta);
  if (!rata) {
    return { ok: false, motivo: "Seleziona la fattura per intero oppure una rata." };
  }
  if (rata.stato !== "da_pagare") {
    return { ok: false, motivo: "Questa rata risulta già pagata." };
  }
  const restano = aperte.filter((voce) => voce.id !== rata.id);
  const [anno, mese, giorno] = rata.dataScadenza.slice(0, 10).split("-");
  const quando = anno && mese && giorno ? `${giorno}/${mese}/${anno}` : rata.dataScadenza;
  return {
    ok: true,
    importo: rata.importo,
    rateDaSegnare: [rata.id],
    saldata: restano.length === 0,
    descrizione: `Rata in scadenza il ${quando}`,
  };
}

/** L'importo del pagamento è il totale già scritto sulla fattura. Non si digita. */
export function importoPagamentoDaFattura(input: {
  dataPagamento: string;
  fatturaTotale: number | null;
  fatturaAnnullata?: boolean;
}): { ok: true; importo: number } | { ok: false; motivo: string } {
  const data = input.dataPagamento.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, motivo: "Indica la data di avvenuto pagamento." };
  }
  if (input.fatturaAnnullata) {
    return {
      ok: false,
      motivo: "La fattura è annullata. Il pagamento non è stato registrato.",
    };
  }
  if (input.fatturaTotale == null || !Number.isFinite(input.fatturaTotale)) {
    return {
      ok: false,
      motivo: "Manca la fattura. Nessun importo è stato inserito a mano.",
    };
  }
  if (input.fatturaTotale < 0) {
    return {
      ok: false,
      motivo: "Il totale della fattura non è utilizzabile. Il pagamento non è stato registrato.",
    };
  }
  return { ok: true, importo: input.fatturaTotale };
}
