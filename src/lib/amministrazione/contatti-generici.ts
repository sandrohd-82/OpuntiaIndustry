export const CONTATTI_GENERICI_REMINDER =
  "Ricorda che in questi campi devono essere inseriti solo dati generici. I dati relativi a referenti (Commerciali, Titolari ecc.) devono essere inseriti nell’area Referenti in fondo a questa pagina.";

export const CONTATTI_GENERICI_MAX_ITEMS = 20;

export type ContattiGenerici = {
  emailGeneriche: string[];
  telefoniGenerici: string[];
  sitiWebGenerici: string[];
};

export function normalizeStringList(
  values: unknown,
  maxLen: number,
  maxItems = CONTATTI_GENERICI_MAX_ITEMS
): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    out.push(v.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeContattiGenerici(input: {
  emailGeneriche?: unknown;
  telefoniGenerici?: unknown;
  sitiWebGenerici?: unknown;
}): ContattiGenerici {
  return {
    emailGeneriche: normalizeStringList(input.emailGeneriche, 120),
    telefoniGenerici: normalizeStringList(input.telefoniGenerici, 60),
    sitiWebGenerici: normalizeStringList(input.sitiWebGenerici, 200),
  };
}
