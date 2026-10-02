const ITALIA = new Set([
  "IT",
  "ITA",
  "ITALIA",
  "ITALY",
  "REPUBBLICA ITALIANA",
]);

/** Codice ISO a due lettere, se riconoscibile. */
export function codiceNazione(raw: string | null | undefined): string {
  const up = (raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (/^[A-Z]{2}$/.test(up)) return up;
  if (ITALIA.has(up)) return "IT";
  return "";
}

/** Nome italiano, Italia compresa. */
export function nomeNazione(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const codice = codiceNazione(t);
  if (codice === "IT") return "Italia";
  if (codice) {
    try {
      return new Intl.DisplayNames(["it"], { type: "region" }).of(codice) || codice;
    } catch {
      return codice;
    }
  }
  return t;
}

/** Bandiera emoji dal codice nazione (es. FR → 🇫🇷). */
export function bandieraNazione(raw: string | null | undefined): string {
  const codice = codiceNazione(raw);
  if (!codice) return "";
  return String.fromCodePoint(
    ...[...codice].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

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
