/**
 * Costanti condivise per match codice riga / collega catalogo.
 * (Non in "use server": Next consente solo export di async function dai server actions.)
 */

/** Soglia dropdown codice riga: solo voci già salvate con affinità ≥ 70%. */
export const DROPDOWN_MATCH_THRESHOLD_PCT = 70;

/** Prima lista nella modale «Cerca codice». */
export const CERCA_MATCH_PRIMARY_PCT = 75;

/** Soglia RPC bassa: filtra in UI (≥75 / Mostra altro). */
export const CERCA_RPC_THRESHOLD = 0.25;

/** Max risultati da una chiamata RPC. */
export const CERCA_RPC_LIMIT = 80;
