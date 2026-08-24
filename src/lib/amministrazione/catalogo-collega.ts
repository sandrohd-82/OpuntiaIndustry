/**
 * Costanti e helper condivisi per match codice riga / collega catalogo.
 * (Non in "use server": Next consente solo export di async function dai server actions.)
 */

import { tokenizeInvoiceLine } from "@/lib/sku-generator";

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

/**
 * Bonus massimo se il codice è già in fattura/azienda.
 * NON deve trasformare un match debole in “95–100%”.
 */
export const SAME_INVOICE_SCORE_BONUS = 3;
export const SAME_AZIENDA_SCORE_BONUS = 2;

/** Sotto questa affinità RPC non si applica alcun bonus contestuale. */
export const CONTEXT_BONUS_MIN_BASE_PCT = 55;

/**
 * Token “forti” per overlap (len≥3, non solo numeri).
 * Evita falsi 100% tra descrizioni senza parole in comune.
 */
export function significantMatchTokens(text: string): string[] {
  return tokenizeInvoiceLine(text).filter(
    (t) => t.length >= 3 && !/^\d+([.,]\d+)?$/.test(t)
  );
}

/**
 * True se almeno un token significativo della query compare in nome o codice.
 * Senza token significativi in query → non scartare (evita Cerca vuota).
 * Senza overlap → il candidato non è una corrispondenza affidabile.
 */
export function hasMeaningfulTokenOverlap(
  query: string,
  nome: string,
  codice?: string | null
): boolean {
  const qTokens = significantMatchTokens(query);
  if (qTokens.length === 0) return true;
  const hay = `${nome ?? ""} ${codice ?? ""}`.toLowerCase();
  if (!hay.trim()) return false;
  const targetTokens = new Set(significantMatchTokens(hay));
  for (const t of qTokens) {
    if (targetTokens.has(t)) return true;
    for (const u of targetTokens) {
      if (u.includes(t) || t.includes(u)) return true;
    }
    // prefisso 4+ char (abbreviazioni tipo "silic" / "silicone")
    if (t.length >= 4 && hay.includes(t.slice(0, 4))) return true;
  }
  return false;
}
