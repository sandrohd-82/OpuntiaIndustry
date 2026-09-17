export const CLIENTE_POSSIBILE_TRATTATIVE = [
  "da_creare",
  "attiva",
  "congelata",
  "bloccata",
] as const;

export type ClientePossibileTrattativa =
  (typeof CLIENTE_POSSIBILE_TRATTATIVE)[number];

export const TRATTATIVA_META: Record<
  ClientePossibileTrattativa,
  { label: string; badgeClass: string }
> = {
  da_creare: {
    label: "Da creare",
    badgeClass: "bg-slate-200 text-slate-700",
  },
  attiva: {
    label: "Attiva",
    badgeClass: "bg-green-100 text-green-800",
  },
  congelata: {
    label: "Congelata",
    badgeClass: "bg-sky-100 text-sky-800",
  },
  bloccata: {
    label: "Bloccata",
    badgeClass: "bg-red-100 text-red-800",
  },
};

export function parseTrattativa(value: unknown): ClientePossibileTrattativa {
  if (
    value === "attiva" ||
    value === "congelata" ||
    value === "bloccata" ||
    value === "da_creare"
  ) {
    return value;
  }
  return "da_creare";
}
