import { z } from "zod";

export const ORDINE_SEZIONE_CHIAVI = [
  "azienda_cliente",
  "azienda_data",
  "prodotto",
  "quantita_prezzo",
  "quantita_confezione",
  "quantita_sconto_extra",
  "quantita_mail",
  "quantita_preventivo",
  "quantita_referente",
  "consegna",
  "spedizione_indirizzo",
  "spedizione_mezzo",
  "spedizione_carico",
  "confezione_chi",
  "confezione_movimentazione",
  "confezione_blocchi",
  "pagamento_pagamento",
  "pagamento_fattura",
  "pagamento_sdi",
  "pagamento_spedizione",
  "pagamento_mail",
] as const;

export type OrdineSezioneChiave = (typeof ORDINE_SEZIONE_CHIAVI)[number];

export const ORDINE_SEZIONE_LABEL: Record<OrdineSezioneChiave, string> = {
  azienda_cliente: "Selezione del cliente e possibile cliente",
  azienda_data: "Data ordine",
  prodotto: "Prodotto",
  quantita_prezzo: "Quantità e prezzo vendita",
  quantita_confezione: "Confezione e sconto di listino",
  quantita_sconto_extra: "Sconto extra fuori listino",
  quantita_mail: "Richiesta pervenuta per mail",
  quantita_preventivo: "Preventivo accettato",
  quantita_referente: "Referente che ha inviato",
  consegna: "Consegna",
  spedizione_indirizzo: "Indirizzo di ricezione",
  spedizione_mezzo: "Mezzo",
  spedizione_carico: "A carico",
  confezione_chi: "Chi definisce il confezionamento",
  confezione_movimentazione: "Movimentazione",
  confezione_blocchi: "Confezione (blocchi)",
  pagamento_pagamento: "Pagamento",
  pagamento_fattura: "Fattura",
  pagamento_sdi: "Invio della fattura allo SDI",
  pagamento_spedizione: "Spedizione",
  pagamento_mail: "Mail dell'ordine",
};

export type NoteSezioniOrdine = Partial<Record<OrdineSezioneChiave, string>>;

const chiaveSchema = z.enum(ORDINE_SEZIONE_CHIAVI);

export function noteSezioniDaInput(raw: unknown): NoteSezioniOrdine {
  if (!raw || typeof raw !== "object") return {};
  const out: NoteSezioniOrdine = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = chiaveSchema.safeParse(key);
    if (!parsed.success) continue;
    const testo = String(value ?? "").trim().slice(0, 2000);
    if (testo) out[parsed.data] = testo;
  }
  return out;
}

export function testoNota(
  note: NoteSezioniOrdine | null | undefined,
  chiave: OrdineSezioneChiave
): string {
  return String(note?.[chiave] ?? "").trim();
}
