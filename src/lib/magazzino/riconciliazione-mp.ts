export type MovimentoMpSegno = {
  tipo: string;
  quantita: number;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Stesso segno della vista: scarico e uscita sottraggono, gli altri tipi usano il valore registrato. */
export function sommaMovimentiMp(movimenti: MovimentoMpSegno[]): number {
  const somma = movimenti.reduce((totale, movimento) => {
    const quantita = Number(movimento.quantita) || 0;
    const tipo = movimento.tipo.toLowerCase();
    if (tipo === "scarico" || tipo === "uscita_produzione") {
      return totale - Math.abs(quantita);
    }
    return totale + quantita;
  }, 0);
  return round3(somma);
}

export function riconciliazioneMp(
  saldoRegistrato: number,
  movimenti: MovimentoMpSegno[]
): {
  saldoRegistrato: number;
  sommaMovimenti: number;
  scostamentoNonVerificato: number;
} {
  const saldo = round3(Number(saldoRegistrato) || 0);
  const somma = sommaMovimentiMp(movimenti);
  return {
    saldoRegistrato: saldo,
    sommaMovimenti: somma,
    scostamentoNonVerificato: round3(saldo - somma),
  };
}

const UNITA = new Set(["kg", "g", "lt", "ml", "pz"]);

export function erroreUnitaMovimentoMp(input: {
  unitaAnagrafica: string | null | undefined;
  unitaRichiesta: string | null | undefined;
  unitaGiacenza: string | null | undefined;
}): string | null {
  const anagrafica = String(input.unitaAnagrafica ?? "").trim().toLowerCase();
  const richiesta = String(input.unitaRichiesta ?? "").trim().toLowerCase();
  const giacenza = String(input.unitaGiacenza ?? "").trim().toLowerCase();
  if (!UNITA.has(anagrafica)) {
    return "Unità di misura assente in anagrafica. Impostala prima di registrare il movimento.";
  }
  if (richiesta !== anagrafica) {
    return `Unità ${richiesta} diversa da quella di anagrafica (${anagrafica}). Nessuna conversione è stata applicata.`;
  }
  if (giacenza && giacenza !== anagrafica) {
    return `La giacenza è in ${giacenza} e l'anagrafica in ${anagrafica}. Il movimento è rifiutato, senza conversione.`;
  }
  return null;
}
