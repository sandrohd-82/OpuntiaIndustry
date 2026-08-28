export type AziendaTimelineTipo =
  | "cliente"
  | "fornitore"
  | "cliente_possibile";

export type AziendaTimelineKind =
  | "webmail"
  | "rubrica"
  | "nota"
  | "ordine"
  | "fattura_emessa"
  | "fattura_ricevuta";

export type AziendaTimelineItem = {
  id: string;
  kind: AziendaTimelineKind;
  occurredAt: string;
  title: string;
  subtitle: string;
  href?: string | null;
};
