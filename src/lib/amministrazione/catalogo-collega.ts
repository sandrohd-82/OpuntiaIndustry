/**
 * Costanti condivise per match codice riga / collega catalogo.
 * (Non in "use server": Next consente solo export di async function dai server actions.)
 */

/** Soglia dropdown codice riga: solo voci già salvate con affinità ≥ 70%. */
export const DROPDOWN_MATCH_THRESHOLD_PCT = 70;

/** Prima lista nella modale «Cerca codice». */
export const CERCA_MATCH_PRIMARY_PCT = 75;

/**
 * Soglia RPC «Cerca»: più alta = meno candidati GIN e risposta sotto ~1s.
 * I match deboli restano filtrabili in UI solo se già in seed dallo scan.
 */
export const CERCA_RPC_THRESHOLD = 0.35;

/** Max risultati RPC per Cerca (meno = più veloce). */
export const CERCA_RPC_LIMIT = 36;

/** Quanti candidati conservare dallo scan auto-link per aprire Cerca a 0ms. */
export const CERCA_SEED_CANDIDATES = 24;

/**
 * Auto-assegnazione codice riga fattura ricevuta:
 * solo corrispondenza catalogo al 100% e univoca.
 */
export const AUTO_LINK_EXACT_MATCH_PCT = 100;
