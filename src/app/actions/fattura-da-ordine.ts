"use server";

import { writeAuditLog } from "@/lib/audit";
import { notificaOrdineInCoda } from "@/lib/amministrazione/ordine-notifica-coda";
import { scanPromozioniDaFattureAction } from "@/app/actions/lead-promozione";
import { requireAreaAccess } from "@/lib/areas/guard";
import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import {
  buildDescrizioneDocumento,
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
import { importoRiga, todayIsoDate } from "@/lib/amministrazione/fatture";
import {
  applyTotaleToPiano,
  emailsClienteUniche,
  ordinePagamentoPianoSchema,
  pianoToFicPayments,
  validatePianoVsTotale,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  assegnaNumeroProforma,
  isNumeroFatturaEmessa,
} from "@/lib/amministrazione/numero-fattura";
import {
  EMAIL_CONTROLLO_DEFAULT,
  FASE_TEST_INVIO,
  isFatturaProva,
} from "@/lib/amministrazione/prova-ordine";
import { buildFatturaA4PdfBlob } from "@/lib/amministrazione/fattura-a4-pdf";
import { caricaLoghiFatturaA4Server } from "@/lib/amministrazione/fattura-a4-loghi.server";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import { testoMailFatturaCortesia } from "@/lib/amministrazione/ordine-mail-bozza";
import { loadPreventivoCommercialiRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  ORDINI_PERSISTENZA_BLOCCATA_MSG,
  ORDINI_PERSISTENZA_DEFINITIVA,
} from "@/lib/amministrazione/ordine-sessione";
import { motivoBloccoInvioClienteOrdine } from "@/app/actions/ordine-calcolo-spedizione";
import {
  createIssuedDocument,
  aliquotePerEmissione,
  messaggioBloccoQuotaFic,
  resolveFicVatId,
  sendIssuedDocumentToSdi,
} from "@/lib/fic";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  registraCopiaMailInviata,
  sendMailViaAccount,
} from "@/lib/webmail/sync";
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
  /** Ricostruisce le righe dall'ordine, senza leggere la fattura già salvata. */
  ignoraRigheFattura?: boolean;
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
      righeDaFatturaSalvata: boolean;
      proformaId: string | null;
      proformaNumero: string | null;
      proformaConvertitaNumero: string | null;
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
    const bloccoSpedizione = await motivoBloccoInvioClienteOrdine(ordine.id);
    if (bloccoSpedizione) return { success: false, error: bloccoSpedizione };
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
    // ordini_campionature resta fuori: non è una riga di fattura.
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
    const importoSpedizioneSalvato = Number(ordine.spedizione_importo ?? 0);
    const importoSpedizione =
      importoSpedizioneSalvato > 0
        ? importoSpedizioneSalvato
        : Number(ordine.trasporto_imponibile) || 0;
    righe = applyContributoSpeseSpedizione(righe, {
      aCaricoCliente:
        ordine.spedizione_a_carico === "cliente" || importoSpedizione > 0,
      importo: importoSpedizione,
      ivaInclusa:
        ordine.spedizione_iva_modo === "compreso" ||
        (importoSpedizioneSalvato <= 0 &&
          importoSpedizione > 0 &&
          Number(ordine.trasporto_iva_percentuale) === 0),
      ivaAliquota: 22,
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
    let righeDaFatturaSalvata = false;
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
      if (!input.ignoraRigheFattura && fatturaRighe && fatturaRighe.length > 0) {
        righeDaFatturaSalvata = true;
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
    const numeroGia =
      existingRow?.numero_fattura?.trim() &&
      (isNumeroFatturaEmessa(existingRow.numero_fattura) ||
        isFatturaProva(existingRow) ||
        /^PR-\d+\/20\d{2}$/.test(existingRow.numero_fattura.trim()));
    const nums = numeroGia
      ? {
          numeroInterno: existingRow?.numero_interno || `Ft-${existingRow?.numero_fattura}`,
          numeroFattura: existingRow?.numero_fattura ?? "",
        }
      : {
          numeroInterno: existingRow?.numero_interno || `Pren-${ordine.numero_interno}`,
          numeroFattura: "Prenotata",
        };

    const { data: proformaRow } = await supabase
      .from("fatture_emesse")
      .select("id, numero_fattura, numero_interno, fattura_definitiva_id")
      .eq("ordine_id", ordine.id)
      .eq("tipo_documento", "proforma")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const proforma = proformaRow as {
      id: string;
      numero_fattura: string;
      numero_interno: string;
      fattura_definitiva_id: string | null;
    } | null;
    let proformaConvertitaNumero: string | null = null;
    if (proforma?.fattura_definitiva_id) {
      const { data: def } = await supabase
        .from("fatture_emesse")
        .select("numero_fattura")
        .eq("id", proforma.fattura_definitiva_id)
        .maybeSingle();
      proformaConvertitaNumero = String(
        (def as { numero_fattura?: string } | null)?.numero_fattura ?? ""
      ).trim() || null;
    }

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
      righeDaFatturaSalvata,
      proformaId: proforma && !proforma.fattura_definitiva_id ? proforma.id : null,
      proformaNumero:
        proforma && !proforma.fattura_definitiva_id
          ? proforma.numero_fattura || proforma.numero_interno
          : null,
      proformaConvertitaNumero,
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
  doppiaConferma: z.boolean().optional().default(false),
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
      if (isFatturaProva(row)) {
        if (input.inviaOra) {
          return {
            success: false,
            error:
              "Fattura di prova: non viene inviata allo SDI e non riceve un numero fiscale.",
          };
        }
        return {
          success: true,
          fatturaId: row.id,
          numeroInterno: row.numero_interno,
          numeroFattura: row.numero_fattura,
          inviata: false,
          ficId: null,
          pdfUrl: "",
          eiStatus: row.ei_status || "prova",
          courtesyEmailSent: false,
          sdiSent: false,
        };
      }
      if (row.fic_id && input.inviaOra) {
        return inviaFatturaSalvataAction({
          fatturaId: row.id,
          invioEmail: input.invioEmail ?? row.invio_email,
          sendToSdi: input.sendToSdi,
          doppiaConferma: input.doppiaConferma,
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
    if (input.inviaOra && !input.doppiaConferma) {
      return {
        success: false,
        error:
          "L'invio della fattura richiede la doppia conferma. Il numero non è stato assegnato e nulla è partito.",
      };
    }
    numeroInterno = `Pren-${ctx.numeroOrdine}`.slice(0, 80);
    numeroFattura = "";
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
    summary: numeroFattura
      ? `Salvata fattura ${numeroFattura} da ordine ${ctx.numeroOrdine}`
      : `Fattura prenotata senza numero da ordine ${ctx.numeroOrdine}`,
    payload: {
      ordineId: input.ordineId,
      inviaOra: input.inviaOra,
      modalita: piano.modalita,
      scontoRighe: righeDoc.map((r) => r.scontoPercentuale),
      destinatario: destinatario.ragioneSociale,
    },
  });

  if (!input.inviaOra || input.sendToSdi === false) {
    return {
      success: true,
      fatturaId: fatturaId!,
      numeroInterno,
      numeroFattura: numeroFattura || "Prenotata",
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
    doppiaConferma: input.doppiaConferma,
  });
}

/** Assegna il progressivo solo quando l'invio è già stato confermato due volte. */
export async function materializzaNumeroDocumento(
  fatturaId: string
): Promise<
  | { success: true; numeroFattura: string; numeroInterno: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fatture_emesse")
    .select("id, numero_fattura, numero_interno, tipo_documento, data_emissione")
    .eq("id", fatturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Documento non trovato." };
  }
  const tipo = String(data.tipo_documento ?? "fattura");
  const numero = String(data.numero_fattura ?? "").trim();
  const interno = String(data.numero_interno ?? "").trim();
  if (isFatturaProva({ numero_fattura: numero, numero_interno: interno })) {
    return {
      success: true,
      numeroFattura: numero,
      numeroInterno: interno || `Ft-${numero}`,
    };
  }
  const dataDocumento = String(data.data_emissione ?? "").slice(0, 10);
  if (tipo === "proforma" && /^PR-\d+\/20\d{2}$/.test(numero)) {
    return { success: true, numeroFattura: numero, numeroInterno: interno || numero };
  }
  if (tipo !== "proforma" && isNumeroFatturaEmessa(numero)) {
    return { success: true, numeroFattura: numero, numeroInterno: interno || `Ft-${numero}` };
  }
  if (tipo !== "proforma") {
    return {
      success: false,
      error:
        "Il numero fiscale si assegna solo all'invio allo SDI. La fattura resta in bozza.",
    };
  }
  try {
    const assegnato = await assegnaNumeroProforma(supabase, dataDocumento);
    const { error: upErr } = await supabase
      .from("fatture_emesse")
      .update({
        numero_fattura: assegnato.numeroFattura,
        numero_interno: assegnato.numeroInterno,
        numero_documento_esterno: assegnato.numeroFattura,
      })
      .eq("id", fatturaId);
    if (upErr) return { success: false, error: upErr.message };
    return {
      success: true,
      numeroFattura: assegnato.numeroFattura,
      numeroInterno: assegnato.numeroInterno,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numero non assegnato.",
    };
  }
}

/** Crea la fattura dell'ordine e non la invia. Solo dopo il successo l'ordine è pronto per la produzione. */
export async function creaFatturaOrdineSenzaInvioAction(
  ordineId: string,
  opts?: {
    /** true solo se è cambiata la riga prodotto dell'ordine. */
    resetDaOrdine?: boolean;
    bozza?: {
      righe: FatturaA4Riga[];
      destinatario?: FatturaDestinatarioSnapshot;
      noteDocumento?: string;
      dataDocumento?: string;
      piano?: OrdinePagamentoPiano;
    } | null;
    invioFatturaSdi?: "subito" | "al_processo" | null;
  }
): Promise<
  | {
      success: true;
      fatturaId: string;
      numeroFattura: string;
      inviata: false;
      giaInviata: boolean;
      resettata: boolean;
      avviso?: string;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data: esistente, error: esistenteErr } = await supabase
    .from("fatture_emesse")
    .select("id, fic_id, courtesy_email_sent, numero_fattura, ei_status")
    .eq("ordine_id", ordineId)
    .eq("tipo_documento", "fattura")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (esistenteErr) return { success: false, error: esistenteErr.message };
  const emessa = esistente as {
    id: string;
    fic_id?: number | null;
    courtesy_email_sent?: boolean | null;
    numero_fattura?: string | null;
    ei_status?: string | null;
  } | null;
  const numeroSalvato = String(emessa?.numero_fattura ?? "").trim();
  const documentoPartito = Boolean(
    emessa &&
      (emessa.fic_id ||
        emessa.courtesy_email_sent ||
        emessa.ei_status === "sent" ||
        (numeroSalvato && isNumeroFatturaEmessa(numeroSalvato)))
  );
  const giaInviata = Boolean(
    emessa && (emessa.courtesy_email_sent || emessa.ei_status === "sent")
  );
  const scelta =
    opts?.invioFatturaSdi === "subito" || opts?.invioFatturaSdi === "al_processo"
      ? opts.invioFatturaSdi
      : null;
  if (scelta) {
    const { error: sceltaErr } = await supabase
      .from("ordini")
      .update({
        invio_fattura_sdi: scelta,
        invio_fattura_sdi_scelto_at: new Date().toISOString(),
        invio_fattura_sdi_scelto_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", ordineId)
      .is("deleted_at", null);
    if (sceltaErr) {
      return {
        success: false,
        error: `La scelta di invio non è stata registrata: ${sceltaErr.message}`,
      };
    }
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: ordineId,
      action: "invio_fattura_sdi",
      actor_id: auth.userId,
      summary:
        scelta === "subito"
          ? "Scelta: invia subito la fattura allo SDI e la mail di cortesia al cliente."
          : "Scelta: invia la fattura allo SDI e la mail di cortesia quando l'ordine entra in produzione.",
      payload: { invio_fattura_sdi: scelta },
    });
  }

  const resetRichiesto = Boolean(opts?.resetDaOrdine);
  let fatturaId = emessa?.id ?? "";
  let numeroFattura = numeroSalvato || "Prenotata";
  let resettata = false;
  let avviso: string | undefined;

  if (documentoPartito) {
    if (resetRichiesto) {
      avviso =
        "La riga dell'ordine è cambiata. La fattura già inviata allo SDI non è stata modificata.";
    }
  } else {
    const ctx = await getFatturaA4ContextAction({
      ordineId,
      ignoraRigheFattura: resetRichiesto,
    });
    if (!ctx.success) return ctx;
    const bozza = resetRichiesto ? null : (opts?.bozza ?? null);
    const tieniSalvata =
      !resetRichiesto &&
      ctx.righeDaFatturaSalvata &&
      !(bozza?.righe && bozza.righe.length > 0);
    if (tieniSalvata) {
      fatturaId = ctx.fatturaEsistenteId ?? fatturaId;
      numeroFattura = ctx.numeroFattura;
    } else {
      const res = await saveFatturaDaOrdineAction({
        ordineId,
        fatturaId: ctx.fatturaEsistenteId,
        dataDocumento: bozza?.dataDocumento || ctx.dataDocumento,
        invioEmail: "",
        inviaOra: false,
        sendToSdi: false,
        piano: bozza?.piano ?? ctx.piano,
        noteDocumento: bozza?.noteDocumento ?? ctx.noteDocumento,
        righe: bozza?.righe && bozza.righe.length > 0 ? bozza.righe : ctx.righe,
        destinatario: bozza?.destinatario ?? ctx.destinatario,
      });
      if (!res.success) return res;
      if (res.inviata || res.sdiSent || res.courtesyEmailSent) {
        return {
          success: false,
          error:
            "La fattura risulta inviata. Il passaggio in produzione è bloccato.",
        };
      }
      fatturaId = res.fatturaId;
      numeroFattura = res.numeroFattura;
      if (resetRichiesto) {
        resettata = true;
        avviso =
          "La riga dell'ordine è cambiata: la fattura non inviata è stata riallineata all'ordine.";
        await writeAuditLog({
          entity_type: "fatture_emesse",
          entity_id: fatturaId,
          action: "update",
          actor_id: auth.userId,
          summary:
            "Fattura non inviata riallineata all'ordine perché la riga prodotto è cambiata.",
          payload: { ordine_id: ordineId, reset_da_ordine: true },
        });
      }
    }
  }

  if (!fatturaId) {
    return { success: false, error: "Fattura non creata." };
  }

  const { data: prima } = await supabase
    .from("ordini")
    .select("stato")
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  const { error } = await supabase
    .from("ordini")
    .update({
      documento_stato: "registrato",
      updated_by: auth.userId,
    })
    .eq("id", ordineId)
    .is("deleted_at", null);
  if (error) {
    return {
      success: false,
      error: `Fattura ${numeroFattura} registrata, ma l'ordine non è stato sbloccato: ${error.message}`,
    };
  }
  await writeAuditLog({
    entity_type: "ordini",
    entity_id: ordineId,
    action: "status_change",
    actor_id: auth.userId,
    summary: giaInviata
      ? "Fattura già inviata: l'ordine resta pronto per la produzione e non parte un secondo invio."
      : "Fattura registrata senza invio. L'ordine è pronto per la produzione.",
    payload: {
      fattura_id: fatturaId,
      numero_fattura: numeroFattura,
      inviata: false,
      sdi_sent: false,
      documento_stato: "registrato",
      gia_inviata: giaInviata,
      resettata,
      invio_fattura_sdi: scelta,
    },
  });
  await notificaOrdineInCoda({
    actorId: auth.userId,
    ordineId,
    statoPrima: String((prima as { stato?: string } | null)?.stato ?? ""),
    evento: "fattura registrata, pronto per la produzione",
  });
  return {
    success: true,
    fatturaId,
    numeroFattura,
    inviata: false,
    giaInviata,
    resettata,
    avviso,
  };
}

function righeBozzaFattura(
  rows: Array<Record<string, unknown>>
): FatturaA4Riga[] {
  return rows.map((riga) => ({
    prodottoId: riga.prodotto_id ? String(riga.prodotto_id) : null,
    codice: String(riga.codice ?? ""),
    descrizione: String(riga.descrizione ?? ""),
    quantita: Number(riga.quantita) || 0,
    unitaMisura: String(riga.unita_misura ?? "nr"),
    prezzoUnitario: Number(riga.prezzo_unitario) || 0,
    scontoPercentuale: Number(riga.sconto_percentuale) || 0,
    ivaPercentuale: Number(riga.iva_percentuale) || 22,
    isSpedizione: Boolean(riga.is_spedizione),
    note: String(riga.note ?? ""),
  }));
}

function pianoBozzaFattura(
  fattura: FatturaEmessaRow,
  dilazioni: Array<Record<string, unknown>>
): OrdinePagamentoPiano {
  const tipoUnica =
    fattura.tipo_scadenza_unica === "anticipato" ||
    fattura.tipo_scadenza_unica === "alla_consegna" ||
    fattura.tipo_scadenza_unica === "pronto_magazzino" ||
    fattura.tipo_scadenza_unica === "posticipato"
      ? fattura.tipo_scadenza_unica
      : "alla_consegna";
  const modalita =
    fattura.pagamento_modalita === "dilazione" ? "dilazione" : "unica";
  const rate = dilazioni
    .slice()
    .sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
    )
    .map((rata, index) => ({
      sortOrder: index,
      importo: Number(rata.importo) || 0,
      tipoScadenza:
        index === 0
          ? ((rata.tipo_scadenza as typeof tipoUnica) || tipoUnica)
          : null,
      dataPagamento: rata.data_scadenza
        ? String(rata.data_scadenza).slice(0, 10)
        : null,
      note: String(rata.note ?? ""),
    }));
  if (rate.length === 0) {
    return applyTotaleToPiano(
      {
        modalita,
        tipoUnica,
        rate: [
          {
            sortOrder: 0,
            importo: Number(fattura.totale) || 0,
            tipoScadenza: tipoUnica,
            dataPagamento: null,
            note: "",
          },
        ],
      },
      Number(fattura.totale) || 0
    );
  }
  return { modalita, tipoUnica, rate };
}

/** Mail al cliente con lo stesso PDF della bozza ordine: logo e intestazione. */
async function inviaMailPdfComeBozza(input: {
  fattura: FatturaEmessaRow;
  righe: Array<Record<string, unknown>>;
  dilazioni: Array<Record<string, unknown>>;
  destinatario: FatturaDestinatarioSnapshot;
  mailTo: string;
  numeroFattura: string;
  userId: string;
}): Promise<void> {
  const service = createServiceClient();
  const loghi = await caricaLoghiFatturaA4Server();
  if (!loghi.agrinsicilia) {
    throw new Error(
      "Manca il logo in intestazione: la fattura non può partire diversa dalla bozza."
    );
  }
  const persone = await loadPreventivoCommercialiRiferimento({
    includiSenzaAccount: true,
  });
  const persona =
    persone.find((item) => item.id === input.fattura.created_by) ??
    persone.find((item) => item.id === input.userId) ??
    null;
  const pdf = buildFatturaA4PdfBlob({
    numeroFattura: input.numeroFattura,
    dataDocumento: String(input.fattura.data_emissione ?? ""),
    destinatario: input.destinatario,
    righe: righeBozzaFattura(input.righe),
    noteDocumento: String(input.fattura.note ?? ""),
    proforma: false,
    piano: pianoBozzaFattura(input.fattura, input.dilazioni),
    commerciale: persona
      ? {
          nome: persona.nome,
          telefono: persona.telefono,
          email: persona.email,
        }
      : null,
    loghi,
  });
  const bytes = Buffer.from(await pdf.blob.arrayBuffer());
  let accountIdScelto = "";
  if (input.fattura.ordine_id) {
    const { data: prenotazione } = await service
      .from("spedizione_mail_prenotazioni")
      .select("account_id")
      .eq("entity_type", "ordine")
      .eq("entity_id", input.fattura.ordine_id)
      .is("deleted_at", null)
      .maybeSingle();
    accountIdScelto = String(
      (prenotazione as { account_id?: string | null } | null)?.account_id ?? ""
    );
  }
  if (!accountIdScelto) {
    throw new Error(
      "Manca la casella mittente scelta per questa fattura. Non è stata usata un'altra casella."
    );
  }
  const { data: accountRow, error } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", accountIdScelto)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !accountRow) {
    throw new Error(
      error?.message ??
        "La casella mittente scelta non è disponibile. La mail non è partita da un'altra casella."
    );
  }
  const account = accountRow as {
    id: string;
    email_address: string;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    username: string;
    password_encrypted: string;
  };
  let numeroOrdine = "";
  if (input.fattura.ordine_id) {
    const { data: ordineRow } = await service
      .from("ordini")
      .select("numero_interno")
      .eq("id", input.fattura.ordine_id)
      .maybeSingle();
    numeroOrdine = String(
      (ordineRow as { numero_interno?: string | null } | null)?.numero_interno ??
        ""
    ).trim();
  }
  const voci = righeBozzaFattura(input.righe)
    .filter((riga) => !riga.isSpedizione)
    .map((riga) =>
      [riga.codice.trim() || riga.descrizione.trim(), String(riga.quantita), riga.unitaMisura.trim()]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join(", ");
  const subject = `Fattura ${input.numeroFattura}`;
  const text = testoMailFatturaCortesia({
    numeroOrdine,
    prodotti: voci,
  }).bodyText;
  const allegato = {
    filename: pdf.fileName,
    content: bytes,
    contentType: "application/pdf",
  };
  const sent = await sendMailViaAccount({
    account,
    to: input.mailTo,
    subject,
    text,
    attachments: [allegato],
  });
  await registraCopiaMailInviata({
    supabase: service,
    accountId: account.id,
    fromAddress: account.email_address,
    to: input.mailTo,
    subject,
    text,
    messageId: sent.messageId,
    userId: input.userId,
    aziendaTipo: "cliente",
    aziendaId: input.fattura.cliente_id,
    aziendaLabel: input.destinatario.ragioneSociale,
    attachments: [allegato],
  });
}

function messaggioAliquoteFic(e: unknown, numeroCorrente: string): string {
  const raw =
    e instanceof Error
      ? e.message
      : "Impossibile leggere le aliquote IVA da Fatture in Cloud.";
  const limite =
    raw.includes("limite di chiamate API") ||
    raw.includes("USAGE_LIMIT_REACHED");
  if (!limite) return `Aliquote IVA FiC: ${raw}`;
  const numero = isNumeroFatturaEmessa(numeroCorrente)
    ? ` Il numero ${numeroCorrente} resta su questa fattura: al prossimo invio viene riusato e non se ne prende un altro.`
    : " Il numero fiscale non è stato assegnato.";
  return `${raw}${numero}`;
}

async function assegnaNumeroAllInvioSdi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fatturaId: string,
  dataDocumento: string
): Promise<
  | { success: true; numeroFattura: string; numeroInterno: string }
  | { success: false; error: string }
