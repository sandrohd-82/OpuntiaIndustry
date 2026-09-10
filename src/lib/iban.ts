/** Normalizza IBAN: maiuscolo, senza spazi. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const piece = /[A-Z]/.test(ch)
      ? String(ch.charCodeAt(0) - 55)
      : ch;
    for (const d of piece) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }
  return remainder;
}

export function parseIbanInput(
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const raw = normalizeIban(String(value));
  if (!raw) return { ok: true, value: null };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(raw)) {
    return {
      ok: false,
      error:
        "IBAN non valido: deve iniziare con 2 lettere di paese e 2 cifre di controllo.",
    };
  }
  if (raw.length < 15 || raw.length > 34) {
    return { ok: false, error: "IBAN: lunghezza non valida." };
  }
  if (ibanMod97(raw) !== 1) {
    return { ok: false, error: "IBAN non valido: cifre di controllo errate." };
  }
  return { ok: true, value: raw };
}

export function formatIbanDisplay(iban: string | null | undefined): string {
  const raw = normalizeIban(String(iban ?? ""));
  if (!raw) return "";
  return raw.replace(/(.{4})/g, "$1 ").trim();
}

export function parseBicInput(
  value: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const raw = String(value).replace(/\s+/g, "").toUpperCase();
  if (!raw) return { ok: true, value: null };
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw)) {
    return {
      ok: false,
      error: "BIC/SWIFT non valido (8 o 11 caratteri).",
    };
  }
  return { ok: true, value: raw };
}
