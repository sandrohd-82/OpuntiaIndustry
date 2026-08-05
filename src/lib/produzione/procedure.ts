import type {
  Essiccatore,
  EssiccatoreFase,
  EssiccatorePower,
} from "@/lib/produzione/essiccatori";

export const PROCEDURE_TRANSITION_MS = 15_000;

/** Kg prodotto demo all'avvio se ancora non caricato */
const PRODOTTO_DEFAULT_KG = 2000;

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

function faseFromProcedura(proc: ProceduraSalvata): EssiccatoreFase {
  switch (proc.id) {
    case "avvio":
      return "avvio";
    case "essiccazione":
      return "essiccazione";
    case "asciugatura-notturna":
      return "asciugatura_notturna";
    case "spegnimento":
      return "spegnimento";
    default: {
      const label = proc.label.toLowerCase();
      if (label.includes("avvio")) return "avvio";
      if (label.includes("partenza")) return "partenza";
      if (label.includes("essicc")) return "essiccazione";
      if (label.includes("notturn")) return "asciugatura_notturna";
      if (label.includes("spegn")) return "spegnimento";
      if (label.includes("raffredd")) return "raffreddamento";
      return "essiccazione";
    }
  }
}

function powerFromProcedura(_proc: ProceduraSalvata): EssiccatorePower {
  // Procedure operative: essiccatore acceso (anche in spegnimento con ventola attiva)
  return "acceso";
}

/**
 * Applica una procedura salvata ai parametri live dell'essiccatore.
 * (Finché non c'è DB: aggiornamento locale coerente con la fase scelta.)
 */
export function applyProceduraToEssiccatore(
  ess: Essiccatore,
  proc: ProceduraSalvata,
  atIso: string = new Date().toISOString()
): Essiccatore {
  const fase = faseFromProcedura(proc);
  const power = powerFromProcedura(proc);
  const wasOff = ess.power === "spento" || !ess.accesoDal;
  const tempImpostata = proc.temperaturaC;
  // Rilevata vicino al set-point (leggero ritardo termico demo)
  const tempRilevata =
    tempImpostata <= 0
      ? Math.max(0, (ess.temperaturaRilevataC ?? 20) * 0.4)
      : Math.round((tempImpostata - 2.5) * 10) / 10;

  return {
    ...ess,
    power,
    fase,
    condizione: "regolare",
    temperaturaImpostataC: tempImpostata,
    temperaturaRilevataC: tempRilevata,
    temperaturaAggiornataIl: atIso,
    ventilazionePercent: proc.ventilazionePercent,
    accesoDal: wasOff ? atIso : ess.accesoDal,
    prodottoCaricatoKg:
      ess.prodottoCaricatoKg > 0
        ? ess.prodottoCaricatoKg
        : PRODOTTO_DEFAULT_KG,
  };
}
