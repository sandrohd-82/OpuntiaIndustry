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
