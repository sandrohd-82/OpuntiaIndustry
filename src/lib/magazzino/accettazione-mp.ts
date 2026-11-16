export const VOCI_CONTROLLO_HACCP = ["mezzo", "1e", "2b", "2g", "2h"] as const;

export function puoAccettareLottoMp(input: {
  foglioStato: string | null;
  esiti: readonly { codice: string; esito: string | null }[];
}): { ok: true } | { ok: false; motivo: string } {
  if (input.foglioStato !== "chiuso") {
    return { ok: false, motivo: "Il foglio HACCP non è chiuso. La merce resta in controllo." };
  }
  const perVoce = new Map(input.esiti.map((voce) => [voce.codice, voce.esito]));
  for (const codice of VOCI_CONTROLLO_HACCP) {
    const esito = perVoce.get(codice);
    if (esito !== "conforme") {
      return {
        ok: false,
        motivo:
          esito == null
            ? "Mancano esiti dei controlli HACCP. Non vengono considerati conformi."
            : "Un controllo HACCP è non conforme. La merce resta in controllo.",
      };
    }
  }
  return { ok: true };
}
