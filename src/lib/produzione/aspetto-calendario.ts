export type AspettoGiorno = {
  nelPeriodo: boolean;
  consegnaPrevista: boolean;
  selezionato: boolean;
  pubblicato: boolean;
  confermato: boolean;
  revisione: boolean;
  annullato: boolean;
};

export type VoceLegendaCalendario = {
  chiave: keyof AspettoGiorno;
  etichetta: string;
  classe: string;
};

export const LEGENDA_CALENDARIO: readonly VoceLegendaCalendario[] = [
  { chiave: "nelPeriodo", etichetta: "Giorno nel periodo", classe: "bg-indigo-50 text-indigo-950" },
  { chiave: "consegnaPrevista", etichetta: "Consegna prevista", classe: "bg-sky-100 text-sky-950" },
  { chiave: "selezionato", etichetta: "Data scelta", classe: "bg-violet-100 text-violet-950" },
  { chiave: "pubblicato", etichetta: "Consegna pubblicata", classe: "bg-emerald-50 text-emerald-950" },
  { chiave: "confermato", etichetta: "Consegna confermata", classe: "bg-emerald-200 text-emerald-950" },
  { chiave: "revisione", etichetta: "Consegna in revisione", classe: "bg-amber-100 text-amber-950" },
  { chiave: "annullato", etichetta: "Consegna annullata", classe: "bg-slate-200 text-slate-600 line-through" },
];

export function aspettoGiorno(input: {
  nelPeriodo: boolean;
  consegnaPrevista: boolean;
  selezionato: boolean;
  stati: readonly ("bozza" | "pubblicato" | "da_ripubblicare" | "annullato")[];
  confermati: readonly boolean[];
}): AspettoGiorno {
  return {
    nelPeriodo: input.nelPeriodo,
    consegnaPrevista: input.consegnaPrevista,
    selezionato: input.selezionato,
    pubblicato: input.stati.includes("pubblicato"),
    confermato: input.confermati.some(Boolean),
    revisione: input.stati.includes("da_ripubblicare"),
    annullato: input.stati.includes("annullato"),
  };
}

/** Lo stato della consegna resta visibile sopra il colore del periodo. */
export function classeCellaCalendario(aspetto: AspettoGiorno): string {
  if (aspetto.annullato) return "bg-slate-200 text-slate-600";
  if (aspetto.revisione) return "bg-amber-100 text-amber-950";
  if (aspetto.confermato) return "bg-emerald-200 text-emerald-950";
  if (aspetto.pubblicato) return "bg-emerald-50 text-emerald-950";
  if (aspetto.selezionato) return "bg-violet-100 text-violet-950";
  if (aspetto.consegnaPrevista) return "bg-sky-100 text-sky-950";
  if (aspetto.nelPeriodo) return "bg-indigo-50 text-indigo-950";
  return "bg-white";
}
