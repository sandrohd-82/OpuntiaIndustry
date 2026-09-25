"use server";

import { writeAuditLog } from "@/lib/audit";
import { scanPromozioniDaFattureAction } from "@/app/actions/lead-promozione";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  buildDescrizioneDocumento,
  buildNumeroInternoEmissione,
  splitNumeroForFic,
} from "@/lib/amministrazione/fattura-emissione";
import { mapClienteRow, type Cliente } from "@/lib/amministrazione/clienti";
import {
  applyContributoSpeseSpedizione,
  destinatarioFromCliente,
  listinoEScontoDaOrdine,
  parseDestinatarioSnapshot,
  totalsFromFatturaRighe,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { importoRiga, todayIsoDate, year2FromDate } from "@/lib/amministrazione/fatture";
import {
  applyTotaleToPiano,
  emailsClienteUniche,
  ordinePagamentoPianoSchema,
  pianoToFicPayments,
  validatePianoVsTotale,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import {
  ORDINI_PERSISTENZA_BLOCCATA_MSG,
  ORDINI_PERSISTENZA_DEFINITIVA,
} from "@/lib/amministrazione/ordine-sessione";
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

function missingColumn(error: { message?: string } | null, col: string): boolean {
  const m = (error?.message ?? "").toLowerCase();
  return m.includes(col.toLowerCase());
}

async function loadFatturaRighe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fatturaId: string
) {
  const withDeleted = await supabase
    .from("fatture_emesse_righe")
    .select("*")
    .eq("fattura_id", fatturaId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (!withDeleted.error) return withDeleted.data ?? [];
  if (!missingColumn(withDeleted.error, "deleted_at")) {
    throw new Error(withDeleted.error.message);
  }
  const fallback = await supabase
    .from("fatture_emesse_righe")
    .select("*")
    .eq("fattura_id", fatturaId)
    .order("sort_order", { ascending: true });
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data ?? [];
}

function toRigaInsert(
  fatturaId: string,
  r: FatturaA4Riga,
  i: number,
  userId: string
): FatturaEmessaRigaInsert & Record<string, unknown> {
  return {
    fattura_id: fatturaId,
    prodotto_id: r.isSpedizione ? null : r.prodottoId,
    codice: r.codice,
    descrizione: r.descrizione,
    quantita: r.quantita,
    unita_misura: r.unitaMisura,
    prezzo_unitario: r.prezzoUnitario,
    sconto_percentuale: r.scontoPercentuale,
    importo: importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale),
    sort_order: i,
    iva_percentuale: r.ivaPercentuale,
    is_spedizione: r.isSpedizione,
    note: r.note,
    created_by: userId,
    updated_by: userId,
  };
}

async function replaceFatturaRighe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fatturaId: string,
  righeDoc: FatturaA4Riga[],
  userId: string
): Promise<string | null> {
  const now = new Date().toISOString();
  const soft = await supabase
    .from("fatture_emesse_righe")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("fattura_id", fatturaId)
    .is("deleted_at", null);
  if (!soft.error) {
    const ins = await supabase
      .from("fatture_emesse_righe")
      .insert(righeDoc.map((r, i) => toRigaInsert(fatturaId, r, i, userId)));
    if (!ins.error) return null;
    if (!missingColumn(ins.error, "unita_misura")) return ins.error.message;
    const retry = await supabase.from("fatture_emesse_righe").insert(
      righeDoc.map((r, i) => {
        const row = toRigaInsert(fatturaId, r, i, userId);
        delete row.unita_misura;
        return row;
      })
    );
    return retry.error?.message ?? null;
  }
  const existing = await supabase
    .from("fatture_emesse_righe")
    .select("id")
    .eq("fattura_id", fatturaId)
    .order("sort_order", { ascending: true });
  if (existing.error) return existing.error.message;
  const ids = (existing.data ?? []).map((r) => String(r.id));
  for (let i = 0; i < righeDoc.length; i++) {
    const row = toRigaInsert(fatturaId, righeDoc[i], i, userId);
    if (ids[i]) {
      const { error } = await supabase
        .from("fatture_emesse_righe")
        .update(row)
        .eq("id", ids[i]);
      if (error && missingColumn(error, "unita_misura")) {
        delete row.unita_misura;
        const retry = await supabase
          .from("fatture_emesse_righe")
          .update(row)
          .eq("id", ids[i]);
        if (retry.error) return retry.error.message;
      } else if (error) {
        return error.message;
      }
    } else {
      const { error } = await supabase.from("fatture_emesse_righe").insert(row);
      if (error && missingColumn(error, "unita_misura")) {
        delete row.unita_misura;
        const retry = await supabase.from("fatture_emesse_righe").insert(row);
        if (retry.error) return retry.error.message;
      } else if (error) {
        return error.message;
      }
    }
  }
  return null;
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
      righe: FatturaA4Riga[];
      destinatario: FatturaDestinatarioSnapshot;
      totale: number;
      imponibile: number;
      imposta: number;
      fatturaEsistenteId: string | null;
      noteDocumento: string;
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
    const scontoOrdine = Number(ordine.sconto_extra_pct ?? 0);
    const listinoHeader =
      ordine.prezzo_listino_unitario != null
        ? Number(ordine.prezzo_listino_unitario)
        : null;
    const righeOrdine = (righeData ?? []) as OrdineRigaRow[];
    let righe: FatturaA4Riga[] = righeOrdine.map((r) => {
      const mapped = listinoEScontoDaOrdine({
        prezzoRiga: Number(r.prezzo_unitario),
        prezzoListinoHeader: listinoHeader,
        scontoExtraPct: scontoOrdine,
        isSpedizione: false,
      });
      return {
        prodottoId: r.prodotto_id,
        codice: r.prodotto_codice,
        descrizione: r.prodotto_nome,
        quantita: Number(r.quantita),
        unitaMisura: r.unita_misura ?? "kg",
        prezzoUnitario: mapped.prezzoUnitario,
        scontoPercentuale: mapped.scontoPercentuale,
        ivaPercentuale: Number(r.iva_percentuale) || 22,
        isSpedizione: false,
        note: "",
      };
    });
    righe = applyContributoSpeseSpedizione(righe, {
      aCaricoCliente:
        ordine.spedizione_a_carico === "cliente" ||
        Number(ordine.trasporto_imponibile) > 0,
      importo: Number(ordine.trasporto_imponibile) || 0,
      ivaInclusa: Number(ordine.trasporto_iva_percentuale) === 0,
      ivaAliquota:
        Number(ordine.trasporto_iva_percentuale) > 0
          ? Number(ordine.trasporto_iva_percentuale)
          : 22,
    });
    let destinatario = destinatarioFromCliente(cliente);
    let noteDocumento = "";
    const { data: existing } = await supabase
      .from("fatture_emesse")
      .select("*")
      .eq("ordine_id", ordine.id)
      .is("deleted_at", null)
      .eq("tipo_documento", "fattura")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const existingRow = existing as FatturaEmessaRow | null;
    if (existingRow) {
      noteDocumento = existingRow.note ?? "";
      const snap = parseDestinatarioSnapshot(existingRow.destinatario_snapshot);
      if (snap) destinatario = snap;
      else if (existingRow.cliente_ragione_sociale) {
        destinatario = {
          ...destinatario,
          ragioneSociale: existingRow.cliente_ragione_sociale,
        };
      }
      let fatturaRighe: Awaited<ReturnType<typeof loadFatturaRighe>> = [];
      try {
        fatturaRighe = await loadFatturaRighe(supabase, existingRow.id);
      } catch {
        fatturaRighe = [];
      }
      if (fatturaRighe && fatturaRighe.length > 0) {
        righe = fatturaRighe.map((r) => ({
          prodottoId: r.prodotto_id,
          codice: r.codice,
          descrizione: r.descrizione,
          quantita: Number(r.quantita),
          unitaMisura: r.unita_misura || "nr",
          prezzoUnitario: Number(r.prezzo_unitario),
          scontoPercentuale: Number(r.sconto_percentuale) || 0,
          ivaPercentuale: Number(r.iva_percentuale) || 22,
          isSpedizione: Boolean(r.is_spedizione),
          note: r.note ?? "",
        }));
      }
    }
    const totals = totalsFromFatturaRighe(righe);
    const dataDocumento = existingRow?.data_emissione || todayIsoDate();
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

    return {
      success: true,
      ordineId: ordine.id,
      numeroOrdine: ordine.numero_interno,
      cliente,
      destinatario,
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
      numeroInterno: existingRow?.numero_interno || nums.numeroInterno,
      numeroFattura:
        existingRow?.numero_fattura ||
        existingRow?.numero_documento_esterno ||
        nums.numeroFattura,
      righe,
      totale: totals.totale,
      imponibile: totals.imponibile,
      imposta: totals.imposta,
      fatturaEsistenteId: existingRow?.id ?? null,
      noteDocumento,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Contesto fattura non disponibile.",
    };
  }
}

