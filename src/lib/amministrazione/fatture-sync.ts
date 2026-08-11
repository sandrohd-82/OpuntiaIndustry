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
  const items = Array.isArray(raw.items)
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
    righe.push({
      prodottoId: null,
      codice,
      descrizione,
      quantita,
      prezzoUnitario,
      importo: importoRiga(quantita, prezzoUnitario),
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
  const items = Array.isArray(raw.items) ? raw.items : [];
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

export function buildFatturaSyncQueueItem(input: {
  doc: FicDocumentNormalized;
  kind: FatturaKind;
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
}): FatturaSyncQueueItem {
  const righe = extractRigheFromFicRaw(input.doc.raw);
  const spedizione = extractSpedizioneFromFicRaw(input.doc.raw);
  const ivaPercentuale = extractIvaPercentFromFicRaw(input.doc.raw);
  const totals = calcolaTotaliFattura({
    righe,
    spedizione,
    ivaPercentuale,
  });
  const entity = entityStubFromDoc(input.doc);
  const draft = draftFromFicEntity(entity);

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
    ivaPercentuale,
    imponibile: totals.imponibile,
    imposta: totals.imposta,
    totale: totals.totale || input.doc.amountGross,
    righe,
    anagraficaMode: input.existingId ? "existing" : "create",
    existingId: input.existingId,
    existingLabel: input.existingLabel,
    proposedTarga: input.proposedTarga,
    draft,
  };
}

export { normalizeVatKey };
