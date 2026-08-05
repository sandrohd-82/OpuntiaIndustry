export type FoglioLavorazioneStato = "aperto" | "chiuso";

export type MotivoLavorazione = "magazzino" | "ordine";

/** Foglio di lavorazione (~24h) */
export type FoglioLavorazione = {
  id: string;
  /** Codice visuale es. FL-2026-001 */
  label: string;
  descrizione: string;
  /** Prodotto / lotto in lavorazione (etichetta sintetica) */
  prodotto: string;
  stato: FoglioLavorazioneStato;
  startedAt: string;
  /** Fine prevista (tipicamente +24h) */
  expectedEndAt: string;
  closedAt: string | null;
  note: string;
  motivo: MotivoLavorazione;
  ordineId: string | null;
  ordineLabel: string | null;
  lottoId: string;
  lottoLabel: string;
  codiceProdottoUscitaId: string;
  codiceProdottoUscita: string;
};

/** Placeholder area Ordini (da sostituire) */
export type OrdineDemo = {
  id: string;
  label: string;
  cliente: string;
};

/** Placeholder area Merce in ingresso (da sostituire) */
export type LottoDemo = {
  id: string;
  label: string;
  prodotto: string;
  quantitaKg: number;
};

/** Placeholder elenco prodotti in uscita (da sostituire) */
export type ProdottoUscitaDemo = {
  id: string;
  codice: string;
  nome: string;
};

export const ORDINI_DEMO: OrdineDemo[] = [
  { id: "ord-1001", label: "ORD-1001", cliente: "Cliente Alfa" },
  { id: "ord-1002", label: "ORD-1002", cliente: "Cliente Beta" },
  { id: "ord-1003", label: "ORD-1003", cliente: "Cliente Gamma" },
];

export const LOTTI_DEMO: LottoDemo[] = [
  {
    id: "lot-a12",
    label: "LOT-A12",
    prodotto: "Fichi d’India freschi",
    quantitaKg: 4200,
  },
  {
    id: "lot-b07",
    label: "LOT-B07",
    prodotto: "Fichi d’India freschi",
    quantitaKg: 3100,
  },
  {
    id: "lot-c03",
    label: "LOT-C03",
    prodotto: "Cladodi",
    quantitaKg: 1800,
  },
];

export const PRODOTTI_USCITA_DEMO: ProdottoUscitaDemo[] = [
  { id: "pu-01", codice: "FD-ESS-01", nome: "Fichi essiccati interi" },
  { id: "pu-02", codice: "FD-ESS-02", nome: "Fichi essiccati cubetti" },
  { id: "pu-03", codice: "FD-FAR-01", nome: "Farina di cladodi" },
];

export const FOGLI_STORAGE_KEY = "opuntia.fogli-lavorazione.v2";

/** Seed iniziale vuoto: i fogli si creano dalla pagina Fogli Lavorazione */
export const FOGLI_LAVORAZIONE_INITIAL: FoglioLavorazione[] = [];

export function isFoglioAperto(foglio: FoglioLavorazione) {
  return foglio.stato === "aperto";
}

export type CreateFoglioInput = {
  startedAt: string;
  motivo: MotivoLavorazione;
  ordineId: string | null;
  ordineLabel: string | null;
  lottoId: string;
  lottoLabel: string;
  lottoProdotto: string;
  codiceProdottoUscitaId: string;
  codiceProdottoUscita: string;
  existing: FoglioLavorazione[];
};

export function createFoglioLavorazione(
  input: CreateFoglioInput
): FoglioLavorazione {
  const start = new Date(input.startedAt);
  const startValid = Number.isNaN(start.getTime()) ? new Date() : start;
  const year = startValid.getFullYear();
  const seq =
    input.existing.filter((f) => f.label.startsWith(`FL-${year}-`)).length + 1;
  const label = `FL-${year}-${String(seq).padStart(3, "0")}`;
  const startedAt = startValid.toISOString();
  const expectedEndAt = new Date(
    startValid.getTime() + 24 * 60 * 60 * 1000
  ).toISOString();

  const motivoLabel =
    input.motivo === "magazzino" ? "Magazzino" : "Ordine";
  const descrizione =
    input.motivo === "ordine" && input.ordineLabel
      ? `${motivoLabel} · ${input.ordineLabel} · ${input.lottoLabel}`
      : `${motivoLabel} · ${input.lottoLabel}`;

  return {
    id: `fl-${Date.now()}`,
    label,
    descrizione,
    prodotto: `${input.lottoProdotto} → ${input.codiceProdottoUscita}`,
    stato: "aperto",
    startedAt,
    expectedEndAt,
    closedAt: null,
    note: "",
    motivo: input.motivo,
    ordineId: input.motivo === "ordine" ? input.ordineId : null,
    ordineLabel: input.motivo === "ordine" ? input.ordineLabel : null,
    lottoId: input.lottoId,
    lottoLabel: input.lottoLabel,
    codiceProdottoUscitaId: input.codiceProdottoUscitaId,
    codiceProdottoUscita: input.codiceProdottoUscita,
  };
}

export function formatFoglioRange(foglio: FoglioLavorazione) {
  try {
    const start = new Date(foglio.startedAt).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const end = new Date(foglio.expectedEndAt).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
    return `${start} → ${end}`;
  } catch {
    return "—";
  }
}

export function loadFogliFromStorage(): FoglioLavorazione[] {
  if (typeof window === "undefined") return FOGLI_LAVORAZIONE_INITIAL;
  try {
    const raw = window.localStorage.getItem(FOGLI_STORAGE_KEY);
    if (!raw) return FOGLI_LAVORAZIONE_INITIAL;
    const parsed = JSON.parse(raw) as FoglioLavorazione[];
    return Array.isArray(parsed) ? parsed : FOGLI_LAVORAZIONE_INITIAL;
  } catch {
    return FOGLI_LAVORAZIONE_INITIAL;
  }
}

export function saveFogliToStorage(fogli: FoglioLavorazione[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOGLI_STORAGE_KEY, JSON.stringify(fogli));
  window.dispatchEvent(new Event("opuntia-fogli-updated"));
}

/** datetime-local value from Date */
export function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
