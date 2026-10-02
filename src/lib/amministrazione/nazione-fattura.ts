const ITALIA = new Set([
  "IT",
  "ITA",
  "ITALIA",
  "ITALY",
  "REPUBBLICA ITALIANA",
]);

/** Nome italiano della nazione se non è l'Italia. Vuoto o Italia → null. */
export function nazioneEstera(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const up = t.toUpperCase().replace(/\./g, "");
  if (ITALIA.has(up)) return null;
  if (/^[A-Z]{2}$/.test(up)) {
    try {
      const nome = new Intl.DisplayNames(["it"], { type: "region" }).of(up);
      if (!nome) return null;
      if (ITALIA.has(nome.toUpperCase())) return null;
      return nome;
    } catch {
      return up;
    }
  }
  return t;
}
