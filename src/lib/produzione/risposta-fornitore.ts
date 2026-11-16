export const TIPI_RISPOSTA_FORNITORE = [
  "conferma",
  "proposta",
  "indisponibilita",
  "rifiuto",
] as const;

export type TipoRispostaFornitore = (typeof TIPI_RISPOSTA_FORNITORE)[number];

export type RigaPropostaFornitore = {
  codice: string;
  quantita: number;
  unitaMisura: string;
};

export function validaRispostaFornitore(input: {
  tipo: string;
  motivazione: string;
  dataConsegna: string | null;
  righe: readonly RigaPropostaFornitore[];
}): { ok: true; motivazione: string } | { ok: false; motivo: string } {
  if (!TIPI_RISPOSTA_FORNITORE.includes(input.tipo as TipoRispostaFornitore)) {
    return { ok: false, motivo: "Tipo di risposta non valido." };
  }
  const motivazione =
    input.tipo === "conferma" && input.motivazione.trim() === ""
      ? "Conferma dell'ordine pubblicato."
      : input.motivazione.trim();
  if (motivazione.length < 3) {
    return { ok: false, motivo: "La risposta richiede una motivazione." };
  }
  if (input.tipo === "proposta" && !input.dataConsegna && input.righe.length === 0) {
    return { ok: false, motivo: "La proposta indica una data o delle quantità." };
  }
  if (input.tipo !== "proposta" && input.dataConsegna) {
    return { ok: false, motivo: "La data proposta vale solo per una modifica." };
  }
  for (const riga of input.righe) {
    if (!riga.codice.trim() || !(riga.quantita > 0)) {
      return { ok: false, motivo: "Quantità proposta non valida." };
    }
  }
  return { ok: true, motivazione };
}
