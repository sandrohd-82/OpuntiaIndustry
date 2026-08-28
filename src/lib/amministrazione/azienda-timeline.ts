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
  /** Solo kind=nota: corpo e allegati per anteprima ricca */
  notaBody?: string;
  notaBodyRich?: string;
  notaAllegati?: Array<{
    id: string;
    kind: string;
    label: string;
    url: string;
    storagePath?: string;
  }>;
};
