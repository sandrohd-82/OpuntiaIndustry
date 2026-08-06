/** Separa via e numero civico (es. "via Roma 12/A" → via + 12/A). */
export function splitStreetAndCivico(input: string): {
  street: string;
  civico: string;
} {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return { street: "", civico: "" };

  const match = trimmed.match(
    /^(.*?)(?:\s+|,\s*)(\d+[A-Za-z]?(?:\s*\/\s*\d+[A-Za-z]?)?(?:\s+(?:bis|ter|quater))?)$/i
  );

  if (!match?.[1]?.trim() || !match[2]) {
    return { street: trimmed, civico: "" };
  }

  return {
    street: match[1].trim().replace(/,\s*$/, ""),
    civico: match[2].replace(/\s+/g, " ").trim(),
  };
}

export function joinStreetAndCivico(street: string, civico: string): string {
  const s = street.trim().replace(/,\s*$/, "");
  const c = civico.trim();
  if (!s) return c;
  if (!c) return s;
  return `${s}, ${c}`;
}

export function normalizeStreetQuery(street: string): string {
  return street.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}
