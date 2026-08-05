/** Fogli di lavorazione demo — poi da DB */
export type FoglioLavorazione = {
  id: string;
  label: string;
  descrizione: string;
};

export const FOGLI_LAVORAZIONE_DEMO: FoglioLavorazione[] = [
  {
    id: "fl-2026-001",
    label: "FL-2026-001",
    descrizione: "Lavorazione fichi d’India — lotto A",
  },
  {
    id: "fl-2026-002",
    label: "FL-2026-002",
    descrizione: "Lavorazione fichi d’India — lotto B",
  },
  {
    id: "fl-2026-003",
    label: "FL-2026-003",
    descrizione: "Manutenzione / prova impianto",
  },
];
