import {
  composeLottoAgrinsicilia,
  parseLottoAgrinsicilia,
} from "@/lib/magazzino/lotto-agrinsicilia";

export function puoMovimentareEffettoMagazzino(input: {
  tipo: string;
  unita: string;
  unitaProdotto: string | null;
  codice: string;
  lotto: string;
  quantita: number;
}): { ok: true; lotto: string; unita: "kg" | "lt" | "pz" } | { ok: false; motivo: string } {
  if (input.tipo !== "magazzino.produce" && input.tipo !== "magazzino.consuma") {
    return { ok: true, lotto: "", unita: "kg" };
  }
  if (!(input.quantita > 0) || input.quantita > 1_000_000) {
    return { ok: false, motivo: "Quantità non valida." };
  }
  const unita = input.unita.trim().toLowerCase();
  if (unita !== "kg" && unita !== "lt" && unita !== "pz") {
    return { ok: false, motivo: "Unità diversa. Nessuna conversione è stata applicata." };
  }
  const unitaProdotto = (input.unitaProdotto ?? "").trim().toLowerCase();
  if (unitaProdotto && unitaProdotto !== unita) {
    return { ok: false, motivo: "Unità diversa. Nessuna conversione è stata applicata." };
  }
  const codice = input.codice.trim();
  const parti = parseLottoAgrinsicilia(input.lotto);
  if (!parti) {
    return {
      ok: false,
      motivo: "Manca il lotto Agrinsicilia. Nessun carico è stato creato.",
    };
  }
  if (parti.targaProdotto.toLowerCase() !== codice.toLowerCase()) {
    return { ok: false, motivo: "La targa del lotto non coincide con il prodotto." };
  }
  const lotto = composeLottoAgrinsicilia({ ...parti, targaProdotto: codice });
  if (!lotto) {
    return {
      ok: false,
      motivo: "Manca il lotto Agrinsicilia. Nessun carico è stato creato.",
    };
  }
  return { ok: true, lotto, unita };
}

/** Il codice usato è quello archiviato. Maiuscole diverse non creano un altro prodotto. */
export function codiceProdottoArchiviato(
  digitato: string,
  archiviati: readonly string[]
): { ok: true; codice: string } | { ok: false; motivo: string } {
  const testo = digitato.trim();
  if (!testo) return { ok: false, motivo: "Prodotto non trovato." };
  const esatto = archiviati.find((codice) => codice === testo);
  if (esatto) return { ok: true, codice: esatto };
  const simili = archiviati.filter(
    (codice) => codice.toLowerCase() === testo.toLowerCase()
  );
  if (simili.length === 1) return { ok: true, codice: simili[0] };
  if (simili.length > 1) {
    return { ok: false, motivo: "Il codice prodotto non è univoco." };
  }
  return { ok: false, motivo: "Prodotto non trovato." };
}

export function meseNelCoefficiente(mese: number, da: number, a: number): boolean {
  if (da <= a) return mese >= da && mese <= a;
  return mese >= da || mese <= a;
}
