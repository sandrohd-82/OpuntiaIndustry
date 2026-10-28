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
  quantita_mail: "Richiesta pervenuta per",
  quantita_preventivo: "Preventivo",
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

export const RICHIESTA_CANALI = ["mail", "telefono", "persona", "altro"] as const;

export type RichiestaCanale = (typeof RICHIESTA_CANALI)[number];

export const RICHIESTA_CANALE_LABEL: Record<RichiestaCanale, string> = {
  mail: "Mail",
  telefono: "Telefono",
  persona: "Di persona",
  altro: "Altro",
};

const RICHIESTA_CANALE_DA_LABEL: Record<string, RichiestaCanale> = {
  Mail: "mail",
  Telefono: "telefono",
  "Di persona": "persona",
  Altro: "altro",
};

export function parseRichiestaPervenuta(testo: string): {
  canale: RichiestaCanale;
  nota: string;
} {
  const raw = testo.trim();
  const match = raw.match(
    /^Canale: (Mail|Telefono|Di persona|Altro)(?:\r?\n([\s\S]*))?$/
  );
  if (!match) return { canale: "mail", nota: raw };
  return {
    canale: RICHIESTA_CANALE_DA_LABEL[match[1] ?? ""] ?? "mail",
    nota: (match[2] ?? "").trim(),
  };
}

export function testoRichiestaPervenuta(
  canale: RichiestaCanale,
  nota: string
): string {
  const label = RICHIESTA_CANALE_LABEL[canale];
  const body = nota.trim();
  return body ? `Canale: ${label}\n${body}` : `Canale: ${label}`;
}

export function richiestaPervenutaValida(
  canale: RichiestaCanale,
  nota: string
): string | null {
  if (canale === "mail") return null;
  if (nota.trim().length < 3) {
    return "Per telefono, di persona o altro scrivi come è avvenuta la richiesta.";
  }
  return null;
}
