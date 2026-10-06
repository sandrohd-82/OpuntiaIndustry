import type { CampionaturaStatoDb, OrdineStato } from "@/types/database";

/** Ciclo operativo unico merce / campionatura (ISO 9001 §8.5). */
export const CICLO_STATO_ORDINE = {
  inserito: {
    label: "Inserito",
    hint: "Ordine creato",
  },
  processato: {
    label: "In scaletta",
    hint: "In calendario di produzione",
  },
  in_produzione: {
    label: "In produzione",
    hint: "Lavorazione avviata",
  },
  pronto_spedizione: {
    label: "Pronto per il ritiro",
    hint: "Produzione chiusa, in attesa del corriere",
  },
  inviato: {
    label: "Partito",
    hint: "Ritirato dal corriere. Resta in elenco 30 giorni, poi archivio.",
  },
  chiuso: {
    label: "Evaso",
    hint: "Spedizione consegnata",
  },
} as const;

export type CicloStatoMeta = {
  label: string;
  hint: string;
};

export function cicloStatoOrdine(stato: OrdineStato): CicloStatoMeta {
  switch (stato) {
    case "in_attesa":
    case "ricevuto":
      return CICLO_STATO_ORDINE.inserito;
    case "in_scaletta":
      return CICLO_STATO_ORDINE.processato;
    case "in_produzione":
      return CICLO_STATO_ORDINE.in_produzione;
    case "pronto_spedizione":
      return CICLO_STATO_ORDINE.pronto_spedizione;
    case "inviato":
      return CICLO_STATO_ORDINE.inviato;
    case "evaso":
      return CICLO_STATO_ORDINE.chiuso;
    case "sospeso":
      return { label: "Sospeso", hint: "Prodotto non disponibile" };
    case "storico":
      return { label: "Storico", hint: "Ordine archiviato" };
    default:
      return { label: stato, hint: "" };
  }
}

export function cicloStatoCampionatura(
  stato: CampionaturaStatoDb
): CicloStatoMeta {
  switch (stato) {
    case "inserita":
      return CICLO_STATO_ORDINE.inserito;
    case "bozza":
      return {
        label: "Bozza",
        hint: "Da completare prima di inserirla in produzione",
      };
    case "processata":
      return CICLO_STATO_ORDINE.processato;
    case "in_produzione":
      return CICLO_STATO_ORDINE.in_produzione;
    case "pronto_spedizione":
      return CICLO_STATO_ORDINE.pronto_spedizione;
    case "inviata":
      return CICLO_STATO_ORDINE.inviato;
    case "consegnata":
      return CICLO_STATO_ORDINE.chiuso;
    case "annullata":
      return { label: "Annullata", hint: "Campionatura annullata" };
    case "archiviata":
      return { label: "In archivio", hint: "Partito da più di 30 giorni" };
    default:
      return { label: stato, hint: "" };
  }
}

export function classeCicloStato(label: string): string {
  if (label === CICLO_STATO_ORDINE.inserito.label) {
    return "bg-sky-50 text-sky-800";
  }
  if (label === CICLO_STATO_ORDINE.processato.label) {
    return "bg-emerald-50 text-emerald-800";
  }
  if (label === CICLO_STATO_ORDINE.in_produzione.label) {
    return "bg-teal-50 text-teal-900";
  }
  if (label === CICLO_STATO_ORDINE.pronto_spedizione.label) {
    return "bg-amber-50 text-amber-900";
  }
  if (label === CICLO_STATO_ORDINE.inviato.label) {
    return "bg-indigo-50 text-indigo-800";
  }
  if (label === CICLO_STATO_ORDINE.chiuso.label) {
    return "bg-slate-200 text-slate-800";
  }
  if (label === "Bozza") return "bg-amber-50 text-amber-950";
  if (label === "Sospeso") return "bg-amber-100 text-amber-900";
  if (label === "In attesa sconto") return "bg-amber-100 text-amber-950";
  if (label === "Annullata") return "bg-red-50 text-red-700";
  if (label === "Consegnata" || label === "Storico") {
    return "bg-slate-100 text-slate-700";
  }
  return "bg-slate-100 text-slate-700";
}
