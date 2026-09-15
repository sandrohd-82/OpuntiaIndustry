/** Maggiorazione fissa di sicurezza sul nolo (ISO: tracciare base + markup). */
export const SPEDIZIONE_MARKUP_SICUREZZA_PCT = 30;

export const PREVENTIVO_SPEDIZIONE_FONTI = [
  "da_concordare",
  "a_carico_acquirente",
  "stima_api",
  "manuale",
  "ritiro",
] as const;

export type PreventivoSpedizioneFonte =
  (typeof PREVENTIVO_SPEDIZIONE_FONTI)[number];

export type PreventivoConsegnaSpedizione =
  | "da_concordare"
  | "ritiro"
  | "corriere_nostro"
  | "corriere_cliente";

export type StimaSpedizioneInput = {
  consegnaMetodo: PreventivoConsegnaSpedizione;
  cap: string;
  nazione: string;
  provincia: string;
  pesoKg: number;
  importoBaseManuale?: number | null;
};

export type StimaSpedizioneResult = {
  applicabile: boolean;
  importoBase: number;
  markupPct: number;
  importoConSicurezza: number;
  fonte: PreventivoSpedizioneFonte;
  messaggio: string;
  canaliTentati: string[];
};

export function applicaMargineSpedizione(
  importoBase: number,
  markupPct = SPEDIZIONE_MARKUP_SICUREZZA_PCT
): number {
  if (!Number.isFinite(importoBase) || importoBase <= 0) return 0;
  const pct = Number.isFinite(markupPct) ? Math.max(0, markupPct) : 0;
  return Math.round(importoBase * (1 + pct / 100) * 100) / 100;
}

export function caricoDefaultDaConsegna(
  metodo: PreventivoConsegnaSpedizione
): "cliente" | "agrinsicilia" | "diviso" {
  return metodo === "corriere_nostro" ? "agrinsicilia" : "cliente";
}

export function fonteDefaultDaConsegna(
  metodo: PreventivoConsegnaSpedizione
): PreventivoSpedizioneFonte {
  if (metodo === "ritiro") return "ritiro";
  if (metodo === "corriere_cliente") return "a_carico_acquirente";
  if (metodo === "corriere_nostro") return "manuale";
  return "da_concordare";
}

/**
 * Canali reali per un nolo automatico (B2B agro: spesso pallet, non collo < 31,5 kg).
 * - Gsped RateComparativa (listini contrattuali / WS corriere)
 * - ShippyPro / Sendcloud / Qapla' (aggregatori, serve contratto)
 * - GLS / DHL / BRT: rating solo con contratto; BRT C2X è listino e-commerce, non pallet
 * Env: GSPED_API_URL + GSPED_API_KEY, oppure SHIPPYPRO_API_KEY
 */
export function canaliSpedizioneConfigurati(): string[] {
  const canali: string[] = [];
  if (process.env.GSPED_API_URL && process.env.GSPED_API_KEY) {
    canali.push("gsped");
  }
  if (process.env.SHIPPYPRO_API_KEY) canali.push("shippypro");
  return canali;
}

export function stimaSpedizionePreventivo(
  input: StimaSpedizioneInput
): StimaSpedizioneResult {
  const markupPct = SPEDIZIONE_MARKUP_SICUREZZA_PCT;
  if (input.consegnaMetodo === "da_concordare") {
    return {
      applicabile: false,
      importoBase: 0,
      markupPct,
      importoConSicurezza: 0,
      fonte: "da_concordare",
      messaggio: "Spedizione da concordare: nessun importo in preventivo.",
      canaliTentati: [],
    };
  }
  if (input.consegnaMetodo === "corriere_cliente") {
    return {
      applicabile: false,
      importoBase: 0,
      markupPct,
      importoConSicurezza: 0,
      fonte: "a_carico_acquirente",
      messaggio: "Spedizione a carico dell'acquirente.",
      canaliTentati: [],
    };
  }
  if (input.consegnaMetodo === "ritiro") {
    return {
      applicabile: false,
      importoBase: 0,
      markupPct,
      importoConSicurezza: 0,
      fonte: "ritiro",
      messaggio: "Ritiro in sede: nessun nolo.",
      canaliTentati: [],
    };
  }

  const canali = canaliSpedizioneConfigurati();
  const baseManuale =
    input.importoBaseManuale != null &&
    Number.isFinite(input.importoBaseManuale) &&
    input.importoBaseManuale > 0
      ? input.importoBaseManuale
      : 0;

  if (baseManuale > 0) {
    const conSicurezza = applicaMargineSpedizione(baseManuale, markupPct);
    return {
      applicabile: true,
      importoBase: baseManuale,
      markupPct,
      importoConSicurezza: conSicurezza,
      fonte: "manuale",
      messaggio: `Nolo inserito ${baseManuale.toFixed(2)} € + ${markupPct}% di sicurezza = ${conSicurezza.toFixed(2)} €.`,
      canaliTentati: canali,
    };
  }

  const cap = input.cap.trim();
  const peso = Number.isFinite(input.pesoKg) ? input.pesoKg : 0;
  if (!cap || peso <= 0) {
    return {
      applicabile: false,
      importoBase: 0,
      markupPct,
      importoConSicurezza: 0,
      fonte: "manuale",
      messaggio:
        "Per stimare servono destinatario (CAP) e peso dei prodotti, oppure un nolo corriere da maggiorare del 30%.",
      canaliTentati: canali,
    };
  }

  if (canali.length === 0) {
    return {
      applicabile: false,
      importoBase: 0,
      markupPct,
      importoConSicurezza: 0,
      fonte: "manuale",
      messaggio:
        "Nessuna API corriere configurata (GSPED / ShippyPro). Inserisci il nolo del corriere: applichiamo sempre +30% di sicurezza. Per pallet B2B il listino è contrattuale, non il C2X e-commerce.",
      canaliTentati: [],
    };
  }

  return {
    applicabile: false,
    importoBase: 0,
    markupPct,
    importoConSicurezza: 0,
    fonte: "stima_api",
    messaggio:
      "API corriere presente in ambiente: il rating live verrà collegato al prossimo passo. Intanto inserisci il nolo e applichiamo +30%.",
    canaliTentati: canali,
  };
}
