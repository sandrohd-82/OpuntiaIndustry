/** Tempi di test (poi sostituiti da conferma IoT) */
export const MESCOLATA_TEST_MS = {
  spegnimentoBruciatore: 20_000,
  abbassamentoVentilazione: 10_000,
  riavvioBruciatore: 20_000,
  riavvioVentilazione: 10_000,
} as const;

export type MescolataStep =
  | "spegnimento_bruciatore"
  | "abbassamento_ventilazione"
  | "mescolata"
  | "esito_mescolata"
  | "riavvio"
  | "completato";

export type MescolataEsitoTone = "perfetto" | "sopra_media" | "troppo_lungo";

export type MescolataSnapshot = {
  ventilazionePercent: number;
  temperaturaImpostataC: number | null;
};

export type MescolataState = {
  essiccatoreId: string;
  step: MescolataStep;
  startedAt: string;
  snapshot: MescolataSnapshot;
  mescolataStartedAt: string | null;
  mescolataEndedAt: string | null;
  durataMescolataSec: number | null;
  esitoTone: MescolataEsitoTone | null;
  motivoNota: string;
};

export const MESCOLATA_STEP_LABELS: Record<MescolataStep, string> = {
  spegnimento_bruciatore: "1. Spegnimento bruciatore",
  abbassamento_ventilazione: "2. Abbassamento ventilazione",
  mescolata: "3. Mescolata in esecuzione",
  esito_mescolata: "3. Esito mescolata",
  riavvio: "4. Riavvio ventilazione e bruciatore",
  completato: "Processo completato",
};

export function evaluateMescolataDuration(seconds: number): {
  tone: MescolataEsitoTone;
  message: string;
} {
  // Range target test: 15–20s → perfetto; 21–30s → sopra media; >30s → troppo lungo
  if (seconds <= 20) {
    return {
      tone: "perfetto",
      message: "Tempo impiegato nel range “perfetto”",
    };
  }
  if (seconds <= 30) {
    return {
      tone: "sopra_media",
      message:
        "Tempo impiegato sopra la media, richiesto miglioramento",
    };
  }
  return {
    tone: "troppo_lungo",
    message: "Troppo tempo impiegato. Richiesto motivo",
  };
}

export function formatDurationSec(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

/** Interpolazione colore RGB */
export function lerpColor(
  from: [number, number, number],
  to: [number, number, number],
  t: number
) {
  const p = Math.min(1, Math.max(0, t));
  const r = Math.round(from[0] + (to[0] - from[0]) * p);
  const g = Math.round(from[1] + (to[1] - from[1]) * p);
  const b = Math.round(from[2] + (to[2] - from[2]) * p);
  return `rgb(${r}, ${g}, ${b})`;
}
