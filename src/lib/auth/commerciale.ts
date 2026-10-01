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

export function parseProvvigionePctInput(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  const raw =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(raw)) {
    return { ok: false, error: "Provvigione non valida." };
  }
  const rounded = Math.round(raw * 100) / 100;
  if (rounded < 0 || rounded > 100) {
    return { ok: false, error: "Provvigione: inserisci un valore da 0 a 100." };
  }
  return { ok: true, value: rounded };
}

export function formatProvvigionePct(
  pct: number | null | undefined
): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} %`;
}

export function calcolaProvvigione(
  incasso: number,
  percentuale: number | null | undefined
): number {
  const pct = percentuale == null || !Number.isFinite(percentuale) ? 0 : percentuale;
  return Math.round(((incasso * pct) / 100 + Number.EPSILON) * 100) / 100;
}

/** Testo in elenco: senza assegnazione l’azienda resta dell’azienda.
 *  Se c'è un affiancato, in elenco compare lui, con il segno Affiancato. */
export function formatCommercialeAssegnazione(opts: {
  commercialeId: string | null | undefined;
  commercialeNome?: string | null;
  commercialeGrado?: CommercialeGrado | null;
  commercialePersonaId?: string | null;
  affiancatoId?: string | null;
  affiancatoPersonaId?: string | null;
  affiancatoNome?: string | null;
  affiancatoGrado?: CommercialeGrado | null;
}): string {
  const affiancato = Boolean(opts.affiancatoId || opts.affiancatoPersonaId);
  if (affiancato) {
    const nome = String(opts.affiancatoNome ?? "").trim() || "Commerciale";
    const grado = opts.affiancatoGrado
      ? ` · ${COMMERCIALE_GRADO_LABELS[opts.affiancatoGrado]}`
      : "";
    return `${nome}${grado} · Affiancato`;
  }
  if (!opts.commercialeId && !opts.commercialePersonaId) return "Azienda";
  const nome = String(opts.commercialeNome ?? "").trim() || "Commerciale";
  return opts.commercialeGrado
    ? `${nome} · ${COMMERCIALE_GRADO_LABELS[opts.commercialeGrado]}`
    : nome;
}

export function etichettaAffiancato(opts: {
  affiancatoId?: string | null;
  affiancatoPersonaId?: string | null;
  labels: Map<string, { nome: string; grado: CommercialeGrado | null }>;
  persone: Map<string, { nome: string; grado: CommercialeGrado | null }>;
}): { nome: string; grado: CommercialeGrado | null } | null {
  if (opts.affiancatoId) {
    const lab = opts.labels.get(opts.affiancatoId);
    return {
      nome: lab?.nome?.trim() || "Commerciale",
      grado: lab?.grado ?? null,
    };
  }
  if (opts.affiancatoPersonaId) {
    const lab = opts.persone.get(opts.affiancatoPersonaId);
    return {
      nome: lab?.nome?.trim() || "Commerciale",
      grado: lab?.grado ?? null,
    };
  }
  return null;
}

/** Valore filtro: anagrafiche senza commerciale collegato. */
export const COMMERCIALE_AREA_AZIENDA = "azienda";

/** Nome compatto in menù: Rosario Pisano → R. Pisano. */
export function formatCommercialeAreaBreve(nome: string): string {
  const parts = nome
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "Commerciale";
  if (parts.length === 1) return parts[0];
  const first = parts[0].replace(/\.$/, "");
  if (first.length <= 1) return parts.join(" ");
  return `${first.charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`;
}

export type CommercialeAreaOption = {
  value: string;
  label: string;
};

export function uniqueCommercialeAreaOptions(
  records: Array<{
    commercialeId: string | null | undefined;
    commercialeNome?: string | null;
    commercialePersonaId?: string | null;
    affiancatoId?: string | null;
    affiancatoPersonaId?: string | null;
    affiancatoNome?: string | null;
  }>
): CommercialeAreaOption[] {
  const byId = new Map<string, string>();
  for (const record of records) {
    const affiancato = Boolean(record.affiancatoId || record.affiancatoPersonaId);
    const id = (
      affiancato
        ? record.affiancatoId || record.affiancatoPersonaId
        : record.commercialeId
    )?.trim();
    if (!id || byId.has(id)) continue;
    const nome = affiancato
      ? String(record.affiancatoNome ?? "").trim() || "Commerciale"
      : String(record.commercialeNome ?? "").trim() || "Commerciale";
    byId.set(id, formatCommercialeAreaBreve(nome));
  }
  return [...byId.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "it"));
}

/** Assegnato, oppure creato da un commerciale (non Super Admin). */
export function resolveCommercialeAppartenenza(opts: {
  commercialeId: string | null | undefined;
  createdBy: string | null | undefined;
  commercialIds: Set<string>;
  excludeCreatorIds?: Set<string>;
  labels: Map<string, { nome: string; grado: CommercialeGrado | null }>;
}): {
  commercialeId: string | null;
  commercialeNome: string;
  commercialeGrado: CommercialeGrado | null;
} {
  const assigned = String(opts.commercialeId ?? "").trim();
  const creator = String(opts.createdBy ?? "").trim();
  const skipCreator =
    !creator ||
    Boolean(opts.excludeCreatorIds?.has(creator)) ||
    (opts.excludeCreatorIds == null && !opts.commercialIds.has(creator));
  const effective = assigned || (skipCreator ? "" : creator);
  if (!effective) {
    return {
      commercialeId: null,
      commercialeNome: "",
      commercialeGrado: null,
    };
  }
  const label = opts.labels.get(effective);
  return {
    commercialeId: effective,
    commercialeNome: label?.nome ?? "",
    commercialeGrado: label?.grado ?? null,
  };
}

export function matchesCommercialeArea(
  record: {
    commercialeId: string | null | undefined;
    commercialePersonaId?: string | null;
    affiancatoId?: string | null;
    affiancatoPersonaId?: string | null;
  },
  filter: string
): boolean {
  const value = filter.trim();
  if (!value) return true;
  const affiancato = Boolean(record.affiancatoId || record.affiancatoPersonaId);
  if (value === COMMERCIALE_AREA_AZIENDA) {
    if (affiancato) return false;
    return !record.commercialeId && !record.commercialePersonaId;
  }
  if (affiancato) {
    return (
      record.affiancatoId === value || record.affiancatoPersonaId === value
    );
  }
  return (
    record.commercialeId === value || record.commercialePersonaId === value
  );
}

export function commercialeAreaFilterLabel(
  filter: string,
  records: Array<{
    commercialeId: string | null | undefined;
    commercialeNome?: string | null;
  }>
): string {
  const value = filter.trim();
  if (!value) return "";
  if (value === COMMERCIALE_AREA_AZIENDA) return "Azienda";
  const hit = uniqueCommercialeAreaOptions(records).find((o) => o.value === value);
  return hit?.label || "Commerciale";
}

/** Testo cercabile: Azienda, nome commerciale e grado (nuovi assegnatari inclusi). */
export function commercialeAssegnazioneSearchText(opts: {
  commercialeId: string | null | undefined;
  commercialeNome?: string | null;
  commercialeGrado?: CommercialeGrado | null;
  commercialePersonaId?: string | null;
  affiancatoId?: string | null;
  affiancatoPersonaId?: string | null;
  affiancatoNome?: string | null;
  affiancatoGrado?: CommercialeGrado | null;
}): string {
  const label = formatCommercialeAssegnazione(opts);
  const nome = String(opts.commercialeNome ?? "").trim();
  const grado = opts.commercialeGrado
    ? COMMERCIALE_GRADO_LABELS[opts.commercialeGrado]
    : "";
  return [label, nome, grado].filter(Boolean).join(" ");
}

export type CommercialeAssegnabile = {
  id: string;
  nome: string;
  email: string;
  grado: CommercialeGrado | null;
};

export type CommercialeAziendaOrigine =
  | "caricata"
  | "collegata"
  | "entrambe"
  | "affiancata";

export function commercialeAziendaOrigine(opts: {
  userId: string;
  createdBy?: string | null;
  commercialeId?: string | null;
  affiancatoId?: string | null;
}): CommercialeAziendaOrigine {
  const caricata = Boolean(opts.createdBy && opts.createdBy === opts.userId);
  const collegata = Boolean(
    opts.commercialeId && opts.commercialeId === opts.userId
  );
  const affiancata = Boolean(
    opts.affiancatoId && opts.affiancatoId === opts.userId
  );
  if (caricata && collegata) return "entrambe";
  if (collegata) return "collegata";
  if (affiancata) return "affiancata";
  return "caricata";
}

export function commercialeAziendaOrigineLabel(
  origine: CommercialeAziendaOrigine
): string {
  if (origine === "collegata") return "Collegata";
  if (origine === "entrambe") return "Caricata e collegata";
  if (origine === "affiancata") return "Affiancata";
  return "Caricata da lui";
}

export function isCommercialOwnRecord(opts: {
  userId: string;
  createdBy?: string | null;
  commercialeId?: string | null;
  affiancatoId?: string | null;
  commercialePersonaId?: string | null;
  affiancatoPersonaId?: string | null;
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
  if (
    opts.affiancatoId &&
    (opts.affiancatoId === opts.userId || lineage.has(opts.affiancatoId))
  ) {
    return true;
  }
  if (
    opts.commercialePersonaId &&
    lineage.has(opts.commercialePersonaId)
  ) {
    return true;
  }
  if (opts.affiancatoPersonaId && lineage.has(opts.affiancatoPersonaId)) {
    return true;
  }
  return false;
}
