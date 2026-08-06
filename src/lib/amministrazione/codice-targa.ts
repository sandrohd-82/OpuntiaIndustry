const HEX_ALPHABET = "0123456789ABCDEF";
const MAX_CODES = 16 ** 3; // 4096

export function formatCodiceTarga(index: number): string {
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

export function parseCodiceTarga(code: string): number | null {
  const normalized = code.trim().toUpperCase();
  if (!/^[0-9A-F]{3}$/.test(normalized)) return null;
  return Number.parseInt(normalized, 16);
}

/** Primo codice esadecimale libero in ordine sequenziale 001 → FFF. */
export function nextSequentialCodiceTarga(used: Iterable<string>): string {
  const taken = new Set(
    [...used].map((c) => c.trim().toUpperCase()).filter(Boolean)
  );

  // Parte da 001 (salta 000)
  for (let i = 1; i < MAX_CODES; i++) {
    const candidate = formatCodiceTarga(i);
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error("Nessun codice targa disponibile");
}
