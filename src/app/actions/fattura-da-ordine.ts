"use server";

import { writeAuditLog } from "@/lib/audit";
import { scanPromozioniDaFattureAction } from "@/app/actions/lead-promozione";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  buildDescrizioneDocumento,
  buildNumeroInternoEmissione,
  calcolaTotaliEmissione,
  splitNumeroForFic,
} from "@/lib/amministrazione/fattura-emissione";
import { mapClienteRow, type Cliente } from "@/lib/amministrazione/clienti";
import { todayIsoDate, year2FromDate } from "@/lib/amministrazione/fatture";
import {
  applyTotaleToPiano,
  emailsClienteUniche,
  ordinePagamentoPianoSchema,
  pianoToFicPayments,
  tipoPagamentoFromPiano,
  validatePianoVsTotale,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import {
  createIssuedDocument,
  fetchFicVatTypes,
  resolveFicVatId,
  sendIssuedDocumentCourtesyEmail,
  sendIssuedDocumentToSdi,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type {
  ClienteRow,
  FatturaEmessaInsert,
  FatturaEmessaRigaInsert,
  FatturaEmessaRow,
  OrdineRigaRow,
  OrdineRow,
} from "@/types/database";

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

function pianoFromOrdineRate(
  ordine: OrdineRow,
  rateRows: Array<{
    sort_order: number;
    importo: number;
    tipo_scadenza: string | null;
    data_pagamento: string | null;
    note: string;
  }>,
  totale: number
): OrdinePagamentoPiano {
  const modalita =
    ordine.pagamento_modalita === "dilazione" ||
    ordine.tipo_pagamento === "dilazionato"
      ? "dilazione"
      : "unica";
  const tipoUnica =
    ordine.tipo_pagamento === "anticipato" ||
    ordine.tipo_pagamento === "alla_consegna" ||
    ordine.tipo_pagamento === "pronto_magazzino" ||
    ordine.tipo_pagamento === "posticipato"
      ? ordine.tipo_pagamento
      : "alla_consegna";
  if (!rateRows.length) {
    return applyTotaleToPiano(
      {
        modalita,
        tipoUnica,
        rate: [
          {
            sortOrder: 0,
            importo: totale,
            tipoScadenza: tipoUnica,
            dataPagamento: null,
            note: "",
          },
        ],
      },
      totale
    );
  }
  return {
    modalita,
    tipoUnica:
      (rateRows[0]?.tipo_scadenza as typeof tipoUnica) || tipoUnica,
    rate: rateRows
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r, i) => ({
        sortOrder: i,
        importo: Number(r.importo) || 0,
        tipoScadenza:
          i === 0
            ? ((r.tipo_scadenza as typeof tipoUnica) || tipoUnica)
            : null,
        dataPagamento: r.data_pagamento,
        note: r.note ?? "",
      })),
  };
}

