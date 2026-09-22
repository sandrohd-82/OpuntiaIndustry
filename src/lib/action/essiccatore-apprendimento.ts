/**
 * Apprendimento A+: media pesata sui campioni vicini.
 * Vicini: ambiente ±2°C, umidità ±10%, ventola ±5%, kg ±10% (min 50 kg).
 * Se nessuno, allarga ×2; se ancora nessuno, ricetta seme.
 */

export const APPRENDIMENTO_FINESTRA_MIN = 5;

export const ML_TOLLERANZE = {
  tempAmbienteC: 2,
  umiditaAmbientePct: 10,
  percVentilazione: 5,
  tempTenutaC: 3,
} as const;

export const SEME_TEMP_AMBIENTE_C = 20;
export const SEME_UMIDITA_PCT = 50;
export const SEME_PERC_VENTILAZIONE = 40;
export const SEME_TEMP_OBIETTIVO_C = 50;

export type MlCampione = {
  id: string;
  essiccatoreId: string;
  kgProdotto: number;
  tempAmbienteC: number;
  umiditaAmbientePct: number;
  percVentilazione: number;
  percBruciatore: number;
  tempObiettivoC: number;
  tempTenutaC: number;
  note: string;
};

export type CondizioneAvvio = {
  essiccatoreId?: string;
  kgProdotto: number;
  tempAmbienteC: number;
  umiditaAmbientePct: number;
  percVentilazione: number;
  tempObiettivoC: number;
};

export type MlVicino = {
  campione: MlCampione;
  peso: number;
};

export type StimaBruciatore = {
  percBruciatore: number;
  fonte: "vicini" | "vicini_allargati" | "seme";
  raggio: "stretto" | "allargato" | "nessuno";
  vicini: MlVicino[];
  spiegazione: string;
};