const sedeSchema = z.object({
  nazione: z.string().optional().default(""),
  provincia: z.string().optional().default(""),
  citta: z.string().optional().default(""),
  cap: z.string().optional().default(""),
  indirizzo: z.string().optional().default(""),
});

const rigaDocumentoSchema = z.object({
  prodottoId: z.string().uuid().nullable(),
  codice: z.string().trim().min(1),
  descrizione: z.string().trim().min(1),
  quantita: z.number().positive(),
  unitaMisura: z.string().trim().min(1).max(16),
  prezzoUnitario: z.number().min(0),
  scontoPercentuale: z.number().min(0).max(100),
  ivaPercentuale: z.number().min(0).max(100),
  isSpedizione: z.boolean(),
  note: z.string().optional().default(""),
});

const destinatarioSchema = z.object({
  ragioneSociale: z.string().trim().min(1).max(300),
  partitaIva: z.string().trim().max(32).optional().default(""),
  codiceFiscale: z.string().trim().max(32).optional().default(""),
  sede: sedeSchema,
  email: z.string().trim().max(200).optional().default(""),
});

const saveSchema = z.object({
  ordineId: z.string().uuid(),
  fatturaId: z.string().uuid().nullable().optional(),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invioEmail: z.string().email("Email non valida").or(z.literal("")).optional(),
  inviaOra: z.boolean(),
  sendToSdi: z.boolean().optional().default(true),
  piano: ordinePagamentoPianoSchema,
  noteDocumento: z.string().optional().default(""),
  righe: z.array(rigaDocumentoSchema).min(1).optional(),
  destinatario: destinatarioSchema.optional(),
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
  if (!ORDINI_PERSISTENZA_DEFINITIVA) {
    return { success: false, error: ORDINI_PERSISTENZA_BLOCCATA_MSG };
  }
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

  const righeDoc: FatturaA4Riga[] = (input.righe ?? ctx.righe).map((r) => ({
    prodottoId: r.prodottoId,
    codice: r.codice,
    descrizione: r.descrizione,
    quantita: r.quantita,
    unitaMisura: r.unitaMisura,
    prezzoUnitario: r.prezzoUnitario,
    scontoPercentuale: r.scontoPercentuale,
    ivaPercentuale: r.ivaPercentuale,
    isSpedizione: r.isSpedizione,
    note: r.note ?? "",
  }));
  const destinatario = input.destinatario ?? ctx.destinatario;
  const totals = totalsFromFatturaRighe(righeDoc);

  const piano = applyTotaleToPiano(input.piano, totals.totale);
  const pianoErr = validatePianoVsTotale(piano, totals.totale);
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
    righeDoc.find((r) => !r.isSpedizione)?.ivaPercentuale ?? 22;
  const spedizioneRiga = righeDoc.find((r) => r.isSpedizione);
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
      const headerPatch: Record<string, unknown> = {
        data_emissione: input.dataDocumento,
        data_scadenza: dataScadenza,
        cliente_ragione_sociale: destinatario.ragioneSociale,
        destinatario_snapshot: destinatario,
        imponibile: totals.imponibile,
        imposta: totals.imposta,
        totale: totals.totale,
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
        versione: (row.versione ?? 1) + 1,
        updated_by: auth.userId,
      };
      let { error: upErr } = await supabase
        .from("fatture_emesse")
        .update(headerPatch)
        .eq("id", fatturaId);
      if (upErr && missingColumn(upErr, "destinatario_snapshot")) {
        delete headerPatch.destinatario_snapshot;
        const retry = await supabase
          .from("fatture_emesse")
          .update(headerPatch)
          .eq("id", fatturaId);
        upErr = retry.error;
      }
      if (upErr) return { success: false, error: upErr.message };
      const righeUpErr = await replaceFatturaRighe(
        supabase,
        fatturaId,
        righeDoc,
        auth.userId
      );
      if (righeUpErr) {
        return { success: false, error: `Righe fattura: ${righeUpErr}` };
      }
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
      cliente_ragione_sociale: destinatario.ragioneSociale,
      cliente_codice_targa: ctx.cliente.codiceTarga,
      destinatario_snapshot: destinatario,
      data_emissione: input.dataDocumento,
      numero_documento_esterno: numeroFattura,
      numero_fattura: numeroFattura,
      spedizione: spedizioneRiga?.prezzoUnitario ?? 0,
      spedizione_iva_applicata: Boolean(
        spedizioneRiga && spedizioneRiga.ivaPercentuale > 0
      ),
      spedizione_iva_percentuale: spedizioneRiga?.ivaPercentuale ?? 22,
      imponibile: totals.imponibile,
      iva_percentuale: ivaHeader,
      imposta: totals.imposta,
      totale: totals.totale,
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
    let { data: fatturaRow, error: insErr } = await supabase
      .from("fatture_emesse")
      .insert(insert)
      .select("*")
      .single();
    if (insErr && missingColumn(insErr, "destinatario_snapshot")) {
      delete insert.destinatario_snapshot;
      const retry = await supabase
        .from("fatture_emesse")
        .insert(insert)
        .select("*")
        .single();
      fatturaRow = retry.data;
      insErr = retry.error;
    }
    if (insErr || !fatturaRow) {
      return {
        success: false,
        error: insErr?.message ?? "Salvataggio fattura non riuscito.",
      };
    }
    fatturaId = (fatturaRow as FatturaEmessaRow).id;
    const righeErr = await replaceFatturaRighe(
      supabase,
      fatturaId,
      righeDoc,
      auth.userId
    );
    if (righeErr) {
      return { success: false, error: `Fattura salvata ma righe: ${righeErr}` };
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
      scontoRighe: righeDoc.map((r) => r.scontoPercentuale),
      destinatario: destinatario.ragioneSociale,
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
  const [{ data: dilazioni }, { data: clienteData }] = await Promise.all([
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
  let righe: Awaited<ReturnType<typeof loadFatturaRighe>> = [];
  try {
    righe = await loadFatturaRighe(supabase, fattura.id);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Righe fattura non leggibili.",
    };
  }
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
  const destSnap = parseDestinatarioSnapshot(fattura.destinatario_snapshot);
  const entity: Record<string, unknown> = {
    name: destSnap?.ragioneSociale || cliente.ragione_sociale,
    vat_number: cliente.is_privato
      ? ""
      : destSnap?.partitaIva || cliente.partita_iva || "",
    tax_code: destSnap?.codiceFiscale || cliente.codice_fiscale || "",
    address_street: destSnap?.sede.indirizzo || cliente.sede_amm_indirizzo || "",
    address_postal_code: destSnap?.sede.cap || cliente.sede_amm_cap || "",
    address_city: destSnap?.sede.citta || cliente.sede_amm_citta || "",
    address_province:
      destSnap?.sede.provincia || cliente.sede_amm_provincia || "",
    country: destSnap?.sede.nazione || cliente.sede_amm_nazione || "Italia",
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
