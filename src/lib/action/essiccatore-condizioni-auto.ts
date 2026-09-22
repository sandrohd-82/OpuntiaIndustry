/**
 * Condizioni di Avvio rilevate, non digitate.
 * Clima: ultima lettura TEMP-AMB / UMID-AMB (storico in DB).
 * Kg: somma carichi sul foglio di lavoro (collegamento in arrivo).
 */

export type FonteKgAvvio = "foglio" | "foglio_assente";
export type FonteClimaAvvio = "sonda" | "assente";

export type CondizioniAvvioAuto = {
  essiccatoreId: string;
  kgProdotto: number;
  kgFonte: FonteKgAvvio;
  kgNota: string;
  tempAmbienteC: number;
  umiditaAmbientePct: number;
  climaFonte: FonteClimaAvvio;
  climaLettoAt: string | null;
  climaNota: string;
};

/** Hook foglio di lavoro: oggi non c’è ancora il registro carichi cestoni. */
export function kgDaFoglioLavorazione(_essiccatoreId: string): {
  kg: number;
  fonte: FonteKgAvvio;
  nota: string;
} {
  return {
    kg: 0,
    fonte: "foglio_assente",
    nota: "Il foglio di lavoro (carichi nel cestone) non è ancora collegato. Scarico libero 0 kg.",
  };
}

export function formatCondizioniAuto(c: CondizioniAvvioAuto): string {
  const kg =
    c.kgFonte === "foglio"
      ? `${c.kgProdotto.toLocaleString("it-IT")} kg dal foglio`
      : "0 kg · foglio non collegato";
  const clima =
    c.climaFonte === "sonda"
      ? `${c.tempAmbienteC}°C / ${c.umiditaAmbientePct}% UR (sonda)`
      : "clima sonda non ancora ricevuto";
  return `${kg} · ${clima}`;
}
