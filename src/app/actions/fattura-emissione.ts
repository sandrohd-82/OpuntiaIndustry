"use server";

import { writeAuditLog } from "@/lib/audit";
import { scanPromozioniDaFattureAction } from "@/app/actions/lead-promozione";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { FASE_TEST_NUOVA_FATTURA } from "@/lib/amministrazione/fattura-emissione-test";
import { EMAIL_CONTROLLO_DEFAULT } from "@/lib/amministrazione/prova-ordine";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";
import { z } from "zod";
import {
  aliquoteIvaOptions,
  buildDescrizioneDocumento,
  calcolaTotaliEmissione,
  emissioneInputSchema,
  splitNumeroForFic,
  type EmissioneParsed,
} from "@/lib/amministrazione/fattura-emissione";
import { mapCompanyFiscalProfileRow } from "@/lib/amministrazione/fiscal-profile";
import {
  anteprimaNumeroFattura,
} from "@/lib/amministrazione/numero-fattura";
import { voceScontoFattureInCloud } from "@/lib/amministrazione/fattura-a4-documento";
import { leggiMarcaSconti } from "@/lib/amministrazione/sconto-fuori-listino";
import { provinciaCessionarioSdi } from "@/lib/address/province-regioni";
import {
  aggiornaProvinciaDocumentoEmesso,
  createIssuedDocument,
  aliquotePerEmissione,
  resolveFicVatId,
  sendIssuedDocumentToSdi,
} from "@/lib/fic";
import type {
  ClienteRow,
  CompanyFiscalProfileRow,
  FatturaEmessaInsert,
  FatturaEmessaRigaInsert,
  FatturaEmessaRow,
} from "@/types/database";

