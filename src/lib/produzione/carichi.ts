import type { SoggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso";

export type RigaBilancioCarico = {
  materiaPrimaId: string;
  codice: string;
  unitaMisura: string;
  ordinata: number;
  ricevuta: number;
  residua: number;
  oltre: boolean;
};

/** La presa visione non è una consegna. */
export function presaVisioneConsegna(): boolean {
  return false;
}

export function puoGestireCarico(soggetto: Pick<SoggettoAccessoFornitore, "superadmin" | "aree">): boolean {
  return soggetto.superadmin || soggetto.aree.includes("produzione");
}

/**
 * Ogni riga di carico conta una sola volta, anche se l'elenco la ripete.
 * Il residuo può essere negativo: è la differenza, non una modifica dello snapshot.
 */
export function bilancioCarichi(input: {
  ordinate: readonly {
    materiaPrimaId: string;
    codice: string;
    unitaMisura: string;
    quantita: number;
  }[];
  arrivi: readonly { rigaId: string; materiaPrimaId: string; quantita: number }[];
}): RigaBilancioCarico[] {
  const ricevute = new Map<string, number>();
  const viste = new Set<string>();
  for (const arrivo of input.arrivi) {
    if (viste.has(arrivo.rigaId)) continue;
    viste.add(arrivo.rigaId);
    ricevute.set(
      arrivo.materiaPrimaId,
      (ricevute.get(arrivo.materiaPrimaId) ?? 0) + arrivo.quantita
    );
  }
  return input.ordinate.map((riga) => {
    const ricevuta = ricevute.get(riga.materiaPrimaId) ?? 0;
    return {
      materiaPrimaId: riga.materiaPrimaId,
      codice: riga.codice,
      unitaMisura: riga.unitaMisura,
      ordinata: riga.quantita,
      ricevuta,
      residua: riga.quantita - ricevuta,
      oltre: ricevuta > riga.quantita,
    };
  });
}

/**
 * Il ricevuto di una versione è solo quello dei carichi collegati a quella versione.
 * Una quantità non ancora registrata non vale zero. Una consegna vecchia non passa alla versione nuova.
 */
export function bilancioVersione(input: {
  versioneId: string;
  ordinate: readonly {
    materiaPrimaId: string;
    codice: string;
    unitaMisura: string;
    quantita: number;
  }[];
  carichi: readonly {
    versioneId: string;
    righe: readonly { rigaId: string; materiaPrimaId: string; quantita: number | null }[];
  }[];
}): RigaBilancioCarico[] {
  const arrivi: { rigaId: string; materiaPrimaId: string; quantita: number }[] = [];
  for (const carico of input.carichi) {
    if (carico.versioneId !== input.versioneId) continue;
    for (const riga of carico.righe) {
      if (riga.quantita == null) continue;
      arrivi.push({
        rigaId: riga.rigaId,
        materiaPrimaId: riga.materiaPrimaId,
        quantita: riga.quantita,
      });
    }
  }
  return bilancioCarichi({ ordinate: input.ordinate, arrivi });
}
