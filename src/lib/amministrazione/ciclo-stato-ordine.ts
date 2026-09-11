import type { CampionaturaStatoDb, OrdineStato } from "@/types/database";

/** Ciclo operativo unico merce / campionatura (ISO 9001 §8.5). */
export const CICLO_STATO_ORDINE = {
  inserito: {
    label: "Inserito",
    hint: "Ordine creato",
  },
  processato: {
    label: "Processato",
    hint: "Ordine inserito in scaletta produzione",
  },
  pronto_spedizione: {
    label: "Pronto per spedizione",
    hint: "Ordine pronto in attesa di Ritiro",
  },
  inviato: {
    label: "Inviato",
    hint: "Ordine Ritirato in viaggio",
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
    case "pronto_spedizione":
      return CICLO_STATO_ORDINE.pronto_spedizione;
    case "inviato":
    case "evaso":
      return CICLO_STATO_ORDINE.inviato;
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
    case "bozza":
      return CICLO_STATO_ORDINE.inserito;
    case "processata":
      return CICLO_STATO_ORDINE.processato;
    case "pronto_spedizione":
      return CICLO_STATO_ORDINE.pronto_spedizione;
    case "inviata":
      return CICLO_STATO_ORDINE.inviato;
    case "consegnata":
      return { label: "Consegnata", hint: "Campionatura consegnata al destinatario" };
    case "annullata":
      return { label: "Annullata", hint: "Campionatura annullata" };
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
  if (label === CICLO_STATO_ORDINE.pronto_spedizione.label) {
    return "bg-amber-50 text-amber-900";
  }
  if (label === CICLO_STATO_ORDINE.inviato.label) {
    return "bg-indigo-50 text-indigo-800";
  }
  if (label === "Sospeso") return "bg-amber-100 text-amber-900";
  if (label === "Annullata") return "bg-red-50 text-red-700";
  if (label === "Consegnata" || label === "Storico") {
    return "bg-slate-100 text-slate-700";
  }
  return "bg-slate-100 text-slate-700";
}
