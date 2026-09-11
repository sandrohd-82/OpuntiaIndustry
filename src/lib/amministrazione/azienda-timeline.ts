export type AziendaTimelineTipo =
  | "cliente"
  | "fornitore"
  | "cliente_possibile";

export type AziendaTimelineKind =
  | "webmail"
  | "rubrica"
  | "nota"
  | "ordine"
  | "campionatura"
  | "fattura_emessa"
  | "fattura_ricevuta";

export type AziendaTimelineItem = {
  id: string;
  kind: AziendaTimelineKind;
  occurredAt: string;
  title: string;
  subtitle: string;
  /** Id sorgente (mail / fattura / ordine) per Visualizza. */
  sourceId?: string;
  href?: string | null;
  /** Solo kind=nota */
  notaId?: string;
  notaBody?: string;
  notaBodyRich?: string;
  /** Data/ora evento (due_at); se assente si usa created_at. */
  notaDueAt?: string | null;
  notaCreatedAt?: string;
  notaAllegati?: Array<{
    id: string;
    kind: string;
    label: string;
    url: string;
    storagePath?: string;
  }>;
};

export const TIMELINE_FILTER_GROUPS = [
  { key: "webmail", label: "Mail", kinds: ["webmail"] },
  { key: "nota", label: "Note", kinds: ["nota"] },
  { key: "fattura", label: "Fatture", kinds: ["fattura_emessa", "fattura_ricevuta"] },
  { key: "ordine", label: "Ordini", kinds: ["ordine"] },
  { key: "campionatura", label: "Campionature", kinds: ["campionatura"] },
  { key: "rubrica", label: "Rubrica", kinds: ["rubrica"] },
] as const;

export type TimelineFilterKey = (typeof TIMELINE_FILTER_GROUPS)[number]["key"];

export type TimelineKindFilters = Record<TimelineFilterKey, boolean>;

export function emptyTimelineKindFiltersOn(): TimelineKindFilters {
  return {
    webmail: true,
    nota: true,
    fattura: true,
    ordine: true,
    campionatura: true,
    rubrica: true,
  };
}

export function timelineFilterKeyForKind(
  kind: AziendaTimelineKind
): TimelineFilterKey {
  if (kind === "fattura_emessa" || kind === "fattura_ricevuta") return "fattura";
  return kind;
}

export function timelineItemVisible(
  kind: AziendaTimelineKind,
  filters: TimelineKindFilters
): boolean {
  return filters[timelineFilterKeyForKind(kind)];
}
