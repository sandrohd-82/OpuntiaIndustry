export const SCHEDA_STATI = ["aperta", "completa", "archiviata"] as const;
export type SchedaStato = (typeof SCHEDA_STATI)[number];

export const SCHEDA_STATO_LABEL: Record<SchedaStato, string> = {
  aperta: "Aperta",
  completa: "Completa",
  archiviata: "Archiviata",
};

export const SCHEDA_EVENTI = [
  "aperta",
  "scaletta",
  "lavorazione",
  "trasformazione",
  "attivita",
  "confezionamento",
  "problema",
  "pronto_ritiro",
  "completa",
  "archivio",
  "nota",
  "ritiro",
  "spedizione",
  "concluso",
  "consegnata",
  "chiuso",
] as const;
export type SchedaEventoTipo = (typeof SCHEDA_EVENTI)[number];

export const SCHEDA_EVENTO_LABEL: Record<SchedaEventoTipo, string> = {
  aperta: "Scheda aperta",
  scaletta: "In scaletta",
  lavorazione: "Lavorazione",
  trasformazione: "Trasformazione",
  attivita: "Attività",
  confezionamento: "Confezionamento",
  problema: "Problema",
  pronto_ritiro: "Pronto per il ritiro",
  completa: "Scheda completata",
  archivio: "Trasferita in archivio",
  nota: "Nota",
  ritiro: "Ritiro",
  spedizione: "Spedizione",
  concluso: "Concluso",
  consegnata: "Consegnata",
  chiuso: "Evaso",
};

export const SCHEDA_COMPLETE_GIORNI = 30;

export type SchedaOrdine = {
  id: string;
  ordineId: string | null;
  campionaturaId: string | null;
  numeroScheda: string;
  cliente: string;
  prodotto: string;
  entityTipo: "ordine" | "campionatura";
  schedaStato: SchedaStato;
  documentoStato: string;
  versione: number;
  apertaAt: string;
  completataAt: string | null;
  archiviataAt: string | null;
  ultimoTitolo: string;
  ultimoAt: string | null;
};

export type SchedaTimelineItem = {
  id: string;
  eventoAt: string;
  eventoTipo: SchedaEventoTipo;
  titolo: string;
  dettaglio: string;
  actorLabel: string;
  impegnoId: string | null;
};

export type SchedaSpedizione = {
  parentStato: string;
  parentStatoLabel: string;
  ritiroAt: string | null;
  corriereNome: string;
  trackingId: string | null;
  trackingUrl: string;
  shippingStatus: string | null;
  shippingLabel: string;
  shippingNote: string;
  canRegistraRitiro: boolean;
  canForzaConsegna: boolean;
};

export type SchedaDettaglio = {
  scheda: SchedaOrdine;
  timeline: SchedaTimelineItem[];
  spedizione: SchedaSpedizione;
};

export type SchedaPrerequisito = {
  id: string;
  etichetta: string;
  tipo: string;
  stato: string;
};

export function parseSchedaStato(raw: unknown): SchedaStato {
  const v = String(raw ?? "aperta");
  return (SCHEDA_STATI as readonly string[]).includes(v)
    ? (v as SchedaStato)
    : "aperta";
}

export function parseSchedaEvento(raw: unknown): SchedaEventoTipo {
  const v = String(raw ?? "nota");
  return (SCHEDA_EVENTI as readonly string[]).includes(v)
    ? (v as SchedaEventoTipo)
    : "nota";
}

export function isLavorazionePrerequisito(tipo: string): boolean {
  return tipo === "lavorazione" || tipo === "trasformazione";
}

export function isImpegnoChiuso(stato: string): boolean {
  return stato === "completata" || stato === "pronto_ritiro";
}

export function giorniDaCompletamento(completataAt: string | null): number | null {
  if (!completataAt) return null;
  const t = new Date(completataAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}
