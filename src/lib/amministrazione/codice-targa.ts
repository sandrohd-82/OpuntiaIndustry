const HEX_ALPHABET = "0123456789ABCDEF";
const MAX_CODES = 16 ** 3; // 4096

/** Prefisso targa: F = Fornitori, C = Clienti */
export type TargaPrefix = "F" | "C";

export function formatCodiceTargaBody(index: number): string {
  if (index < 0 || index >= MAX_CODES) {
    throw new Error("Indice codice targa fuori range");
  }
  let n = index;
  let out = "";
  for (let i = 0; i < 3; i++) {
    out = HEX_ALPHABET[n % 16] + out;
    n = Math.floor(n / 16);
  }
  return out;
}

export function formatCodiceTarga(prefix: TargaPrefix, index: number): string {
  return `${prefix}${formatCodiceTargaBody(index)}`;
}

export function isValidCodiceTarga(
  code: string,
  prefix: TargaPrefix
): boolean {
  const normalized = code.trim().toUpperCase();
  if (!new RegExp(`^${prefix}[0-9A-F]{3}$`).test(normalized)) return false;
  return normalized.slice(1) !== "000";
}

export function parseCodiceTarga(
  code: string,
  prefix: TargaPrefix
): number | null {
  const normalized = code.trim().toUpperCase();
  if (!isValidCodiceTarga(normalized, prefix)) return null;
  return Number.parseInt(normalized.slice(1), 16);
}

/**
 * Primo codice libero sequenziale esadecimale:
 * Fornitori → F001…FFFF | Clienti → C001…CFFF
 */
export function nextSequentialCodiceTarga(
  prefix: TargaPrefix,
  used: Iterable<string>
): string {
  const taken = new Set(
    [...used].map((c) => c.trim().toUpperCase()).filter(Boolean)
  );

  for (let i = 1; i < MAX_CODES; i++) {
    const candidate = formatCodiceTarga(prefix, i);
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error(`Nessun codice targa disponibile per il prefisso ${prefix}`);
}