export type RicettaInizialeAvvio = CondizioneAvvio & {
  percBruciatorePrevista: number;
  stima: StimaBruciatore;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function tolKg(kg: number): number {
  return Math.max(50, Math.abs(kg) * 0.1);
}

function inBanda(
  campione: MlCampione,
  q: CondizioneAvvio,
  moltiplicatore: number
): boolean {
  const k = Math.max(moltiplicatore, 0.1);
  if (Math.abs(campione.tempAmbienteC - q.tempAmbienteC) > ML_TOLLERANZE.tempAmbienteC * k) {
    return false;
  }
  if (
    Math.abs(campione.umiditaAmbientePct - q.umiditaAmbientePct) >
    ML_TOLLERANZE.umiditaAmbientePct * k
  ) {
    return false;
  }
  if (
    Math.abs(campione.percVentilazione - q.percVentilazione) >
    ML_TOLLERANZE.percVentilazione * k
  ) {
    return false;
  }
  if (Math.abs(campione.kgProdotto - q.kgProdotto) > tolKg(q.kgProdotto) * k) {
    return false;
  }
  if (
    Math.abs(campione.tempTenutaC - q.tempObiettivoC) >
    ML_TOLLERANZE.tempTenutaC * k
  ) {
    return false;
  }
  if (q.essiccatoreId && campione.essiccatoreId !== q.essiccatoreId) {
    return false;
  }
  return true;
}

function pesoVicino(campione: MlCampione, q: CondizioneAvvio): number {
  const dAmb =
    Math.abs(campione.tempAmbienteC - q.tempAmbienteC) / ML_TOLLERANZE.tempAmbienteC;
  const dUr =
    Math.abs(campione.umiditaAmbientePct - q.umiditaAmbientePct) /
    ML_TOLLERANZE.umiditaAmbientePct;
  const dVent =
    Math.abs(campione.percVentilazione - q.percVentilazione) /
    ML_TOLLERANZE.percVentilazione;
  const dKg = Math.abs(campione.kgProdotto - q.kgProdotto) / tolKg(q.kgProdotto);
  const dT =
    Math.abs(campione.tempTenutaC - q.tempObiettivoC) / ML_TOLLERANZE.tempTenutaC;
  const d = dAmb + dUr + dVent + dKg + dT;
  return 1 / (0.25 + d);
}

export function prediciPercBruciatoreSeme(q: CondizioneAvvio): number {
  const delta = q.tempObiettivoC - q.tempAmbienteC;
  const caricoT = q.kgProdotto / 1000;
  const freddo = Math.max(0, 20 - q.tempAmbienteC);
  const umido = (q.umiditaAmbientePct - 50) / 10;
  const raw =
    14 +
    delta * 0.85 +
    caricoT * 8 +
    freddo * 0.45 +
    umido * 0.6 -
    q.percVentilazione * 0.08;
  return clamp(Math.round(raw), 8, 90);
}

function mediaPesata(vicini: MlVicino[]): number {
  const num = vicini.reduce((s, v) => s + v.peso * v.campione.percBruciatore, 0);
  const den = vicini.reduce((s, v) => s + v.peso, 0);
  if (den <= 0) return prediciPercBruciatoreSeme(vicini[0] ? {
    kgProdotto: vicini[0].campione.kgProdotto,
    tempAmbienteC: vicini[0].campione.tempAmbienteC,
    umiditaAmbientePct: vicini[0].campione.umiditaAmbientePct,
    percVentilazione: vicini[0].campione.percVentilazione,
    tempObiettivoC: vicini[0].campione.tempTenutaC,
  } : {
    kgProdotto: 0,
    tempAmbienteC: SEME_TEMP_AMBIENTE_C,
    umiditaAmbientePct: SEME_UMIDITA_PCT,
    percVentilazione: SEME_PERC_VENTILAZIONE,
    tempObiettivoC: SEME_TEMP_OBIETTIVO_C,
  });
  return clamp(Math.round(num / den), 8, 90);
}

export function stimaPercBruciatore(
  query: CondizioneAvvio,
  campioni: MlCampione[]
): StimaBruciatore {
  const attivi = campioni.filter((c) =>
    query.essiccatoreId ? c.essiccatoreId === query.essiccatoreId : true
  );

  const raccogli = (k: number) =>
    attivi
      .filter((c) => inBanda(c, query, k))
      .map((campione) => ({ campione, peso: pesoVicino(campione, query) }))
      .sort((a, b) => b.peso - a.peso);

  const stretti = raccogli(1);
  if (stretti.length) {
    const perc = mediaPesata(stretti);
    return {
      percBruciatore: perc,
      fonte: "vicini",
      raggio: "stretto",
      vicini: stretti,
      spiegazione: `Media di ${stretti.length} cicli vicini (ambiente ±2°C, UR ±10%, ventola ±5%, kg ±10%, temp ±3°C) → ${perc}% bruciatore.`,
    };
  }

  const larghi = raccogli(2);
  if (larghi.length) {
    const perc = mediaPesata(larghi);
    return {
      percBruciatore: perc,
      fonte: "vicini_allargati",
      raggio: "allargato",
      vicini: larghi,
      spiegazione: `Nessun vicino stretto: media su ${larghi.length} cicli con raggio doppio → ${perc}% bruciatore.`,
    };
  }

  const perc = prediciPercBruciatoreSeme(query);
  return {
    percBruciatore: perc,
    fonte: "seme",
    raggio: "nessuno",
    vicini: [],
    spiegazione: `Nessun campione abbastanza vicino. Ricetta seme ${perc}% (da affinare dopo 5 minuti).`,
  };
}

/** Campioni didattici = quelli in migrazione (esempio Wiki). */
export const CAMPIONI_DIDATTICI: MlCampione[] = [
  { id: "d1", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 100, percBruciatore: 20, tempObiettivoC: 60, tempTenutaC: 60, note: "estate vuoto 60°" },
  { id: "d2", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 90, percBruciatore: 30, tempObiettivoC: 70, tempTenutaC: 70, note: "estate vuoto 70°" },
  { id: "d3", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 100, percBruciatore: 10, tempObiettivoC: 35, tempTenutaC: 35, note: "estate vuoto 35°" },
  { id: "d4", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 70, percBruciatore: 12, tempObiettivoC: 40, tempTenutaC: 40, note: "estate vuoto 40°/70%" },
  { id: "d5", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 100, percBruciatore: 32, tempObiettivoC: 60, tempTenutaC: 60, note: "inverno vuoto 60°" },
  { id: "d6", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 90, percBruciatore: 42, tempObiettivoC: 70, tempTenutaC: 70, note: "inverno vuoto 70°" },
  { id: "d7", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 100, percBruciatore: 22, tempObiettivoC: 35, tempTenutaC: 35, note: "inverno vuoto 35°" },
  { id: "d8", essiccatoreId: "ess-a", kgProdotto: 0, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 70, percBruciatore: 20, tempObiettivoC: 40, tempTenutaC: 40, note: "inverno vuoto 40°/70%" },
  { id: "d9", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 100, percBruciatore: 38, tempObiettivoC: 60, tempTenutaC: 60, note: "estate tappo 60°" },
  { id: "d10", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 90, percBruciatore: 48, tempObiettivoC: 70, tempTenutaC: 70, note: "estate tappo 70°" },
  { id: "d11", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 100, percBruciatore: 28, tempObiettivoC: 35, tempTenutaC: 35, note: "estate tappo 35°" },
  { id: "d12", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 35, umiditaAmbientePct: 40, percVentilazione: 70, percBruciatore: 26, tempObiettivoC: 40, tempTenutaC: 40, note: "estate tappo 40°/70%" },
  { id: "d13", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 100, percBruciatore: 50, tempObiettivoC: 60, tempTenutaC: 60, note: "inverno tappo 60°" },
  { id: "d14", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 90, percBruciatore: 58, tempObiettivoC: 70, tempTenutaC: 70, note: "inverno tappo 70°" },
  { id: "d15", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 100, percBruciatore: 40, tempObiettivoC: 35, tempTenutaC: 35, note: "inverno tappo 35°" },
  { id: "d16", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 75, percBruciatore: 28, tempObiettivoC: 42, tempTenutaC: 42, note: "inverno tappo 42°/75%" },
  { id: "d17", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 65, percBruciatore: 24, tempObiettivoC: 38, tempTenutaC: 38, note: "inverno tappo 38°/65%" },
  { id: "d18", essiccatoreId: "ess-a", kgProdotto: 2000, tempAmbienteC: 5, umiditaAmbientePct: 70, percVentilazione: 70, percBruciatore: 26, tempObiettivoC: 40, tempTenutaC: 40, note: "inverno tappo 40°/70%" },
];

export function ricettaInizialeAvvio(
  input?: Partial<CondizioneAvvio>,
  campioni: MlCampione[] = CAMPIONI_DIDATTICI
): RicettaInizialeAvvio {
  const query: CondizioneAvvio = {
    essiccatoreId: input?.essiccatoreId,
    kgProdotto: input?.kgProdotto ?? 0,
    tempAmbienteC: input?.tempAmbienteC ?? SEME_TEMP_AMBIENTE_C,
    umiditaAmbientePct: input?.umiditaAmbientePct ?? SEME_UMIDITA_PCT,
    percVentilazione: input?.percVentilazione ?? SEME_PERC_VENTILAZIONE,
    tempObiettivoC: input?.tempObiettivoC ?? SEME_TEMP_OBIETTIVO_C,
  };
  const stima = stimaPercBruciatore(query, campioni);
  return {
    ...query,
    percBruciatorePrevista: stima.percBruciatore,
    stima,
  };
}

/** Esempio Wiki: 40°C, ventola 70%, 2000 kg, aria 5°C / 70% UR. */
export const ESEMPIO_COMANDO_WIKI: CondizioneAvvio = {
  essiccatoreId: "ess-a",
  kgProdotto: 2000,
  tempAmbienteC: 5,
  umiditaAmbientePct: 70,
  percVentilazione: 70,
  tempObiettivoC: 40,
};