export async function getFatturaA4ContextAction(input: {
  ordineId: string;
}): Promise<
  | {
      success: true;
      ordineId: string;
      numeroOrdine: string;
      cliente: Cliente;
      emails: string[];
      piano: OrdinePagamentoPiano;
      dataConsegna: string | null;
      dataDocumento: string;
      numeroInterno: string;
      numeroFattura: string;
      righe: Array<{
        prodottoId: string | null;
        codice: string;
        descrizione: string;
        quantita: number;
        unitaMisura: string;
        prezzoUnitario: number;
        scontoPercentuale: number;
        ivaPercentuale: number;
        isSpedizione: boolean;
        note: string;
      }>;
      totale: number;
      imponibile: number;
      imposta: number;
      fatturaEsistenteId: string | null;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const supabase = await createClient();
    const { data: ordineData, error: ordErr } = await supabase
      .from("ordini")
      .select("*")
      .eq("id", input.ordineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (ordErr || !ordineData) {
      return { success: false, error: ordErr?.message ?? "Ordine non trovato." };
    }
    const ordine = ordineData as OrdineRow;
    if (!ordine.cliente_id) {
      return {
        success: false,
        error:
          "La fattura si emette solo su un cliente registrato (non su possibile cliente).",
      };
    }
    const [{ data: righeData }, { data: rateData }, { data: clienteData }] =
      await Promise.all([
        supabase
          .from("ordini_righe")
          .select("*")
          .eq("ordine_id", ordine.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("ordini_pagamento_rate")
          .select("*")
          .eq("ordine_id", ordine.id)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true }),
        supabase
          .from("clienti")
          .select("*")
          .eq("id", ordine.cliente_id)
          .is("deleted_at", null)
          .maybeSingle(),
      ]);
    if (!clienteData) {
      return { success: false, error: "Cliente dell’ordine non trovato." };
    }
    const clienteRow = clienteData as ClienteRow;
    const cliente = mapClienteRow(clienteRow);
    const righeOrdine = (righeData ?? []) as OrdineRigaRow[];
    const righe = righeOrdine.map((r) => ({
      prodottoId: r.prodotto_id,
      codice: r.prodotto_codice,
      descrizione: r.prodotto_nome,
      quantita: Number(r.quantita),
      unitaMisura: r.unita_misura ?? "kg",
      prezzoUnitario: Number(r.prezzo_unitario),
      scontoPercentuale: 0,
      ivaPercentuale: Number(r.iva_percentuale) || 22,
      isSpedizione: false,
      note: "",
    }));
    if (Number(ordine.trasporto_imponibile) > 0) {
      righe.push({
        prodottoId: null,
        codice: "SPED",
        descrizione: "Spedizione",
        quantita: 1,
        unitaMisura: "nr",
        prezzoUnitario: Number(ordine.trasporto_imponibile),
        scontoPercentuale: 0,
        ivaPercentuale: Number(ordine.trasporto_iva_percentuale) || 0,
        isSpedizione: true,
        note: "",
      });
    }
    const totals = calcolaTotaliEmissione(
      righe.map((r) => ({
        importo: r.quantita * r.prezzoUnitario,
        ivaPercentuale: r.ivaPercentuale,
      }))
    );
    const dataDocumento = todayIsoDate();
    const seq = await nextSeqEmissioneAnnoCliente(
      cliente.id,
      cliente.codiceTarga,
      dataDocumento
    );
    const nums = buildNumeroInternoEmissione({
      dataDocumento,
      codiceTarga: cliente.codiceTarga,
      seq,
    });
    const { data: existing } = await supabase
      .from("fatture_emesse")
      .select("id")
      .eq("ordine_id", ordine.id)
      .is("deleted_at", null)
      .eq("tipo_documento", "fattura")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      success: true,
      ordineId: ordine.id,
      numeroOrdine: ordine.numero_interno,
      cliente,
      emails: emailsClienteUniche(cliente),
      piano: pianoFromOrdineRate(
        ordine,
        (rateData ?? []) as Array<{
          sort_order: number;
          importo: number;
          tipo_scadenza: string | null;
          data_pagamento: string | null;
          note: string;
        }>,
        totals.totale
      ),
      dataConsegna: ordine.data_consegna ?? ordine.data_consegna_stimata,
      dataDocumento,
      numeroInterno: nums.numeroInterno,
      numeroFattura: nums.numeroFattura,
      righe,
      totale: totals.totale,
      imponibile: totals.imponibile,
      imposta: totals.imposta,
      fatturaEsistenteId: existing?.id ? String(existing.id) : null,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Contesto fattura non disponibile.",
    };
  }
}

const saveSchema = z.object({
  ordineId: z.string().uuid(),
  fatturaId: z.string().uuid().nullable().optional(),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invioEmail: z.string().email("Email non valida").or(z.literal("")).optional(),
  inviaOra: z.boolean(),
  sendToSdi: z.boolean().optional().default(true),
  piano: ordinePagamentoPianoSchema,
  noteDocumento: z.string().optional().default(""),
});

export type SalvaFatturaDaOrdineResult =
  | {
      success: true;
      fatturaId: string;
      numeroInterno: string;
      numeroFattura: string;
      inviata: boolean;
      ficId: number | null;
      pdfUrl: string;
      eiStatus: string;
      courtesyEmailSent: boolean;
      sdiSent: boolean;
      warning?: string;
    }
  | { success: false; error: string };

