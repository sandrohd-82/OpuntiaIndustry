/** Durata adeguamento temperatura/ventilazione al cambio fase (test) */
export const PROCEDURE_TRANSITION_MS = 15_000;

export type ProceduraFase = {
  id: string;
  /** Numero fase mostrato in UI (1, 2, 4, 5…) */
  order: number;
  label: string;
  temperaturaC: number;
  ventilazionePercent: number;
};

export type ProceduraFaseRun = {
  faseId: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type ProcedureRunState = {
  essiccatoreId: string;
  /** Indice della fase attiva nella lista ordinata */
  activeIndex: number;
  fasi: ProceduraFaseRun[];
};

export const PROCEDURE_FASI_DEFAULT: ProceduraFase[] = [
  {
    id: "avvio",
    order: 1,
    label: "Avvio",
    temperaturaC: 40,
    ventilazionePercent: 50,
  },
  {
    id: "essiccazione",
    order: 2,
    label: "Essiccazione",
    temperaturaC: 65,
    ventilazionePercent: 100,
  },
  {
    id: "asciugatura-notturna",
    order: 4,
    label: "Asciugatura Notturna",
    temperaturaC: 55,
    ventilazionePercent: 65,
  },
  {
    id: "spegnimento",
    order: 5,
    label: "Spegnimento",
    temperaturaC: 0,
    ventilazionePercent: 100,
  },
];

export function sortProcedureFasi(fasi: ProceduraFase[]) {
  return [...fasi].sort((a, b) => a.order - b.order);
}

export function createProcedureRun(
  essiccatoreId: string,
  fasi: ProceduraFase[]
): ProcedureRunState {
  const sorted = sortProcedureFasi(fasi);
  const now = new Date().toISOString();
  return {
    essiccatoreId,
    activeIndex: 0,
    fasi: sorted.map((f, i) => ({
      faseId: f.id,
      startedAt: i === 0 ? now : null,
      endedAt: null,
    })),
  };
}

export function formatProcedureTime(iso: string | null) {
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

export function formatElapsedSince(iso: string | null, nowMs: number) {
  if (!iso) return "—";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start) || start > nowMs) return "—";
  const totalSec = Math.floor((nowMs - start) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
