export type DocumentoMailOrdine = "informativa" | "proforma" | "fattura";

export function bozzaMailOrdine(input: {
  documento: DocumentoMailOrdine;
  allegaPdf: boolean;
  allegaTracking: boolean;
  trackingUrl: string;
  cliente: string;
  numeroOrdine: string;
  prodotti: string;
}): { subject: string; bodyText: string } {
  const cliente = input.cliente.trim() || "Cliente";
  const ordine = input.numeroOrdine.trim();
  const ordineTesto = ordine ? ` ${ordine}` : "";
  const prodotti = input.prodotti.trim() || "i prodotti richiesti";
  const tracking = input.trackingUrl.trim();
  let trackingRiga = "";
  if (input.allegaTracking && tracking) {
    trackingRiga = `Tracking: ${tracking}`;
  } else if (input.allegaTracking) {
    trackingRiga = "Il tracking della spedizione è allegato a questa mail.";
  }
  if (input.documento === "informativa") {
    return {
      subject: `Ordine${ordineTesto} in elaborazione`,
      bodyText: righe([
        `Gentile ${cliente},`,
        "",
        `il suo ordine${ordineTesto} è in fase di elaborazione.`,
        `Voci: ${prodotti}.`,
        trackingRiga,
        "",
        "La terremo aggiornata sui passaggi successivi.",
        "",
        "Cordiali saluti,",
        "Ufficio Amministrazione",
        "Agrinsicilia Soc. Coop.",
      ]),
    };
  }
  const proforma = input.documento === "proforma";
  const titolo = proforma ? "Proforma" : "Fattura";
  const nomeDoc = proforma ? "la proforma" : "la fattura";
  const corpoAllegato = input.allegaPdf
    ? `in allegato trova ${nomeDoc} dell'ordine${ordineTesto}.`
    : `le scriviamo in merito all'ordine${ordineTesto}. ${titolo} non è allegata a questa mail.`;
  return {
    subject: input.allegaPdf
      ? `${titolo} ordine${ordineTesto}`
      : `Ordine${ordineTesto}`,
    bodyText: righe([
      `Gentile ${cliente},`,
      "",
      corpoAllegato,
      `Voci: ${prodotti}.`,
      trackingRiga,
      "",
      "Restiamo a disposizione per ogni chiarimento.",
      "",
      "Cordiali saluti,",
      "Ufficio Amministrazione",
      "Agrinsicilia Soc. Coop.",
    ]),
  };
}

function righe(parti: string[]): string {
  return parti.filter((riga) => riga !== "").join("\n");
}