export async function saveFatturaDaOrdineAction(
  raw: unknown
): Promise<SalvaFatturaDaOrdineResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati fattura non validi.",
    };
  }
  const input = parsed.data;
  const ctx = await getFatturaA4ContextAction({ ordineId: input.ordineId });
  if (!ctx.success) return ctx;

  const piano = applyTotaleToPiano(input.piano, ctx.totale);
  const pianoErr = validatePianoVsTotale(piano, ctx.totale);
  if (pianoErr) return { success: false, error: pianoErr };

  const supabase = await createClient();
  const { data: clienteData } = await supabase
    .from("clienti")
    .select("*")
    .eq("id", ctx.cliente.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!clienteData) return { success: false, error: "Cliente non trovato." };
  const clienteRow = clienteData as ClienteRow;

  if (input.inviaOra) {
    const fisc = validateClienteFiscale(clienteRow);
    if (fisc) return { success: false, error: fisc };
  }

  const ivaHeader =
    ctx.righe.find((r) => !r.isSpedizione)?.ivaPercentuale ?? 22;
  const spedizioneRiga = ctx.righe.find((r) => r.isSpedizione);
  const payments = pianoToFicPayments({
    piano,
    oggi: input.dataDocumento,
    dataConsegna: ctx.dataConsegna,
  });
  const dataScadenza = payments[0]?.due_date ?? input.dataDocumento;

  let fatturaId = input.fatturaId ?? ctx.fatturaEsistenteId;
  let numeroInterno = ctx.numeroInterno;
  let numeroFattura = ctx.numeroFattura;

  if (fatturaId) {
    const { data: existing } = await supabase
      .from("fatture_emesse")
      .select("*")
      .eq("id", fatturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      const row = existing as FatturaEmessaRow;
      numeroInterno = row.numero_interno;
      numeroFattura = row.numero_fattura || ctx.numeroFattura;
      if (row.fic_id && input.inviaOra) {
        return inviaFatturaSalvataAction({
          fatturaId: row.id,
          invioEmail: input.invioEmail ?? row.invio_email,
          sendToSdi: input.sendToSdi,
        });
      }
      const { error: upErr } = await supabase
        .from("fatture_emesse")
        .update({
          data_emissione: input.dataDocumento,
          data_scadenza: dataScadenza,
          imponibile: ctx.imponibile,
          imposta: ctx.imposta,
          totale: ctx.totale,
          iva_percentuale: ivaHeader,
          spedizione: spedizioneRiga?.prezzoUnitario ?? 0,
          spedizione_iva_applicata: Boolean(
            spedizioneRiga && spedizioneRiga.ivaPercentuale > 0
          ),
          note: input.noteDocumento.trim(),
          invio_email: (input.invioEmail ?? "").trim(),
          pagamento_modalita: piano.modalita,
          tipo_scadenza_unica:
            piano.modalita === "unica" ? piano.tipoUnica : null,
          payment_method: "MP05",
          iban: AGRINSICILIA_COORDINATE.iban,
          updated_by: auth.userId,
        })
        .eq("id", fatturaId);
      if (upErr) return { success: false, error: upErr.message };
      await supabase
        .from("fatture_emesse_dilazioni")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: auth.userId,
        })
        .eq("fattura_id", fatturaId)
        .is("deleted_at", null);
    } else {
      fatturaId = null;
    }
  }

  if (!fatturaId) {
    const insert: FatturaEmessaInsert & Record<string, unknown> = {
      numero_interno: numeroInterno,
      cliente_id: ctx.cliente.id,
      cliente_ragione_sociale: ctx.cliente.ragioneSociale,
      cliente_codice_targa: ctx.cliente.codiceTarga,
      data_emissione: input.dataDocumento,
      numero_documento_esterno: numeroFattura,
      numero_fattura: numeroFattura,
      spedizione: spedizioneRiga?.prezzoUnitario ?? 0,
      spedizione_iva_applicata: Boolean(
        spedizioneRiga && spedizioneRiga.ivaPercentuale > 0
      ),
      spedizione_iva_percentuale: spedizioneRiga?.ivaPercentuale ?? 22,
      imponibile: ctx.imponibile,
      iva_percentuale: ivaHeader,
      imposta: ctx.imposta,
      totale: ctx.totale,
      stato_pagamento: "da_pagare",
      documento_stato: "bozza",
      note: input.noteDocumento.trim(),
      created_by: auth.userId,
      updated_by: auth.userId,
      payment_method: "MP05",
      iban: AGRINSICILIA_COORDINATE.iban,
      data_scadenza: dataScadenza,
      ordine_id: input.ordineId,
      courtesy_email_sent: false,
      origine: "emissione_gestionale",
      invio_email: (input.invioEmail ?? "").trim(),
      pagamento_modalita: piano.modalita,
      tipo_scadenza_unica: piano.modalita === "unica" ? piano.tipoUnica : null,
    };
    const { data: fatturaRow, error: insErr } = await supabase
      .from("fatture_emesse")
      .insert(insert)
      .select("*")
      .single();
    if (insErr || !fatturaRow) {
      return {
        success: false,
        error: insErr?.message ?? "Salvataggio fattura non riuscito.",
      };
    }
    fatturaId = (fatturaRow as FatturaEmessaRow).id;
    const righeInsert: (FatturaEmessaRigaInsert & Record<string, unknown>)[] =
      ctx.righe.map((r, i) => ({
        fattura_id: fatturaId!,
        prodotto_id: r.isSpedizione ? null : r.prodottoId,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzo_unitario: r.prezzoUnitario,
        sconto_percentuale: r.scontoPercentuale,
        importo: r.quantita * r.prezzoUnitario,
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
      return { success: false, error: `Fattura salvata ma righe: ${righeErr.message}` };
    }
  }

  const { error: dilErr } = await supabase.from("fatture_emesse_dilazioni").insert(
    payments.map((p, i) => ({
      fattura_id: fatturaId!,
      data_scadenza: p.due_date,
      importo: p.amount,
      stato_pagamento: "da_pagare" as const,
      sort_order: i,
      tipo_scadenza:
        i === 0
          ? piano.modalita === "unica"
            ? piano.tipoUnica
            : (piano.rate[0]?.tipoScadenza ?? null)
          : null,
      note: piano.rate[i]?.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    }))
  );
  if (dilErr) {
    return { success: false, error: `Dilazioni: ${dilErr.message}` };
  }

  await supabase
    .from("ordini")
    .update({
      tipo_pagamento: tipoPagamentoFromPiano(piano),
      pagamento_modalita: piano.modalita,
      updated_by: auth.userId,
    })
    .eq("id", input.ordineId);

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: fatturaId!,
    action: "fattura_a4_salva",
    actor_id: auth.userId,
    summary: `Salvata fattura ${numeroFattura} da ordine ${ctx.numeroOrdine}`,
    payload: {
      ordineId: input.ordineId,
      inviaOra: input.inviaOra,
      modalita: piano.modalita,
    },
  });

  if (!input.inviaOra) {
    return {
      success: true,
      fatturaId: fatturaId!,
      numeroInterno,
      numeroFattura,
      inviata: false,
      ficId: null,
      pdfUrl: "",
      eiStatus: "salvata",
      courtesyEmailSent: false,
      sdiSent: false,
    };
  }

  return inviaFatturaSalvataAction({
    fatturaId: fatturaId!,
    invioEmail: input.invioEmail ?? "",
    sendToSdi: input.sendToSdi,
  });
}

