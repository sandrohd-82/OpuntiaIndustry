import {
  draftFromFicEntity,
  normalizeVatKey,
  type AnagraficaSyncDraft,
} from "@/lib/amministrazione/fic-anagrafiche";
import {
  calcolaTotaliFattura,
  importoRiga,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import {
  enrichEntityFromInvoiceRaw,
  type FicDocumentNormalized,
  type FicEntityNormalized,
} from "@/lib/fic";
import type { FatturaStatoPagamento } from "@/types/database";

export type FatturaSyncLinkedHint = {
  fatturaId: string | null;
  numeroInterno: string;
  numeroEsterno: string;
  motivo: string;
};

export type FatturaSyncQueueItem = {
  ficId: number;
  kind: FatturaKind;
  numeroEsterno: string;
  dataEmissione: string;
  entityName: string;
  entityVat: string;
  amountGross: number;
  statoPagamento: FatturaStatoPagamento;
  spedizione: number;
  /** Default false in sync: IVA non applicata al trasporto. */
  spedizioneIvaApplicata: boolean;
  ivaPercentuale: number;
  imponibile: number;
  imposta: number;
  totale: number;
  righe: FatturaRiga[];
  anagraficaMode: "create" | "existing";
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
  draft: AnagraficaSyncDraft;
  /** Fattura già in Opuntia collegata a questa NC (o hint testuale). */
  linkedFattura: FatturaSyncLinkedHint | null;
  riferimentoFatturaEsterno: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value != null
      ? String(value).trim()
      : "";
}

/** Estrae righe prodotto da payload FiC (fieldset detailed). */
export function extractRigheFromFicRaw(
  raw: Record<string, unknown>
): FatturaRiga[] {
  const items = Array.isArray(raw.items_list)
    ? raw.items_list
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.products)
        ? raw.products
        : [];
  const righe: FatturaRiga[] = [];
  for (const item of items) {
    const r = asRecord(item);
    const quantita = asNumber(r.qty ?? r.quantity ?? r.amount) || 1;
    const prezzoUnitario = asNumber(
      r.net_price ?? r.price ?? r.gross_price ?? r.unit_price
    );
    const descrizione =
      asText(r.name ?? r.description ?? r.product_description) || "Voce";
    const codice = asText(r.code ?? r.product_code ?? r.sku) || "—";
    if (!descrizione && !prezzoUnitario && !quantita) continue;
    const scontoPercentuale = Math.min(
      100,
      Math.max(0, asNumber(r.discount ?? r.discount_percent ?? r.sconto))
    );
    righe.push({
      prodottoId: null,
      codice,
      descrizione,
      quantita,
      prezzoUnitario,
      scontoPercentuale,
      importo: importoRiga(quantita, prezzoUnitario, scontoPercentuale),
    });
  }
  if (righe.length === 0) {
    const gross = asNumber(raw.amount_net ?? raw.amount_gross);
    if (gross > 0) {
      righe.push({
        prodottoId: null,
        codice: "—",
        descrizione: asText(raw.subject ?? raw.description) || "Documento FiC",
        quantita: 1,
        prezzoUnitario: gross,
        scontoPercentuale: 0,
        importo: gross,
      });
    }
  }
  return righe;
}

export function extractSpedizioneFromFicRaw(
  raw: Record<string, unknown>
): number {
  return Math.max(
    0,
    asNumber(
      raw.shipping_cost ??
        raw.carriage ??
        asRecord(raw.shipping).price ??
        asRecord(raw.shipping).cost
    )
  );
}

export function extractIvaPercentFromFicRaw(
  raw: Record<string, unknown>
): number {
  const items = Array.isArray(raw.items_list)
    ? raw.items_list
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  for (const item of items) {
    const vat = asRecord(asRecord(item).vat);
    const rate = asNumber(vat.value ?? vat.rate ?? asRecord(item).vat_rate);
    if (rate > 0) return rate;
  }
  const global = asNumber(raw.vat_rate ?? asRecord(raw.vat).value);
  return global > 0 ? global : 22;
}

export function statoPagamentoFromFic(
  status: FicDocumentNormalized["status"]
): FatturaStatoPagamento {
  return status === "paid" ? "pagato" : "da_pagare";
}

function entityStubFromDoc(doc: FicDocumentNormalized): FicEntityNormalized {
  const entity = asRecord(doc.raw.entity);
  const base: FicEntityNormalized = {
    ficId: asNumber(entity.id) || doc.ficId,
    kind: doc.type === "issued" ? "client" : "supplier",
    name: doc.entityName,
    vat: doc.entityVat,
    email: asText(entity.email),
    pec: asText(entity.certified_email),
    phone: asText(entity.phone),
    sdi: asText(entity.ei_code),
    country: asText(entity.country) || "Italia",
    province: asText(entity.address_province ?? entity.province),
    city: asText(entity.address_city ?? entity.city),
    postalCode: asText(entity.address_postal_code ?? entity.postal_code),
    street: asText(entity.address_street ?? entity.address),
    shippingAddress: asText(entity.shipping_address),
  };
  return enrichEntityFromInvoiceRaw(base, doc.raw);
}

/** Riferimenti fattura citati in una nota di credito (es. 20/2025). */
export function extractFatturaRefsFromCreditNote(
  doc: FicDocumentNormalized
): string[] {
  const raw = doc.raw;
  const chunks = [
    doc.number,
    asText(raw.notes),
    asText(raw.subject),
    asText(raw.visible_subject),
    asText(raw.description),
    asText(asRecord(raw.ei_data).original_document_number),
    asText(asRecord(raw.ei_data).cig),
    JSON.stringify(raw.related ?? raw.original_document ?? ""),
  ];
  const text = chunks.join(" ");
  const refs = new Set<string>();
  for (const m of text.matchAll(
    /fattura\s*(?:n\.?|nr\.?|num\.?)?\s*([0-9]+\/[0-9]{2,4})/gi
  )) {
    refs.add(normalizeDocRef(m[1]));
  }
  for (const m of text.matchAll(/\b([0-9]{1,6}\/[0-9]{4})\b/g)) {
    refs.add(normalizeDocRef(m[1]));
  }
  return [...refs].filter(Boolean);
}