> {
  const { data, error } = await supabase.rpc("assegna_numero_fattura_sdi", {
    p_fattura_id: fatturaId,
    p_data: dataDocumento,
  });
  if (error) return { success: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  const obj =
    typeof row === "string"
      ? (JSON.parse(row) as { numero_fattura?: string; numero_interno?: string })
      : (row as { numero_fattura?: string; numero_interno?: string } | null);
  const numeroFattura = String(obj?.numero_fattura ?? "").trim();
  if (!isNumeroFatturaEmessa(numeroFattura)) {
    return { success: false, error: "Numerazione fattura non valida." };
  }
  return {
    success: true,
    numeroFattura,
    numeroInterno: String(obj?.numero_interno ?? "").trim() || `Ft-${numeroFattura}`,
  };
}

export async function inviaFatturaAttraversoSdiAction(
  fatturaId: string,
  doppiaConferma = false
): Promise<SalvaFatturaDaOrdineResult> {
  return inviaFatturaSalvataAction({
    fatturaId,
    sendToSdi: true,
    sendCourtesyEmail: false,
    doppiaConferma,
  });
}

export async function inviaFatturaSalvataAction(input: {
  fatturaId: string;
  invioEmail?: string;
  sendToSdi?: boolean;
  /** La mail di cortesia FiC non sostituisce l'invio Webmail. */
  sendCourtesyEmail?: boolean;
  /** Seconda conferma esplicita. Senza questo flag non si assegna il numero e non parte nulla. */
  doppiaConferma?: boolean;
  /**
   * Solo Produzione → Ordini → Da processare.
   * Qui il numero fiscale, lo SDI e la mail al cliente sono reali.
   */
  produzioneReale?: boolean;
}): Promise<SalvaFatturaDaOrdineResult> {
  const { auth } = input.produzioneReale
    ? await requireOrdineProcessAccess()
    : await requireAreaAccess("amministrazione");
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
  if (isFatturaProva(fattura)) {
    return {
      success: false,
      error:
        "Fattura di prova: non viene inviata allo SDI, non riceve un numero fiscale e non parte al cliente.",
    };
  }
  if (FASE_TEST_INVIO && !input.produzioneReale && input.sendToSdi !== false) {
    return {
      success: false,
      error:
        "Fase test: lo SDI è spento. La fattura si invia solo per mail a sandrohd@gmail.com e il numero non viene consumato.",
    };
  }
  const bloccoSpedizione = await motivoBloccoInvioClienteOrdine(fattura.ordine_id);
  if (bloccoSpedizione) return { success: false, error: bloccoSpedizione };
  if (fattura.tipo_documento === "proforma") {
    return {
      success: false,
      error:
        "La proforma non si invia allo SDI. Convertila in fattura e poi usa Invia fattura attraverso SDI.",
    };
  }
  if (input.doppiaConferma !== true) {
    return {
      success: false,
      error:
        "L'invio della fattura richiede la doppia conferma. Il numero non è stato assegnato e nulla è partito.",
    };
  }
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

  let vatTypes: Awaited<ReturnType<typeof aliquotePerEmissione>> = [];
  try {
    vatTypes = await aliquotePerEmissione();
  } catch (e) {
    const message = messaggioAliquoteFic(e, fattura.numero_fattura);
    await writeAuditLog({
      entity_type: "fatture_emesse",
      entity_id: fattura.id,
      action: "emissione_fic_error",
      actor_id: auth.userId,
      summary: `Aliquote IVA non lette ${fattura.numero_fattura || fattura.numero_interno}`,
      payload: { error: message },
    });
    return { success: false, error: message };
  }

  const aliquotaMancante = (righe ?? []).find((r) => {
    const target = Number(r.iva_percentuale) || 0;
    return !vatTypes.some((v) => Math.abs(v.value - target) < 0.001);
  });
  if (aliquotaMancante) {
    return {
      success: false,
      error: `Aliquota ${Number(aliquotaMancante.iva_percentuale) || 0}% non è tra i codici IVA già salvati. Nessuna chiamata è partita e il numero non è stato assegnato.`,
    };
  }

  const bloccoQuota = await messaggioBloccoQuotaFic();
  if (bloccoQuota) return { success: false, error: bloccoQuota };

  if (input.sendToSdi === false) {
    return {
      success: false,
      error:
        "Senza invio allo SDI la fattura resta in bozza: il numero non viene assegnato e la mail non parte.",
    };
  }

  const numeri = await assegnaNumeroAllInvioSdi(
    supabase,
    fattura.id,
    String(fattura.data_emissione ?? "").slice(0, 10)
  );
  if (!numeri.success) return numeri;
  fattura.numero_fattura = numeri.numeroFattura;
  fattura.numero_interno = numeri.numeroInterno;
  fattura.numero_documento_esterno = numeri.numeroFattura;

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
  const candidatiMail = [
    (input.invioEmail || "").trim(),
    (fattura.invio_email || "").trim(),
    (cliente.email || "").trim(),
  ].filter(Boolean);
  const mailTo = (
    input.produzioneReale
      ? candidatiMail.find(
          (email) =>
            email.toLowerCase() !== EMAIL_CONTROLLO_DEFAULT.toLowerCase()
        ) ?? ""
      : candidatiMail[0] ?? ""
  ).trim();
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
    ...(split.numeration ? { numeration: split.numeration } : {}),
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
      const created = await createIssuedDocument(ficPayload, {
        includiPdf: false,
      });
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
  const sendToSdi = true;
  if (ficId && fattura.ei_status === "sent") {
    sdiSent = true;
  } else if (sendToSdi && ficId) {
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
  const sendCourtesy =
    sdiSent && eiStatus === "sent" && input.sendCourtesyEmail !== false;
  if (sendCourtesy && mailTo && !fattura.courtesy_email_sent) {
    try {
      const destSnap = parseDestinatarioSnapshot(fattura.destinatario_snapshot);
      const destinatarioMail = destSnap ?? {
        ragioneSociale: cliente.ragione_sociale,
        partitaIva: cliente.partita_iva || "",
        codiceFiscale: cliente.codice_fiscale || "",
        email: mailTo,
        sede: {
          nazione: cliente.sede_amm_nazione || "",
          provincia: cliente.sede_amm_provincia || "",
          citta: cliente.sede_amm_citta || "",
          cap: cliente.sede_amm_cap || "",
          indirizzo: cliente.sede_amm_indirizzo || "",
        },
      };
      await inviaMailPdfComeBozza({
        fattura,
        righe: (righe ?? []) as Array<Record<string, unknown>>,
        dilazioni: (dilazioni ?? []) as Array<Record<string, unknown>>,
        destinatario: destinatarioMail,
        mailTo,
        numeroFattura,
        userId: auth.userId,
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

  const soloSdi = input.sendCourtesyEmail === false;
  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: fattura.id,
    action: soloSdi ? "invio_sdi" : "emissione_fic",
    actor_id: auth.userId,
    summary: soloSdi
      ? fattura.ei_status === "sent"
        ? `Fattura ${numeroFattura} già inviata allo SDI`
        : `Fattura ${numeroFattura} inviata attraverso lo SDI (FiC ${ficId ?? "—"})`
      : `Emessa fattura ${numeroFattura} (FiC ${ficId})`,
    payload: {
      ficId,
      eiStatus,
      sdiSent,
      courtesyEmailSent,
      mailTo,
      produzione_reale: Boolean(input.produzioneReale),
    },
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
        ? "Fattura creata su Fatture in Cloud ma l’invio SDI non è riuscito. La mail al cliente non è partita."
        : sendToSdi && fattura.ei_status === "sent"
          ? "La fattura risulta già inviata allo SDI."
          : undefined,
  };
}

const proformaSaveSchema = z.object({
  ordineId: z.string().uuid(),
  proformaId: z.string().uuid().nullable().optional(),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noteDocumento: z.string().optional().default(""),
  righe: z.array(rigaDocumentoSchema).min(1),
  destinatario: destinatarioSchema,
});

export async function saveProformaDaOrdineAction(raw: unknown): Promise<
  | { success: true; proformaId: string; numeroProforma: string }
  | { success: false; error: string }
> {
  if (!ORDINI_PERSISTENZA_DEFINITIVA) {
    return { success: false, error: ORDINI_PERSISTENZA_BLOCCATA_MSG };
  }
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = proformaSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati proforma non validi.",
    };
  }
  const input = parsed.data;
  const ctx = await getFatturaA4ContextAction({ ordineId: input.ordineId });
  if (!ctx.success) return ctx;
  const supabase = await createClient();
  const totals = totalsFromFatturaRighe(input.righe);
  const ivaHeader =
    input.righe.find((r) => !r.isSpedizione)?.ivaPercentuale ?? 22;

  let proformaId = input.proformaId ?? ctx.proformaId;
  let numeroProforma = ctx.proformaNumero ?? "";

  if (proformaId) {
    const { data: existing } = await supabase
      .from("fatture_emesse")
      .select("id, numero_fattura, fattura_definitiva_id, tipo_documento")
      .eq("id", proformaId)
      .is("deleted_at", null)
      .maybeSingle();
    const row = existing as {
      numero_fattura: string;
      fattura_definitiva_id: string | null;
      tipo_documento: string;
    } | null;
    if (!row || row.tipo_documento !== "proforma") {
      return { success: false, error: "Proforma non trovata." };
    }
    if (row.fattura_definitiva_id) {
      return {
        success: false,
        error: "Questa proforma è già stata convertita in fattura.",
      };
    }
    numeroProforma = row.numero_fattura;
    const { error: upErr } = await supabase
      .from("fatture_emesse")
      .update({
        data_emissione: input.dataDocumento,
        cliente_ragione_sociale: input.destinatario.ragioneSociale,
        destinatario_snapshot: input.destinatario,
        imponibile: totals.imponibile,
        imposta: totals.imposta,
        totale: totals.totale,
        iva_percentuale: ivaHeader,
        note: input.noteDocumento.trim(),
        updated_by: auth.userId,
      })
      .eq("id", proformaId);
    if (upErr) return { success: false, error: upErr.message };
    const righeErr = await replaceFatturaRighe(
      supabase,
      proformaId,
      input.righe,
      auth.userId
    );
    if (righeErr) return { success: false, error: righeErr };
  } else {
    numeroProforma = "Prenotata";
    const { data: inserted, error: insErr } = await supabase
      .from("fatture_emesse")
      .insert({
        numero_interno: `Pren-PR-${ctx.numeroOrdine}`.slice(0, 80),
        numero_fattura: "",
        numero_documento_esterno: "",
        tipo_documento: "proforma",
        cliente_id: ctx.cliente.id,
        cliente_ragione_sociale: input.destinatario.ragioneSociale,
        cliente_codice_targa: ctx.cliente.codiceTarga,
        destinatario_snapshot: input.destinatario,
        data_emissione: input.dataDocumento,
        imponibile: totals.imponibile,
        iva_percentuale: ivaHeader,
        imposta: totals.imposta,
        totale: totals.totale,
        stato_pagamento: "da_pagare",
        documento_stato: "bozza",
        note: input.noteDocumento.trim(),
        ordine_id: input.ordineId,
        origine: "emissione_gestionale",
        courtesy_email_sent: false,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { success: false, error: insErr?.message ?? "Proforma non salvata." };
    }
    proformaId = String((inserted as { id: string }).id);
    const righeErr = await replaceFatturaRighe(
      supabase,
      proformaId,
      input.righe,
      auth.userId
    );
    if (righeErr) return { success: false, error: righeErr };
    await writeAuditLog({
      entity_type: "fatture_emesse",
      entity_id: proformaId,
      action: "create",
      actor_id: auth.userId,
      summary: `Proforma prenotata senza numero da ordine ${ctx.numeroOrdine}`,
      payload: { ordineId: input.ordineId, numeroProforma },
    });
  }

  return { success: true, proformaId, numeroProforma };
}

export async function convertProformaInFatturaAction(input: {
  proformaId: string;
}): Promise<
  | { success: true; fatturaId: string; numeroFattura: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const proformaId = String(input.proformaId ?? "").trim();
  if (!proformaId) return { success: false, error: "Proforma non indicata." };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("fatture_emesse")
    .select("*")
    .eq("id", proformaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Proforma non trovata." };
  }
  const proforma = row as FatturaEmessaRow;
  const bloccoSpedizione = await motivoBloccoInvioClienteOrdine(proforma.ordine_id);
  if (bloccoSpedizione) return { success: false, error: bloccoSpedizione };
  if (proforma.tipo_documento !== "proforma") {
    return { success: false, error: "Il documento non è una proforma." };
  }
  if (proforma.fattura_definitiva_id) {
    const { data: gia } = await supabase
      .from("fatture_emesse")
      .select("id, numero_fattura")
      .eq("id", proforma.fattura_definitiva_id)
      .maybeSingle();
    const num = String(
      (gia as { numero_fattura?: string } | null)?.numero_fattura ?? ""
    );
    return {
      success: true,
      fatturaId: proforma.fattura_definitiva_id,
      numeroFattura: num,
    };
  }

  const numeroPrenotato = `Pren-${proforma.numero_interno || proforma.id}`.slice(0, 80);
  const { data: inserted, error: insErr } = await supabase
    .from("fatture_emesse")
    .insert({
      numero_interno: numeroPrenotato,
      numero_fattura: "",
      numero_documento_esterno: "",
      tipo_documento: "fattura",
      proforma_origine_id: proforma.id,
      cliente_id: proforma.cliente_id,
      cliente_ragione_sociale: proforma.cliente_ragione_sociale,
      cliente_codice_targa: proforma.cliente_codice_targa,
      destinatario_snapshot: proforma.destinatario_snapshot,
      data_emissione: proforma.data_emissione,
      data_scadenza: proforma.data_scadenza,
      imponibile: proforma.imponibile,
      iva_percentuale: proforma.iva_percentuale,
      imposta: proforma.imposta,
      totale: proforma.totale,
      stato_pagamento: "da_pagare",
      documento_stato: "bozza",
      note: proforma.note,
      ordine_id: proforma.ordine_id,
      origine: "emissione_gestionale",
      payment_method: proforma.payment_method,
      iban: proforma.iban,
      courtesy_email_sent: false,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return { success: false, error: insErr?.message ?? "Fattura non creata." };
  }
  const fatturaId = String((inserted as { id: string }).id);
  let rawRighe: Awaited<ReturnType<typeof loadFatturaRighe>> = [];
  try {
    rawRighe = await loadFatturaRighe(supabase, proforma.id);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Righe proforma non leggibili.",
    };
  }
  const righe = rawRighe.map((r) => ({
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
  const righeErr = await replaceFatturaRighe(
    supabase,
    fatturaId,
    righe,
    auth.userId
  );
  if (righeErr) return { success: false, error: righeErr };

  const { error: linkErr } = await supabase
    .from("fatture_emesse")
    .update({
      fattura_definitiva_id: fatturaId,
      documento_stato: "chiusa",
      updated_by: auth.userId,
    })
    .eq("id", proforma.id);
  if (linkErr) return { success: false, error: linkErr.message };

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: fatturaId,
    action: "create",
    actor_id: auth.userId,
    summary: `Proforma ${proforma.numero_fattura || "prenotata"} convertita in fattura prenotata, senza numero`,
    payload: {
      proformaId: proforma.id,
      numeroProforma: proforma.numero_fattura,
      numeroFattura: "",
    },
  });

  return {
    success: true,
    fatturaId,
    numeroFattura: "Prenotata",
  };
}
