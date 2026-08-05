export const PROCEDURE_TRANSITION_MS = 15_000;

export type ProceduraSalvata = {
  id: string;
  label: string;
  temperaturaC: number;
  ventilazionePercent: number;
};

export type ProceduraFaseRecord = {
  startedAt: string;
  endedAt: string | null;
};

/** Stato esecuzione procedure per un essiccatore */
export type ProcedureRunState = {
  activeId: string | null;
  /** Storia per fase (inizio/fine) */
  byId: Record<string, ProceduraFaseRecord>;
};

export const PROCEDURE_SALVATE_DEFAULT: ProceduraSalvata[] = [
  {
    id: "avvio",
    label: "Avvio",
    temperaturaC: 40,
    ventilazionePercent: 50,
  },
  {
    id: "essiccazione",
    label: "Essiccazione",
    temperaturaC: 65,
    ventilazionePercent: 100,
  },
  {
    id: "asciugatura-notturna",
    label: "Asciugatura notturna",
    temperaturaC: 55,
    ventilazionePercent: 65,
  },
  {
    id: "spegnimento",
    label: "Spegnimento",
    temperaturaC: 0,
    ventilazionePercent: 100,
  },
];

export function formatProcedureClock(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatElapsedBadge(iso: string | null, nowMs: number) {
  if (!iso) return "0s";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start) || start > nowMs) return "0s";
  const totalSec = Math.floor((nowMs - start) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