export async function previewNumeroEmissioneAction(input: {
  clienteId: string;
  dataDocumento: string;
}): Promise<
  | { success: true; numeroInterno: string; numeroFattura: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const supabase = await createClient();
    const nums = await anteprimaNumeroFattura(supabase, input.dataDocumento);
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
  vatTypes: Awaited<ReturnType<typeof aliquotePerEmissione>>;
}): Record<string, unknown> {
  const { parsed, cliente, numeroFattura, vatTypes } = input;
  const split = splitNumeroForFic(numeroFattura);

  const items_list = parsed.righe.map((r) => {
    const marca = leggiMarcaSconti(r.note);
    const voce = voceScontoFattureInCloud({
      prezzoUnitario: r.prezzoUnitario,
      quantita: r.quantita,
      scontoPercentuale: r.scontoPercentuale,
      scontoListinoPct: r.scontoListinoPct,
      scontoExtraPct: r.scontoExtraPct,
    });
    const nome = buildDescrizioneDocumento(r.descrizione, marca.note);
    return {
      code: r.codice,
      name: voce.dettaglio ? `${nome}\n${voce.dettaglio}` : nome,
      net_price: voce.netPrice,
      discount: voce.discount,
      qty: r.quantita,
      vat: { id: resolveFicVatId(vatTypes, r.ivaPercentuale) },
    };
  });

  const provinciaSdi = provinciaCessionarioSdi(
    cliente.sede_amm_provincia ?? "",
    cliente.sede_amm_nazione || "Italia"
  );
  const entity: Record<string, unknown> = {
    name: cliente.ragione_sociale,
    vat_number: cliente.is_privato ? "" : cliente.partita_iva ?? "",
    tax_code: cliente.codice_fiscale ?? "",
    address_street: cliente.sede_amm_indirizzo ?? "",
    address_postal_code: cliente.sede_amm_cap ?? "",
    address_city: cliente.sede_amm_citta ?? "",
    country: cliente.sede_amm_nazione || "Italia",
  };
  if (provinciaSdi.ok && provinciaSdi.provincia) {
    entity.address_province = provinciaSdi.provincia;
  }
  if (cliente.sdi_code?.trim()) entity.ei_code = cliente.sdi_code.trim();
  if (cliente.pec?.trim()) entity.certified_email = cliente.pec.trim();
  if (cliente.email?.trim()) entity.email = cliente.email.trim();

  return {
    type: "invoice",
    entity,
    date: parsed.dataDocumento,
    number: split.number,
    ...(split.numeration ? { numeration: split.numeration } : {}),
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
    payments_list: parsed.payments.map((p) => ({
      amount: p.amount,
      due_date: p.due_date,
      status: p.status,
    })),
    ...(parsed.noteDocumento
      ? { notes: parsed.noteDocumento, show_payments: true }
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

  if (!parsed.sendToSdi) {
    return {
      success: false,
      error:
        "Senza invio allo SDI il numero non viene assegnato e la mail non parte.",
    };
  }

  const provinciaSdi = provinciaCessionarioSdi(
    cliente.sede_amm_provincia ?? "",
    cliente.sede_amm_nazione || "Italia"
  );
  if (!provinciaSdi.ok) return { success: false, error: provinciaSdi.error };

  let numeroInterno: string;
  let numeroFattura: string;
  try {
    const { data, error } = await supabase.rpc("assegna_numero_fattura_sdi", {
      p_fattura_id: null,
      p_data: parsed.dataDocumento,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const obj =
      typeof row === "string"
        ? (JSON.parse(row) as { numero_fattura?: string; numero_interno?: string })
        : (row as { numero_fattura?: string; numero_interno?: string } | null);
    numeroFattura = String(obj?.numero_fattura ?? "").trim();
    numeroInterno = String(obj?.numero_interno ?? "").trim() || `Ft-${numeroFattura}`;
    if (!numeroFattura) throw new Error("Numerazione fattura non valida.");
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Impossibile assegnare il numero fattura.",
    };
  }

  const totals = calcolaTotaliEmissione(parsed.righe);
  const ivaHeader =
    parsed.righe.find((r) => !r.isSpedizione)?.ivaPercentuale ?? 22;
  const spedizioneRiga = parsed.righe.find((r) => r.isSpedizione);
  const spedizione = spedizioneRiga?.importo ?? 0;
  const spedizioneIva = Boolean(
    spedizioneRiga && spedizioneRiga.ivaPercentuale > 0
  );

  let vatTypes: Awaited<ReturnType<typeof aliquotePerEmissione>> = [];
  try {
    vatTypes = await aliquotePerEmissione();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Aliquote IVA FiC: ${e.message}`
          : "Impossibile leggere le aliquote IVA da Fatture in Cloud.",
    };
  }

  const voceStorta = parsed.righe.find(
    (r) =>
      !voceScontoFattureInCloud({
        prezzoUnitario: r.prezzoUnitario,
        quantita: r.quantita,
        scontoPercentuale: r.scontoPercentuale,
        scontoListinoPct: r.scontoListinoPct,
        scontoExtraPct: r.scontoExtraPct,
      }).coerente
  );
  if (voceStorta) {
    return {
      success: false,
      error: `Invio bloccato: lo sconto della riga ${voceStorta.codice} non chiude al centesimo. Nessuna chiamata è partita.`,
    };
  }
  const sommaRate = parsed.payments.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sommaRate - totals.totale) > 0.009) {
    return {
      success: false,
      error: `Invio bloccato: le scadenze (${sommaRate.toFixed(2)} €) non coincidono con il totale (${totals.totale.toFixed(2)} €). Nessuna chiamata è partita.`,
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
      await aggiornaProvinciaDocumentoEmesso(
        created.ficId,
        provinciaSdi.provincia
      );
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

  const courtesyEmailSent = false;

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
    spedizione_iva_percentuale: spedizioneIva
      ? Number(spedizioneRiga?.ivaPercentuale) || 22
      : 22,
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
    pagamento_modalita: parsed.piano.modalita,
    tipo_scadenza_unica:
      parsed.piano.modalita === "unica" ? parsed.piano.tipoUnica : null,
    ordine_id: parsed.ordineId,
    courtesy_email_sent: courtesyEmailSent,
    origine: "emissione_gestionale",
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
      unita_misura: r.unitaMisura,
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

  const { error: dilErr } = await supabase.from("fatture_emesse_dilazioni").insert(
    parsed.payments.map((p, i) => ({
      fattura_id: row.id,
      data_scadenza: p.due_date,
      importo: p.amount,
      stato_pagamento: "da_pagare" as const,
      sort_order: i,
      tipo_scadenza:
        i === 0
          ? (parsed.piano.modalita === "unica"
            ? parsed.piano.tipoUnica
            : (parsed.piano.rate[0]?.tipoScadenza ?? null))
          : null,
      note: parsed.piano.rate[i]?.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    }))
  );
  if (dilErr) {
    return {
      success: false,
      error: `Fattura salvata ma scadenze: ${dilErr.message}`,
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

  void scanPromozioniDaFattureAction();

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

const mailBozzaSchema = z.object({
  accountId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  pdfBase64: z.string().min(32).max(8_000_000),
  pdfName: z.string().trim().min(5).max(120),
  clienteId: z.string().uuid(),
  to: z.string().trim().max(200).optional(),
  fatturaId: z.string().uuid().nullable().optional(),
});

async function areeNuovaFattura() {
  return requireAnyAreaAccess(["commerciale", "area-fiscale", "amministrazione"]);
}

export async function listCaselleNuovaFatturaAction(): Promise<
  | { success: true; accounts: Array<{ id: string; label: string; email: string }> }
  | { success: false; error: string }
> {
  await areeNuovaFattura();
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_accounts")
    .select("id, label, email_address")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: ((data ?? []) as Array<{
      id: string;
      label: string;
      email_address: string;
    }>).map((a) => ({
      id: a.id,
      label: a.label,
      email: a.email_address,
    })),
  };
}

/**
 * Invia la bozza mail della nuova fattura.
 * Con la fase di prova di questa pagina il destinatario è solo l'indirizzo
 * di controllo e non esiste alcun invio SDI in questa funzione.
 */
export async function inviaMailBozzaNuovaFatturaAction(raw: unknown): Promise<
  | { success: true; prova: boolean }
  | { success: false; error: string }
> {
  const { auth } = await areeNuovaFattura();
  const parsed = mailBozzaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Bozza mail non valida.",
    };
  }

  const destinatario = FASE_TEST_NUOVA_FATTURA
    ? EMAIL_CONTROLLO_DEFAULT
    : String(parsed.data.to ?? "").trim();
  if (!destinatario.includes("@")) {
    return { success: false, error: "Manca la mail di destinazione." };
  }

  if (!FASE_TEST_NUOVA_FATTURA) {
    const fatturaId = parsed.data.fatturaId ?? "";
    if (!fatturaId) {
      return {
        success: false,
        error: "La mail parte dopo la fattura inviata allo SDI.",
      };
    }
    const supabase = await createClient();
    const { data: fattura, error: fatturaErr } = await supabase
      .from("fatture_emesse")
      .select("id, created_by, deleted_at")
      .eq("id", fatturaId)
      .maybeSingle();
    if (fatturaErr) return { success: false, error: fatturaErr.message };
    if (!fattura || fattura.deleted_at) {
      return { success: false, error: "Fattura non trovata." };
    }
    if (fattura.created_by && fattura.created_by !== auth.userId) {
      return { success: false, error: "Fattura di un altro operatore." };
    }
  }

  const pdf = Buffer.from(parsed.data.pdfBase64, "base64");
  if (pdf.subarray(0, 5).toString("utf8") !== "%PDF-") {
    return { success: false, error: "L'allegato non è un PDF." };
  }
  const pdfName = parsed.data.pdfName.toLowerCase().endsWith(".pdf")
    ? parsed.data.pdfName
    : `${parsed.data.pdfName}.pdf`;

  const service = createServiceClient();
  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", parsed.data.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella non trovata." };
  }

  try {
    await sendMailViaAccount({
      account: account as AccountRow,
      to: destinatario,
      subject: parsed.data.subject,
      text: parsed.data.body,
      attachments: [
        {
          filename: pdfName.replace(/[\\/]/g, "_"),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
      traccia: {
        userId: auth.userId,
        aziendaTipo: "cliente",
        aziendaId: parsed.data.clienteId,
      },
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Invio mail non riuscito.",
    };
  }

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: parsed.data.fatturaId ?? parsed.data.clienteId,
    action: "create",
    actor_id: auth.userId,
    summary: FASE_TEST_NUOVA_FATTURA
      ? "Mail di prova della nuova fattura, senza SDI"
      : "Mail di cortesia della nuova fattura",
    payload: {
      prova: FASE_TEST_NUOVA_FATTURA,
      clienteId: parsed.data.clienteId,
      accountId: parsed.data.accountId,
      oggetto: parsed.data.subject,
    },
  });

  return { success: true, prova: FASE_TEST_NUOVA_FATTURA };
}