export async function inviaFatturaSalvataAction(input: {
  fatturaId: string;
  invioEmail?: string;
  sendToSdi?: boolean;
}): Promise<SalvaFatturaDaOrdineResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data: fatturaData, error } = await supabase
    .from("fatture_emesse")
    .select("*")
    .eq("id", input.fatturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !fatturaData) {
    return { success: false, error: error?.message ?? "Fattura non trovata." };
  }
  const fattura = fatturaData as FatturaEmessaRow;
  const [{ data: righe }, { data: dilazioni }, { data: clienteData }] =
    await Promise.all([
      supabase
        .from("fatture_emesse_righe")
        .select("*")
        .eq("fattura_id", fattura.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("fatture_emesse_dilazioni")
        .select("*")
        .eq("fattura_id", fattura.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("clienti")
        .select("*")
        .eq("id", fattura.cliente_id)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
  if (!clienteData) return { success: false, error: "Cliente non trovato." };
  const cliente = clienteData as ClienteRow;
  const fisc = validateClienteFiscale(cliente);
  if (fisc) return { success: false, error: fisc };

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

  const numeroFattura =
    fattura.numero_fattura || fattura.numero_documento_esterno;
  const split = splitNumeroForFic(numeroFattura);
  const items_list = (righe ?? []).map((r) => ({
    code: r.codice,
    name: buildDescrizioneDocumento(r.descrizione, r.note ?? ""),
    net_price: Number(r.prezzo_unitario),
    discount: Number(r.sconto_percentuale) || 0,
    qty: Number(r.quantita),
    vat: { id: resolveFicVatId(vatTypes, Number(r.iva_percentuale) || 22) },
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
  const mailTo = (input.invioEmail || fattura.invio_email || cliente.email || "").trim();
  if (mailTo) entity.email = mailTo;

  const payments_list =
    (dilazioni ?? []).length > 0
      ? (dilazioni ?? []).map((d) => ({
          amount: Number(d.importo),
          due_date: d.data_scadenza,
          status: "not_paid",
        }))
      : [
          {
            amount: Number(fattura.totale),
            due_date: fattura.data_scadenza || fattura.data_emissione,
            status: "not_paid",
          },
        ];

  const ficPayload = {
    type: "invoice",
    entity,
    date: fattura.data_emissione,
    number: split.number,
    numeration: split.numeration,
    subject: `Fattura ${numeroFattura}`,
    visible_subject: `Fattura ${numeroFattura}`,
    currency: { id: "EUR", exchange_rate: "1.00000", symbol: "€" },
    language: { code: "it", name: "Italiano" },
    e_invoice: true,
    ei_data: {
      payment_method: fattura.payment_method || "MP05",
      ...(fattura.iban ? { bank_iban: fattura.iban } : {}),
    },
    items_list,
    payments_list,
    notes: fattura.note || undefined,
    show_payments: true,
  };

  let ficId = fattura.fic_id;
  let pdfUrl = fattura.pdf_url || "";
  let eiStatus = fattura.ei_status || "created";
  if (!ficId) {
    try {
      const created = await createIssuedDocument(ficPayload);
      ficId = created.ficId;
      pdfUrl = created.pdfUrl;
      eiStatus = created.eiStatus || "created";
    } catch (e) {
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: fattura.id,
        action: "emissione_fic_error",
        actor_id: auth.userId,
        summary: `Errore creazione FiC ${numeroFattura}`,
        payload: { error: e instanceof Error ? e.message : String(e) },
      });
      return {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Creazione documento su Fatture in Cloud non riuscita.",
      };
    }
  }

  let sdiSent = false;
  const sendToSdi = input.sendToSdi !== false;
  if (sendToSdi && ficId) {
    try {
      await sendIssuedDocumentToSdi({ ficId, dryRun: false });
      sdiSent = true;
      eiStatus = "sent";
    } catch (e) {
      eiStatus = "send_error";
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: fattura.id,
        action: "emissione_sdi_error",
        actor_id: auth.userId,
        summary: `Errore invio SDI ${numeroFattura}`,
        payload: {
          ficId,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  let courtesyEmailSent = Boolean(fattura.courtesy_email_sent);
  if (mailTo && ficId) {
    try {
      await sendIssuedDocumentCourtesyEmail({
        ficId,
        recipientEmail: mailTo,
        subject: `Fattura ${numeroFattura}`,
      });
      courtesyEmailSent = true;
    } catch (e) {
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: fattura.id,
        action: "emissione_email_error",
        actor_id: auth.userId,
        summary: `Errore mail cortesia ${numeroFattura}`,
        payload: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("fatture_emesse")
    .update({
      fic_id: ficId,
      pdf_url: pdfUrl,
      ei_status: eiStatus,
      documento_stato: "registrata",
      courtesy_email_sent: courtesyEmailSent,
      invio_email: mailTo,
      sent_at: now,
      sent_by: auth.userId,
      emissione_errore:
        eiStatus === "send_error"
          ? "Documento creato su FiC ma invio SDI non riuscito. Verifica su Fatture in Cloud."
          : "",
      updated_by: auth.userId,
    })
    .eq("id", fattura.id);

  await supabase.from("fic_invoices").upsert(
    {
      fic_id: ficId,
      type: "issued",
      number: numeroFattura,
      entity_name: cliente.ragione_sociale,
      entity_vat: cliente.partita_iva ?? "",
      amount_gross: fattura.totale,
      date: fattura.data_emissione,
      due_date: fattura.data_scadenza,
      status: "not_paid",
      last_synced_at: now,
      created_by: auth.userId,
      updated_by: auth.userId,
      cliente_id: cliente.id,
      fattura_emessa_id: fattura.id,
      pdf_url: pdfUrl,
      ei_status: eiStatus,
      deleted_at: null,
    },
    { onConflict: "fic_id,type" }
  );

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: fattura.id,
    action: "emissione_fic",
    actor_id: auth.userId,
    summary: `Emessa fattura ${numeroFattura} (FiC ${ficId})`,
    payload: { ficId, eiStatus, sdiSent, courtesyEmailSent, mailTo },
  });
  void scanPromozioniDaFattureAction();

  return {
    success: true,
    fatturaId: fattura.id,
    numeroInterno: fattura.numero_interno,
    numeroFattura,
    inviata: true,
    ficId: ficId ?? null,
    pdfUrl,
    eiStatus,
    courtesyEmailSent,
    sdiSent,
    warning:
      eiStatus === "send_error"
        ? "Fattura creata su Fatture in Cloud ma l’invio SDI non è riuscito."
        : undefined,
  };
}
