export function etichettaModelloGemini(modello: string): string {
  const pulito = modello.trim().replace(/^models\//, "");
  const match = pulito.match(/^gemini-(.+)$/i);
  if (!match?.[1]) return pulito || "Gemini";
  const parti = match[1]
    .split("-")
    .filter(Boolean)
    .map((parte) => {
      if (/^\d/.test(parte)) return parte;
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    });
  return `Gemini ${parti.join(" ")}`;
}

/** Dicitura da stampare sul preventivo tradotto e nella mail. */
export function dicituraTradottoConAi(modello: string): string {
  return `Tradotto con AI "${etichettaModelloGemini(modello)}"`;
}

export function applicaDicituraTraduzioneAi(
  testo: string,
  modello: string | null | undefined
): string {
  const nome = modello?.trim();
  if (!nome) return testo;
  const riga = dicituraTradottoConAi(nome);
  if (testo.includes("Tradotto con AI")) return testo;
  const base = testo.trim();
  return base ? `${base}\n\n${riga}` : riga;
}
