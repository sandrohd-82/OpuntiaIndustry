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

/** Tempo che manca. Da un giorno in su: giorni e ore. Sotto il giorno: ore e minuti. */
export function formatResiduoHaccp(scadenzaIso: string, now = Date.now()): string {
  const fine = new Date(scadenzaIso).getTime();
  if (!Number.isFinite(fine)) return "";
  const ms = fine - now;
  if (ms <= 0) return "scaduto";
  const minutiTotali = Math.floor(ms / 60000);
  const giorno = 24 * 60;
  if (minutiTotali >= giorno) {
    const giorni = Math.floor(minutiTotali / giorno);
    const ore = Math.floor((minutiTotali % giorno) / 60);
    return `${giorni} g : ${ore} h`;
  }
  const ore = Math.floor(minutiTotali / 60);
  const minuti = minutiTotali % 60;
  return `${ore} h : ${minuti} m`;
}

export function paragrafiGuida(corpo: string): string[] {
  return corpo
    .split(/\n\s*\n/)
    .map((parte) => parte.trim())
    .filter(Boolean);
}
