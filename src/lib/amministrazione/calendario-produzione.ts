import {
  addDays,
  isGiornoLavorativo,
  nextWorkingDay,
} from "@/lib/amministrazione/produzione-capacita";

export type CalendarioImpegno = {
  id: string;
  dataGiorno: string; // YYYY-MM-DD
  ordineId: string | null;
  etichetta: string;
  lineaCodice: string | null;
};

export type DayCellKind =
  | "empty"
  | "occupied"
  | "preview"
  | "selected"
  | "consegna"
  | "sunday"
  | "saturday_off"
  | "saturday_on";

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthMatrix(year: number, monthIndex0: number): (string | null)[][] {
  const first = new Date(year, monthIndex0, 1);
  const startPad = (first.getDay() + 6) % 7; // lunedì = 0
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(toIso(new Date(year, monthIndex0, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export function weekdayIndexMon0(iso: string): number {
  return (parseIso(iso).getDay() + 6) % 7;
}

export function isSunday(iso: string): boolean {
  return parseIso(iso).getDay() === 0;
}

export function isSaturday(iso: string): boolean {
  return parseIso(iso).getDay() === 6;
}

/**
 * Costruisce N giorni lavorativi a partire da `startIso` (incluso se lavorativo).
 * - salta domeniche sempre
 * - sabato solo se usaSabato
 * - se skipOccupied, salta date in occupiedSet (e le segnala in skippedOccupied)
 */
export function buildWorkingBlock(input: {
  startIso: string;
  giorni: number;
  usaSabato: boolean;
  occupiedSet: Set<string>;
  skipOccupied: boolean;
}): {
  days: string[];
  skippedOccupied: string[];
  conflicts: string[];
} {
  const n = Math.max(0, Math.floor(input.giorni));
  const days: string[] = [];
  const skippedOccupied: string[] = [];
  const conflicts: string[] = [];
  if (n <= 0) return { days, skippedOccupied, conflicts };

  let cur = input.startIso;
  // Se partenza non lavorativa, avanza al prossimo lavorativo
  if (!isGiornoLavorativo(parseIso(cur), input.usaSabato)) {
    cur = nextWorkingDay(cur, input.usaSabato);
  }

  for (let guard = 0; guard < 400 && days.length < n; guard += 1) {
    const d = parseIso(cur);
    if (isGiornoLavorativo(d, input.usaSabato)) {
      const occupied = input.occupiedSet.has(cur);
      if (occupied && input.skipOccupied) {
        skippedOccupied.push(cur);
      } else if (occupied && !input.skipOccupied) {
        conflicts.push(cur);
        days.push(cur);
      } else {
        days.push(cur);
      }
    }
    cur = addDays(cur, 1);
  }

  return { days, skippedOccupied, conflicts };
}

/** Data consegna = giorno successivo all’ultimo giorno di produzione (lavorativo o calendario?). */
export function dataConsegnaDaBlocco(
  blockDays: string[],
  usaSabato: boolean
): string | null {
  if (!blockDays.length) return null;
  const last = blockDays[blockDays.length - 1]!;
  return nextWorkingDay(addDays(last, 1), usaSabato);
}

export function formatIsoIt(iso: string): string {
  try {
    return parseIso(iso).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export { toIso as dateToIso, parseIso as parseIsoDate };
