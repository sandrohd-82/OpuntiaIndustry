export type HaccpStatoGuida = "bozza" | "approvato" | "chiuso";
export type HaccpStatoVoce = "attivo" | "sospeso" | "chiuso";

export type HaccpLineaGuida = {
  id: string;
  slug: string;
  titolo: string;
  corpo: string;
  ordine: number;
  versione: number;
  stato: HaccpStatoGuida;
  updatedAt: string;
};

export type HaccpCategoria = {
  id: string;
  codice: string;
  nome: string;
  striscia: string;
  colore: string;
  coloreTesto: string;
  ordine: number;
};

export type HaccpVoce = {
  id: string;
  categoriaId: string;
  titolo: string;
  scadenzaAt: string;
  ordine: number;
  stato: HaccpStatoVoce;
};

/**
 * Tempo che manca. Da un giorno in su: giorni e ore. Sotto il giorno: ore e minuti.
 * Nel menu la forma è compatta: 1g : 11h / 3h : 16m.
 */
export function formatResiduoHaccp(
  scadenzaIso: string,
  now = Date.now(),
  opts?: { compatto?: boolean }
): string {
  const fine = new Date(scadenzaIso).getTime();
  if (!Number.isFinite(fine)) return "";
  const ms = fine - now;
  if (ms <= 0) return "scaduto";
  const minutiTotali = Math.floor(ms / 60000);
  const giorno = 24 * 60;
  const compatto = opts?.compatto === true;
  if (minutiTotali >= giorno) {
    const giorni = Math.floor(minutiTotali / giorno);
    const ore = Math.floor((minutiTotali % giorno) / 60);
    return compatto ? `${giorni}g : ${ore}h` : `${giorni} g : ${ore} h`;
  }
  const ore = Math.floor(minutiTotali / 60);
  const minuti = minutiTotali % 60;
  return compatto ? `${ore}h : ${minuti}m` : `${ore} h : ${minuti} m`;
}

/** Prima parola intera; le altre si accorciano. «Lavaggio pavimenti linea» → «Lavaggio pav. l.». */
export function abbreviaTitoloRoutine(titolo: string): string {
  const parole = titolo.trim().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return titolo.trim();
  const intero = parole.join(" ");
  if (intero.length <= 18) return intero;
  return parole
    .map((parola, index) => {
      if (index === 0) return parola;
      const nuda = parola.replace(/\.$/, "");
      if (nuda.length <= 3) return parola;
      if (index === parole.length - 1) return `${nuda.slice(0, 1)}.`;
      return `${nuda.slice(0, 3)}.`;
    })
    .join(" ");
}

export function paragrafiGuida(corpo: string): string[] {
  return corpo
    .split(/\n\s*\n/)
    .map((parte) => parte.trim())
    .filter(Boolean);
}
