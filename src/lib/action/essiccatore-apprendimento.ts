/**
 * Ricetta iniziale essiccatore (seme, prima del modello persistito).
 * I campioni reali (ambiente, ventola, % bruciatore, kg, temp a 5 min)
 * richiedono tabelle ISO — da confermare prima di scriverli in DB.
 */

export const APPRENDIMENTO_FINESTRA_MIN = 5;

export const SEME_TEMP_AMBIENTE_C = 20;
export const SEME_PERC_VENTILAZIONE = 40;
export const SEME_TEMP_OBIETTIVO_C = 50;

export type RicettaInizialeAvvio = {
  tempAmbienteC: number;
  kgProdotto: number;
  percVentilazione: number;
  tempBruciatoreC: number;
  percBruciatorePrevista: number;
  fonte: "seme";
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** % apertura bruciatore di partenza, da affinare con i campioni a 5 minuti. */
export function prediciPercBruciatoreSeme(input: {
  tempAmbienteC: number;
  percVentilazione: number;
  kgProdotto: number;
  tempObiettivoC: number;
}): number {
  const delta = input.tempObiettivoC - input.tempAmbienteC;
  const caricoT = input.kgProdotto / 1000;
  const raw =
    16 + delta * 1.15 + caricoT * 7 - input.percVentilazione * 0.12;
  return clamp(Math.round(raw), 10, 85);
}

export function ricettaInizialeAvvio(input?: {
  tempAmbienteC?: number;
  kgProdotto?: number;
  percVentilazione?: number;
  tempObiettivoC?: number;
}): RicettaInizialeAvvio {
  const tempAmbienteC = input?.tempAmbienteC ?? SEME_TEMP_AMBIENTE_C;
  const kgProdotto = input?.kgProdotto ?? 0;
  const percVentilazione = input?.percVentilazione ?? SEME_PERC_VENTILAZIONE;
  const tempBruciatoreC = input?.tempObiettivoC ?? SEME_TEMP_OBIETTIVO_C;
  return {
    tempAmbienteC,
    kgProdotto,
    percVentilazione,
    tempBruciatoreC,
    percBruciatorePrevista: prediciPercBruciatoreSeme({
      tempAmbienteC,
      percVentilazione,
      kgProdotto,
      tempObiettivoC: tempBruciatoreC,
    }),
    fonte: "seme",
  };
}
