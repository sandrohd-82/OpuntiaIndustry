/** Trimestre commerciale italiano: I° gen–mar … IV° ott–dic. */

export type TrimestreNumero = 1 | 2 | 3 | 4;

export type TrimestreKey = `${number}-${TrimestreNumero}`;

const ROMANI = ["I", "II", "III", "IV"] as const;

export function trimestreFromIsoDate(isoDate: string): {
  anno: number;
  trim: TrimestreNumero;
  key: TrimestreKey;
} | null {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return null;
  }
  const trim = (m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4) as TrimestreNumero;
  return { anno: y, trim, key: `${y}-${trim}` };
}

export function labelTrimestre(anno: number, trim: TrimestreNumero): string {
  return `${ROMANI[trim - 1]}° ${anno}`;
}

export function labelTrimestreKey(key: TrimestreKey): string {
  const [y, t] = key.split("-");
  return labelTrimestre(Number(y), Number(t) as TrimestreNumero);
}

/** Opzioni trimestre presenti nei documenti (ordinate dal più recente). */
export function buildTrimestreOptions(
  isoDates: string[]
): { key: TrimestreKey; label: string }[] {
  const map = new Map<TrimestreKey, string>();
  for (const d of isoDates) {
    const t = trimestreFromIsoDate(d);
    if (!t) continue;
    if (!map.has(t.key)) {
      map.set(t.key, labelTrimestre(t.anno, t.trim));
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));
}

export function isoInDateRange(
  isoDate: string,
  dal: string,
  al: string
): boolean {
  if (dal && isoDate < dal) return false;
  if (al && isoDate > al) return false;
  return true;
}