export function normalizeDocRef(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export type RegisteredFatturaHint = {
  id: string;
  numeroInterno: string;
  numeroEsterno: string;
  clienteId: string;
  entityVat: string;
  dataEmissione: string;
  totale: number;
};

/** Collega NC a fattura già registrata per riferimento / importo / periodo. */
export function matchCreditNoteToFattura(
  doc: FicDocumentNormalized,
  fatture: RegisteredFatturaHint[]
): FatturaSyncLinkedHint | null {
  const refs = extractFatturaRefsFromCreditNote(doc);
  const vat = normalizeVatKey(doc.entityVat);
  const amount = Math.abs(doc.amountGross);
  const date = doc.date || "";

  for (const ref of refs) {
    const hit = fatture.find((f) => {
      const ext = normalizeDocRef(f.numeroEsterno);
      return (
        ext === ref ||
        ext.endsWith(ref) ||
        ext.includes(ref) ||
        f.numeroInterno.includes(ref)
      );
    });
    if (hit) {
      return {
        fatturaId: hit.id,
        numeroInterno: hit.numeroInterno,
        numeroEsterno: hit.numeroEsterno || ref,
        motivo: `Riferimento documento «${ref}»`,
      };
    }
  }

  // Match debole: stessa P.IVA, importo ≈, data entro 120 giorni
  const candidates = fatture.filter((f) => {
    if (vat && normalizeVatKey(f.entityVat) !== vat) return false;
    const diff = Math.abs(Math.abs(f.totale) - amount);
    if (amount > 0 && diff > Math.max(0.5, amount * 0.02)) return false;
    if (date && f.dataEmissione) {
      const a = Date.parse(date);
      const b = Date.parse(f.dataEmissione);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const days = Math.abs(a - b) / (1000 * 60 * 60 * 24);
        if (days > 120) return false;
      }
    }
    return true;
  });
  if (candidates.length === 1) {
    const hit = candidates[0];
    return {
      fatturaId: hit.id,
      numeroInterno: hit.numeroInterno,
      numeroEsterno: hit.numeroEsterno,
      motivo: "Stesso cliente, importo e periodo compatibili",
    };
  }
  if (refs.length > 0) {
    return {
      fatturaId: null,
      numeroInterno: "",
      numeroEsterno: refs[0],
      motivo: `Riferimento «${refs[0]}» (fattura non ancora in Opuntia o non trovata)`,
    };
  }
  return null;
}

/** NC pendenti correlate a una fattura FiC in coda (stesso cliente / rif / importo). */
export function creditNotesRelatedToInvoice(
  invoice: FicDocumentNormalized,
  creditNotes: FicDocumentNormalized[]
): FicDocumentNormalized[] {
  const vat = normalizeVatKey(invoice.entityVat);
  const invNum = normalizeDocRef(invoice.number);
  const amount = Math.abs(invoice.amountGross);
  return creditNotes.filter((nc) => {
    const refs = extractFatturaRefsFromCreditNote(nc);
    if (invNum && refs.some((r) => invNum.includes(r) || r.includes(invNum))) {
      return true;
    }
    const sameVat = vat && normalizeVatKey(nc.entityVat) === vat;
    const amountClose =
      amount > 0 &&
      Math.abs(Math.abs(nc.amountGross) - amount) <=
        Math.max(0.5, amount * 0.02);
    if (sameVat && amountClose) return true;
    return false;
  });
}

export function buildFatturaSyncQueueItem(input: {
  doc: FicDocumentNormalized;
  kind: FatturaKind;
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
  linkedFattura?: FatturaSyncLinkedHint | null;
}): FatturaSyncQueueItem {
  const righe = extractRigheFromFicRaw(input.doc.raw);
  const spedizione = extractSpedizioneFromFicRaw(input.doc.raw);
  const ivaPercentuale = extractIvaPercentFromFicRaw(input.doc.raw);
  const totals = calcolaTotaliFattura({
    righe,
    spedizione,
    spedizioneIvaApplicata: false,
    ivaPercentuale,
  });
  const entity = entityStubFromDoc(input.doc);
  const draft = draftFromFicEntity(entity);
  const linked = input.linkedFattura ?? null;
  const refs = extractFatturaRefsFromCreditNote(input.doc);

  return {
    ficId: input.doc.ficId,
    kind: input.kind,
    numeroEsterno: input.doc.number,
    dataEmissione:
      input.doc.date || new Date().toISOString().slice(0, 10),
    entityName: input.doc.entityName,
    entityVat: input.doc.entityVat,
    amountGross: input.doc.amountGross,
    statoPagamento: statoPagamentoFromFic(input.doc.status),
    spedizione,
    spedizioneIvaApplicata: false,
    ivaPercentuale,
    imponibile: totals.imponibile,
    imposta: totals.imposta,
    totale: totals.totale || Math.abs(input.doc.amountGross),
    righe,
    anagraficaMode: input.existingId ? "existing" : "create",
    existingId: input.existingId,
    existingLabel: input.existingLabel,
    proposedTarga: input.proposedTarga,
    draft,
    linkedFattura: linked,
    riferimentoFatturaEsterno:
      linked?.numeroEsterno || refs[0] || "",
  };
}

export { normalizeVatKey };
