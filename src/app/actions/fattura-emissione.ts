"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  aliquoteIvaOptions,
  buildDescrizioneDocumento,
  buildNumeroInternoEmissione,
  calcolaTotaliEmissione,
  emissioneInputSchema,
  splitNumeroForFic,
  type EmissioneParsed,
} from "@/lib/amministrazione/fattura-emissione";
import { mapCompanyFiscalProfileRow } from "@/lib/amministrazione/fiscal-profile";
import { year2FromDate } from "@/lib/amministrazione/fatture";
import {
  createIssuedDocument,
  fetchFicVatTypes,
  resolveFicVatId,
  sendIssuedDocumentCourtesyEmail,
  sendIssuedDocumentToSdi,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type {
  ClienteRow,
  CompanyFiscalProfileRow,
  FatturaEmessaInsert,
  FatturaEmessaRigaInsert,
  FatturaEmessaRow,
} from "@/types/database";

async function nextSeqEmissioneAnnoCliente(
  clienteId: string,
  codiceTarga: string,
  dataDocumento: string
): Promise<number> {
  const supabase = await createClient();
  const aa = year2FromDate(dataDocumento);
  const targa = codiceTarga.trim().toUpperCase();
  const { data, error } = await supabase
    .from("fatture_emesse")
    .select("numero_interno, cliente_id, data_emissione")
    .eq("cliente_id", clienteId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const re = new RegExp(
    `^Ft-${aa}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let maxParsed = 0;
  for (const row of data ?? []) {
    const year = String(row.data_emissione ?? "").slice(0, 4);
    const yy = year.length === 4 ? year.slice(2) : "";
    if (yy !== aa) continue;
    const m = String(row.numero_interno).match(re);
    if (m) maxParsed = Math.max(maxParsed, Number(m[1]));
  }
  return maxParsed + 1;
}

export async function previewNumeroEmissioneAction(input: {
  clienteId: string;
  codiceTarga: string;
  dataDocumento: string;
}): Promise<
  | { success: true; numeroInterno: string; numeroFattura: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const seq = await nextSeqEmissioneAnnoCliente(
      input.clienteId,
      input.codiceTarga,
      input.dataDocumento
    );
    const nums = buildNumeroInternoEmissione({
      dataDocumento: input.dataDocumento,
      codiceTarga: input.codiceTarga,
      seq,
    });
    return { success: true, ...nums };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima numero non disponibile.",
    };
  }
}

export async function getAliquoteEmissioneAction(): Promise<
  | { success: true; aliquote: number[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("company_fiscal_profile")
      .select("*")
      .limit(1)
      .maybeSingle();
    const profile = data
      ? mapCompanyFiscalProfileRow(data as CompanyFiscalProfileRow)
      : null;
    return {
      success: true,
      aliquote: aliquoteIvaOptions(profile?.tipiColture ?? []),
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Aliquote non disponibili.",
    };
  }
}

function validateClienteFiscale(c: ClienteRow): string | null {
  const sedeOk =
    Boolean(c.sede_amm_indirizzo?.trim()) &&
    Boolean(c.sede_amm_citta?.trim()) &&
    Boolean(c.sede_amm_cap?.trim()) &&
    Boolean(c.sede_amm_provincia?.trim());
  if (!sedeOk) {
    return "Completa l’indirizzo sede amministrativa del cliente prima di emettere.";
  }
  if (c.is_privato) {
    if (!c.codice_fiscale?.trim()) {
      return "Per un privato è obbligatorio il codice fiscale.";
    }
  } else if (!c.partita_iva?.trim()) {
    return "Partita IVA cliente mancante.";
  }
  const sdi = (c.sdi_code ?? "").trim();
  const pec = (c.pec ?? "").trim();
  if (!sdi && !pec) {
    return "Indica Codice SDI oppure PEC sul cliente (necessari per la fattura elettronica).";
  }
  return null;
}

function buildFicPayload(input: {
  parsed: EmissioneParsed;
  cliente: ClienteRow;
  numeroFattura: string;
  vatTypes: Awaited<ReturnType<typeof fetchFicVatTypes>>;
}): Record<string, unknown> {
  const { parsed, cliente, numeroFattura, vatTypes } = input;
  const split = splitNumeroForFic(numeroFattura);
  const totals = calcolaTotaliEmissione(parsed.righe);

  const items_list = parsed.righe.map((r) => ({
    code: r.codice,
    name: buildDescrizioneDocumento(r.descrizione, r.note),
    net_price: r.prezzoUnitario,
    discount: r.scontoPercentuale,
    qty: r.quantita,
    vat: { id: resolveFicVatId(vatTypes, r.ivaPercentuale) },
  }));

  const entity: Record<string, unknown> = {
    name: cliente.ragione_sociale,
    vat_number: cliente.is_privato ? "" : cliente.partita_iva ?? "",
    tax_code: cliente.codice_fiscale ?? "",
    address_street: cliente.sede_amm_indirizzo ?? "",
    address_postal_code: cliente.sede_amm_cap ?? "",
    address_city: cliente.sede_amm_citta ?? "",
    address_province: cliente.sede_amm_provincia ?? "",
    country: cliente.sede_amm_nazione || "Italia",
  };
  if (cliente.sdi_code?.trim()) entity.ei_code = cliente.sdi_code.trim();
  if (cliente.pec?.trim()) entity.certified_email = cliente.pec.trim();
  if (cliente.email?.trim()) entity.email = cliente.email.trim();

  const payment: Record<string, unknown> = {
    amount: totals.totale,
    due_date: parsed.dataScadenza,
    status: "not_paid",
  };

  const notesParts = [
    parsed.noteDocumento,
    parsed.iban ? `IBAN: ${parsed.iban}` : "",
  ].filter(Boolean);

  return {
    type: "invoice",
    entity,
    date: parsed.dataDocumento,
    number: split.number,
    numeration: split.numeration,
    subject: `Fattura ${numeroFattura}`,
    visible_subject: `Fattura ${numeroFattura}`,
    currency: { id: "EUR", exchange_rate: "1.00000", symbol: "€" },
    language: { code: "it", name: "Italiano" },
    e_invoice: true,
    ei_data: {
      payment_method: parsed.paymentMethod,
      ...(parsed.iban ? { bank_iban: parsed.iban } : {}),
    },
    items_list,
    payments_list: [payment],
    ...(notesParts.length
      ? { notes: notesParts.join("\n"), show_payments: true }
      : { show_payments: true }),
  };
}

export type CreateAndSendResult =
  | {
      success: true;
      fatturaId: string;
      numeroInterno: string;
      numeroFattura: string;
      ficId: number;
      pdfUrl: string;
      eiStatus: string;
      courtesyEmailSent: boolean;
      sdiSent: boolean;
    }
  | { success: false; error: string };

/**
 * Orchestrazione ISO: valida → crea su FiC → SDI/mail → salva locale + fic_invoices + audit.
 */
export async function createAndSendInvoiceAction(
  raw: unknown
): Promise<CreateAndSendResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsedZod = emissioneInputSchema.safeParse(raw);
  if (!parsedZod.success) {
    return {
      success: false,
      error: parsedZod.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const parsed = parsedZod.data;
  const supabase = await createClient();

  const { data: clienteData, error: clienteErr } = await supabase
    .from("clienti")
    .select("*")
    .eq("id", parsed.clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (clienteErr || !clienteData) {
    return {
      success: false,
      error: clienteErr?.message ?? "Cliente non trovato.",
    };
  }
  const cliente = clienteData as ClienteRow;
  const fiscaleErr = validateClienteFiscale(cliente);
  if (fiscaleErr) return { success: false, error: fiscaleErr };

  const seq = await nextSeqEmissioneAnnoCliente(
    cliente.id,
    cliente.codice_targa,
    parsed.dataDocumento
  );
  const { numeroInterno, numeroFattura } = buildNumeroInternoEmissione({
    dataDocumento: parsed.dataDocumento,
    codiceTarga: cliente.codice_targa,
    seq,
  });

  const totals = calcolaTotaliEmissione(parsed.righe);
  const ivaHeader =
    parsed.righe.find((r) => !r.isSpedizione)?.ivaPercentuale ?? 22;
  const spedizioneRiga = parsed.righe.find((r) => r.isSpedizione);
  const spedizione = spedizioneRiga?.importo ?? 0;
  const spedizioneIva = Boolean(
    spedizioneRiga && spedizioneRiga.ivaPercentuale > 0
  );

  let vatTypes: Awaited<ReturnType<typeof fetchFicVatTypes>> = [];
  try {
    vatTypes = await fetchFicVatTypes();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Aliquote IVA FiC: ${e.message}`
          : "Impossibile leggere le aliquote IVA da Fatture in Cloud.",
    };
  }

  const ficPayload = buildFicPayload({
    parsed,
    cliente,
    numeroFattura,
    vatTypes,
  });

  let created: Awaited<ReturnType<typeof createIssuedDocument>>;
  try {
    created = await createIssuedDocument(ficPayload);
  } catch (e) {
    await writeAuditLog({
      entity_type: "fatture_emesse",
      entity_id: numeroFattura,
      action: "emissione_fic_error",
      actor_id: auth.userId,
      summary: `Errore creazione FiC ${numeroFattura}`,
      payload: {
        numeroFattura,
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Creazione documento su Fatture in Cloud non riuscita.",
    };
  }

  let eiStatus = created.eiStatus || "created";
  let sdiSent = false;
  if (parsed.sendToSdi) {
    try {
      await sendIssuedDocumentToSdi({
        ficId: created.ficId,
        dryRun: parsed.dryRunSdi,
      });
      sdiSent = true;
      eiStatus = parsed.dryRunSdi ? "dry_run" : "sent";
    } catch (e) {
      eiStatus = "send_error";
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: numeroFattura,
        action: "emissione_sdi_error",
        actor_id: auth.userId,
        summary: `Errore invio SDI ${numeroFattura}`,
        payload: {
          ficId: created.ficId,
          numeroFattura,
          error: e instanceof Error ? e.message : String(e),
        },
      });
      // Documento già creato su FiC: salviamo comunque in locale con errore SDI
    }
  }

  let courtesyEmailSent = false;
  const mailTo = (cliente.email || cliente.pec || "").trim();
  if (parsed.sendCourtesyEmail && mailTo) {
    try {
      await sendIssuedDocumentCourtesyEmail({
        ficId: created.ficId,
        recipientEmail: mailTo,
        subject: `Fattura ${numeroFattura}`,
      });
      courtesyEmailSent = true;
    } catch (e) {
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: numeroFattura,
        action: "emissione_email_error",
        actor_id: auth.userId,
        summary: `Errore mail cortesia ${numeroFattura}`,
        payload: {
          ficId: created.ficId,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  const insert: FatturaEmessaInsert & Record<string, unknown> = {
    numero_interno: numeroInterno,
    cliente_id: cliente.id,
    cliente_ragione_sociale: cliente.ragione_sociale,
    cliente_codice_targa: cliente.codice_targa,
    data_emissione: parsed.dataDocumento,
    numero_documento_esterno: numeroFattura,
    fic_id: created.ficId,
    spedizione,
    spedizione_iva_applicata: spedizioneIva,
    imponibile: totals.imponibile,
    iva_percentuale: ivaHeader,
    imposta: totals.imposta,
    totale: totals.totale,
    stato_pagamento: "da_pagare",
    documento_stato: "registrata",
    note: parsed.noteDocumento,
    created_by: auth.userId,
    updated_by: auth.userId,
    numero_fattura: numeroFattura,
    pdf_url: created.pdfUrl,
    ei_status: eiStatus,
    payment_method: parsed.paymentMethod,
    iban: parsed.iban,
    data_scadenza: parsed.dataScadenza,
    ordine_id: parsed.ordineId,
    courtesy_email_sent: courtesyEmailSent,
    emissione_errore:
      eiStatus === "send_error"
        ? "Documento creato su FiC ma invio SDI non riuscito. Verifica su Fatture in Cloud."
        : "",
  };

  const { data: fatturaRow, error: insErr } = await supabase
    .from("fatture_emesse")
    .insert(insert)
    .select("*")
    .single();

  if (insErr || !fatturaRow) {
    return {
      success: false,
      error:
        insErr?.message ??
        `Documento creato su FiC (ID ${created.ficId}) ma salvataggio locale fallito.`,
    };
  }
  const row = fatturaRow as FatturaEmessaRow & { id: string };

  const righeInsert: (FatturaEmessaRigaInsert & Record<string, unknown>)[] =
    parsed.righe.map((r, i) => ({
      fattura_id: row.id,
      prodotto_id: r.isSpedizione ? null : r.prodottoId,
      codice: r.codice,
      descrizione: r.descrizione,
      quantita: r.quantita,
      prezzo_unitario: r.prezzoUnitario,
      sconto_percentuale: r.scontoPercentuale,
      importo: r.importo,
      sort_order: i,
      iva_percentuale: r.ivaPercentuale,
      is_spedizione: r.isSpedizione,
      note: r.note,
      created_by: auth.userId,
      updated_by: auth.userId,
    }));

  const { error: righeErr } = await supabase
    .from("fatture_emesse_righe")
    .insert(righeInsert);
  if (righeErr) {
    return {
      success: false,
      error: `Fattura salvata ma righe: ${righeErr.message}`,
    };
  }

  await supabase.from("fic_invoices").upsert(
    {
      fic_id: created.ficId,
      type: "issued",
      number: numeroFattura,
      entity_name: cliente.ragione_sociale,
      entity_vat: cliente.partita_iva ?? "",
      amount_gross: totals.totale,
      date: parsed.dataDocumento,
      due_date: parsed.dataScadenza,
      status: "not_paid",
      raw_data: created.raw,
      last_synced_at: new Date().toISOString(),
      created_by: auth.userId,
      updated_by: auth.userId,
      cliente_id: cliente.id,
      fattura_emessa_id: row.id,
      pdf_url: created.pdfUrl,
      ei_status: eiStatus,
      deleted_at: null,
    },
    { onConflict: "fic_id,type" }
  );

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: row.id,
    action: "emissione_fic",
    actor_id: auth.userId,
    summary: `Emessa fattura ${numeroFattura} (FiC ${created.ficId})`,
    payload: {
      numeroInterno,
      numeroFattura,
      ficId: created.ficId,
      pdfUrl: created.pdfUrl,
      eiStatus,
      sdiSent,
      courtesyEmailSent,
      dryRunSdi: parsed.dryRunSdi,
    },
  });

  return {
    success: true,
    fatturaId: row.id,
    numeroInterno,
    numeroFattura,
    ficId: created.ficId,
    pdfUrl: created.pdfUrl,
    eiStatus,
    courtesyEmailSent,
    sdiSent,
  };
}
