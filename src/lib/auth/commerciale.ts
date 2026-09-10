export const COMMERCIALE_GRADI = [
  "senior",
  "professional",
  "executive",
] as const;

export type CommercialeGrado = (typeof COMMERCIALE_GRADI)[number];

export const COMMERCIALE_GRADO_LABELS: Record<CommercialeGrado, string> = {
  senior: "Senior",
  professional: "Professional",
  executive: "Executive",
};

/** Rank crescente = più in basso (Senior sopra Professional sopra Executive). */
export const COMMERCIALE_GRADO_RANK: Record<CommercialeGrado, number> = {
  senior: 1,
  professional: 2,
  executive: 3,
};

export function parseCommercialeGrado(
  value: unknown
): CommercialeGrado | null {
  if (
    value === "senior" ||
    value === "professional" ||
    value === "executive"
  ) {
    return value;
  }
  return null;
}

export function isRepartoCommerciale(reparto: {
  codice?: string | null;
  nome?: string | null;
} | null | undefined): boolean {
  const codice = String(reparto?.codice ?? "").trim().toLowerCase();
  const nome = String(reparto?.nome ?? "").trim().toLowerCase();
  return codice === "commerciale" || nome === "commerciale";
}

export function commercialeGradoLabel(
  grado: CommercialeGrado | null | undefined
): string {
  return grado ? COMMERCIALE_GRADO_LABELS[grado] : "—";
}

/** Testo in elenco: senza assegnazione l’azienda resta dell’azienda. */
export function formatCommercialeAssegnazione(opts: {
  commercialeId: string | null | undefined;
  commercialeNome?: string | null;
  commercialeGrado?: CommercialeGrado | null;
}): string {
  if (!opts.commercialeId) return "Azienda";
  const nome = String(opts.commercialeNome ?? "").trim() || "Commerciale";
  return opts.commercialeGrado
    ? `${nome} · ${COMMERCIALE_GRADO_LABELS[opts.commercialeGrado]}`
    : nome;
}

export type CommercialeAssegnabile = {
  id: string;
  nome: string;
  email: string;
  grado: CommercialeGrado | null;
};

export type CommercialeAziendaOrigine = "caricata" | "collegata" | "entrambe";

export function commercialeAziendaOrigine(opts: {
  userId: string;
  createdBy?: string | null;
  commercialeId?: string | null;
}): CommercialeAziendaOrigine {
  const caricata = Boolean(opts.createdBy && opts.createdBy === opts.userId);
  const collegata = Boolean(
    opts.commercialeId && opts.commercialeId === opts.userId
  );
  if (caricata && collegata) return "entrambe";
  if (collegata) return "collegata";
  return "caricata";
}

export function commercialeAziendaOrigineLabel(
  origine: CommercialeAziendaOrigine
): string {
  if (origine === "collegata") return "Collegata";
  if (origine === "entrambe") return "Caricata e collegata";
  return "Caricata da lui";
}

export function isCommercialOwnRecord(opts: {
  userId: string;
  createdBy?: string | null;
  commercialeId?: string | null;
  lineageIds: string[];
}): boolean {
  const lineage = new Set(opts.lineageIds);
  if (opts.createdBy && (opts.createdBy === opts.userId || lineage.has(opts.createdBy))) {
    return true;
  }
  if (
    opts.commercialeId &&
    (opts.commercialeId === opts.userId || lineage.has(opts.commercialeId))
  ) {
    return true;
  }
  return false;
}
