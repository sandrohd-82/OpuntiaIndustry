"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  applyContributoSpeseSpedizione,
  listinoEScontoDaOrdine,
  parseDestinatarioSnapshot,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { buildFatturaA4PdfBlob } from "@/lib/amministrazione/fattura-a4-pdf";
import { caricaLoghiFatturaA4Server } from "@/lib/amministrazione/fattura-a4-loghi.server";
import { emptySede } from "@/lib/amministrazione/fornitori";
import { ordinePagamentoPianoSchema } from "@/lib/amministrazione/ordine-pagamento-piano";
import { splitNumeroForFic } from "@/lib/amministrazione/fattura-emissione";
import { buildNumeroInternoOrdine } from "@/lib/amministrazione/ordini";
import {
  anteprimaNumeroFattura,
  anteprimaNumeroProforma,
} from "@/lib/amministrazione/numero-fattura";
import {
  EMAIL_CONTROLLO_DEFAULT,
  isOrdineProva,
  oggiRoma,
} from "@/lib/amministrazione/prova-ordine";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { persistMessaggioAttachments } from "@/lib/webmail/attachments";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";
import { WEBMAIL_SENT_FOLDER } from "@/lib/webmail/types";
import type { Attachment } from "mailparser";

const clienteSchema = z.object({
  clienteId: z.string().uuid("Scegli il cliente."),
  email: z.string().trim().max(200).optional(),
  documento: z.enum(["fattura", "proforma"]).optional(),
});

export type ClienteNumerazione = {
  id: string;
  ragioneSociale: string;
  codiceTarga: string;
};

export type NumerazioneReale = {
  cliente: string;
  codiceTarga: string;
  data: string;
  numeroOrdine: string;
  numeroFattura: string;
  numeroInternoFattura: string;
  numeroProforma: string;
  numeroProgressivoFic: string;
  documento: "fattura" | "proforma";
  email: string;
  fileName: string;
};

export type ProvaOrdineAperta = {
  ordineId: string;
  numeroOrdine: string;
  numeroFattura: string;
  email: string;
  cliente: string;
};

async function richiediAdmin() {
  const { auth } = await requireAnyAreaAccess([
    "commerciale",
    "amministrazione",
  ]);
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      ok: false as const,
      error: "Solo un amministratore può inviare la copia di controllo.",
    };
  }
  return { ok: true as const, auth };
}

function destinatarioControllo(
  raw: string | undefined
): { ok: true; email: string } | { ok: false; error: string } {
  const scritto = (raw ?? "").trim().toLowerCase();
  if (scritto && scritto !== EMAIL_CONTROLLO_DEFAULT) {
    return {
      ok: false,
      error:
        "La copia di controllo si invia solo a sandrohd@gmail.com. Nessuna mail è partita e nulla è stato registrato.",
    };
  }
  return { ok: true, email: EMAIL_CONTROLLO_DEFAULT };
}

async function pdfBozzaA4(
  input: Parameters<typeof buildFatturaA4PdfBlob>[0]
) {
  const loghi = await caricaLoghiFatturaA4Server();
  return buildFatturaA4PdfBlob({ ...input, loghi });
}

function prossimoSeqOrdine(
  righe: Array<{ numero_interno: string | null; cliente_id: string | null }>,
  clienteId: string,
  codiceTarga: string
): number {
  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^Or-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of righe) {
    if (row.cliente_id === clienteId) countById += 1;
    const match = String(row.numero_interno ?? "").match(re);
    if (match) maxParsed = Math.max(maxParsed, Number(match[1]));
  }
  return Math.max(countById, maxParsed) + 1;
}

export async function elencoClientiNumerazioneAction(): Promise<
  | { success: true; clienti: ClienteNumerazione[] }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti")
    .select("id, ragione_sociale, codice_targa")
    .is("deleted_at", null)
    .order("ragione_sociale", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    clienti: (data ?? []).map((riga) => ({
      id: riga.id,
      ragioneSociale: riga.ragione_sociale,
      codiceTarga: String(riga.codice_targa ?? "").trim().toUpperCase(),
    })),
  };
}

/**
 * Mostra i prossimi numeri veri e spedisce la copia PDF solo all'indirizzo di controllo.
 * Non inserisce l'ordine, non assegna il numero fiscale, non chiama lo SDI, non scrive al cliente.
 */
export async function anteprimaNumerazioneRealeAction(raw: {
  clienteId?: string;
  email?: string;
  documento?: "fattura" | "proforma";
}): Promise<
  | { success: true; numerazione: NumerazioneReale }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const parsed = clienteSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Scegli il cliente.",
    };
  }
  const destino = destinatarioControllo(parsed.data.email);
  if (!destino.ok) return { success: false, error: destino.error };
  const email = destino.email;
  const documento = parsed.data.documento ?? "fattura";
  const supabase = await createClient();
  const { data: cliente, error: clienteErr } = await supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, codice_targa, partita_iva, codice_fiscale, email, pec, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo"
    )
    .eq("id", parsed.data.clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (clienteErr) return { success: false, error: clienteErr.message };
  if (!cliente) return { success: false, error: "Cliente non trovato." };

  const { data: prodotto, error: prodottoErr } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome, prezzo_listino")
    .is("deleted_at", null)
    .order("codice", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (prodottoErr) return { success: false, error: prodottoErr.message };
  if (!prodotto) {
    return { success: false, error: "Non c'è un prodotto per compilare la riga del documento." };
  }

  const service = createServiceClient();
  const { data: caselle, error: caselleErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .is("deleted_at", null)
    .limit(8);
  if (caselleErr) return { success: false, error: caselleErr.message };
  const account = ((caselle ?? []) as AccountRow[]).find(
    (riga) => riga.smtp_host && riga.password_encrypted
  );
  if (!account) {
    return {
      success: false,
      error: "Nessuna casella Webmail con SMTP. La mail non è partita e nulla è stato salvato.",
    };
  }

  const data = oggiRoma();
  const targa = String(cliente.codice_targa ?? "").trim().toUpperCase() || "C000";
  const { data: ordini, error: ordiniErr } = await supabase
    .from("ordini")
    .select("numero_interno, cliente_id")
    .is("deleted_at", null);
  if (ordiniErr) return { success: false, error: ordiniErr.message };
  const seq = prossimoSeqOrdine(ordini ?? [], cliente.id, targa);
  const numeroOrdine = buildNumeroInternoOrdine({
    dataOrdine: data,
    codiceTargaCliente: targa,
    seq,
  });

  let fattura: { numeroFattura: string; numeroInterno: string };
  let proforma: { numeroFattura: string };
  try {
    fattura = await anteprimaNumeroFattura(supabase, data);
    proforma = await anteprimaNumeroProforma(supabase, data);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Numerazione non disponibile.",
    };
  }

  const numeroDocumento =
    documento === "proforma" ? proforma.numeroFattura : fattura.numeroFattura;
  const prezzo = Number(prodotto.prezzo_listino) > 0 ? Number(prodotto.prezzo_listino) : 1;
  const descrizione = String(prodotto.nome || prodotto.codice);
  const dataIt = data.split("-").reverse().join("/");
  const titolo = documento === "proforma" ? "Proforma" : "Fattura";
  const subject = `${titolo} ${numeroDocumento} del ${dataIt}`;
  const bodyText = [
    "Copia di controllo. Non inviata al cliente e non trasmessa allo SDI. Il numero non è stato assegnato.",
    "",
    `Gentile ${cliente.ragione_sociale},`,
    "",
    `in allegato trova ${documento === "proforma" ? "la proforma" : "la fattura"} ${numeroDocumento} del ${dataIt}.`,
    `Ordine di riferimento: ${numeroOrdine}.`,
    `Voci: ${descrizione}.`,
    "",
    "Restiamo a disposizione per ogni chiarimento.",
    "",
    "Cordiali saluti,",
    "Ufficio Amministrazione",
    "Agrinsicilia Soc. Coop.",
  ].join("\n");
  const pdf = await pdfBozzaA4({
    numeroFattura: numeroDocumento,
    dataDocumento: data,
    proforma: documento === "proforma",
    destinatario: {
      ragioneSociale: cliente.ragione_sociale,
      partitaIva: String(cliente.partita_iva ?? ""),
      codiceFiscale: String(cliente.codice_fiscale ?? ""),
      email: String(cliente.email ?? ""),
      sede: {
        ...emptySede(),
        nazione: String(cliente.sede_amm_nazione ?? ""),
        provincia: String(cliente.sede_amm_provincia ?? ""),
        citta: String(cliente.sede_amm_citta ?? ""),
        cap: String(cliente.sede_amm_cap ?? ""),
        indirizzo: String(cliente.sede_amm_indirizzo ?? ""),
      },
    },
    righe: [
      {
        prodottoId: prodotto.id,
        codice: prodotto.codice,
        descrizione,
        quantita: 1,
        unitaMisura: "kg",
        prezzoUnitario: prezzo,
        scontoPercentuale: 0,
        ivaPercentuale: 22,
        isSpedizione: false,
        note: "",
      },
    ],
    noteDocumento: `Ordine di riferimento ${numeroOrdine}.`,
  });
  const pdfBytes = Buffer.from(await pdf.blob.arrayBuffer());

  let smtpMessageId: string | null = null;
  try {
    const sent = await sendMailViaAccount({
      account,
      to: email,
      subject,
      text: bodyText,
      attachments: [
        {
          filename: pdf.fileName,
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
    smtpMessageId = sent.messageId;
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Mail non partita. Nessun documento è stato salvato. ${e.message}`
          : "Mail non partita. Nessun documento è stato salvato.",
    };
  }

  const sentAt = new Date().toISOString();
  const { data: inserted, error: mailErr } = await service
    .from("webmail_messaggi")
    .insert({
      account_id: account.id,
      direction: "outbound",
      message_uid: `controllo-numerazione-${randomUUID()}`,
      message_id_header: smtpMessageId,
      folder: WEBMAIL_SENT_FOLDER,
      from_address: account.email_address,
      from_name: "",
      to_addresses: [email],
      cc_addresses: [],
      subject,
      body_text: bodyText,
      body_html: bodyText.replace(/\n/g, "<br/>"),
      received_at: sentAt,
      sent_at: sentAt,
      is_seen: true,
      created_by: accesso.auth.userId,
      updated_by: accesso.auth.userId,
    })
    .select("id")
    .single();
  if (inserted?.id) {
    try {
      await persistMessaggioAttachments({
        supabase: service,
        messaggioId: String(inserted.id),
        accountId: account.id,
        userId: accesso.auth.userId,
        attachments: [
          {
            filename: pdf.fileName,
            content: pdfBytes,
            contentType: "application/pdf",
            contentDisposition: "attachment",
          } as Attachment,
        ],
      });
    } catch (e) {
      console.error("[controllo numerazione allegato]", e);
    }
  }

  await writeAuditLog({
    entity_type: "controllo_numerazione",
    entity_id: cliente.id,
    action: "copia_controllo_inviata",
    actor_id: accesso.auth.userId,
    summary: `Copia ${titolo} ${numeroDocumento} inviata solo a ${email}. Non salvata, non SDI, non al cliente.`,
    payload: {
      documento,
      numero_ordine: numeroOrdine,
      numero_fattura: fattura.numeroFattura,
      numero_progressivo_fic: String(splitNumeroForFic(fattura.numeroFattura).number),
      numero_proforma: proforma.numeroFattura,
      email,
      sdi: false,
      salvato: false,
      numero_fiscale_consumato: false,
      webmail_errore: mailErr?.message ?? null,
    },
  });

  return {
    success: true,
    numerazione: {
      cliente: cliente.ragione_sociale,
      codiceTarga: targa,
      data,
      numeroOrdine,
      numeroFattura: fattura.numeroFattura,
      numeroInternoFattura: fattura.numeroInterno,
      numeroProforma: proforma.numeroFattura,
      numeroProgressivoFic: String(splitNumeroForFic(fattura.numeroFattura).number),
      documento,
      email,
      fileName: pdf.fileName,
    },
  };
}

const bozzaControlloSchema = z.object({
  numeroFattura: z.string().trim().max(40).optional().default(""),
  dataDocumento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  noteDocumento: z.string().max(8000).optional().default(""),
  destinatario: z.object({
    ragioneSociale: z.string().trim().min(1).max(300),
    partitaIva: z.string().max(32).optional().default(""),
    codiceFiscale: z.string().max(32).optional().default(""),
    email: z.string().max(200).optional().default(""),
    sede: z.object({
      nazione: z.string().optional().default(""),
      provincia: z.string().optional().default(""),
      citta: z.string().optional().default(""),
      cap: z.string().optional().default(""),
      indirizzo: z.string().optional().default(""),
    }),
  }),
  righe: z
    .array(
      z.object({
        prodottoId: z.string().uuid().nullable().optional(),
        codice: z.string().max(80).optional().default(""),
        descrizione: z.string().trim().min(1).max(500),
        quantita: z.number().positive(),
        unitaMisura: z.string().trim().min(1).max(16),
        prezzoUnitario: z.number().min(0),
        scontoPercentuale: z.number().min(0).max(100),
        ivaPercentuale: z.number().min(0).max(100),
        isSpedizione: z.boolean(),
        note: z.string().max(2000).optional().default(""),
      })
    )
    .min(1),
  piano: ordinePagamentoPianoSchema.optional(),
});

const ordineControlloSchema = z.object({
  ordineId: z.string().uuid("Ordine non valido."),
  email: z.string().trim().max(200).optional(),
  bozza: bozzaControlloSchema.optional(),
  documento: z.enum(["informativa", "proforma", "fattura"]).optional(),
  allegaPdf: z.boolean().optional(),
  allegaTracking: z.boolean().optional(),
  trackingUrl: z.string().trim().max(500).optional(),
  oggetto: z.string().trim().max(500).optional(),
  corpo: z.string().trim().max(20000).optional(),
});

/** Copia della fattura dell'ordine appena creato. Non assegna il numero e non chiama lo SDI. */
export async function inviaCopiaControlloOrdineAction(raw: {
  ordineId?: string;
  email?: string;
  bozza?: z.input<typeof bozzaControlloSchema>;
  documento?: "informativa" | "proforma" | "fattura";
  allegaPdf?: boolean;
  allegaTracking?: boolean;
  trackingUrl?: string;
  oggetto?: string;
  corpo?: string;
}): Promise<
  | {
      success: true;
      numeroOrdine: string;
      numeroFattura: string;
      numeroProgressivoFic: string;
      email: string;
    }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const parsed = ordineControlloSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ordine non valido.",
    };
  }
  const destino = destinatarioControllo(parsed.data.email);
  if (!destino.ok) return { success: false, error: destino.error };
  const email = destino.email;
  const supabase = await createClient();
  const { data: ordine, error: ordineErr } = await supabase
    .from("ordini")
    .select(
      "id, numero_interno, cliente_id, cliente_ragione_sociale, sconto_extra_pct, prezzo_listino_unitario, spedizione_importo, spedizione_a_carico, spedizione_iva_modo, trasporto_imponibile, trasporto_iva_percentuale"
    )
    .eq("id", parsed.data.ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (ordineErr) return { success: false, error: ordineErr.message };
  if (!ordine?.cliente_id) {
    return { success: false, error: "L'ordine non ha un cliente registrato." };
  }
  const { data: cliente, error: clienteErr } = await supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, partita_iva, codice_fiscale, email, pec, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo"
    )
    .eq("id", ordine.cliente_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (clienteErr) return { success: false, error: clienteErr.message };
  if (!cliente) return { success: false, error: "Cliente non trovato." };
  const bozza = parsed.data.bozza;
  let righeDocumento: FatturaA4Riga[] = [];
  let destinatarioDocumento: FatturaDestinatarioSnapshot | null = bozza
    ? {
        ragioneSociale: bozza.destinatario.ragioneSociale,
        partitaIva: bozza.destinatario.partitaIva,
        codiceFiscale: bozza.destinatario.codiceFiscale,
        email: bozza.destinatario.email,
        sede: {
          ...emptySede(),
          nazione: bozza.destinatario.sede.nazione,
          provincia: bozza.destinatario.sede.provincia,
          citta: bozza.destinatario.sede.citta,
          cap: bozza.destinatario.sede.cap,
          indirizzo: bozza.destinatario.sede.indirizzo,
        },
      }
    : null;
  let noteDocumento = bozza?.noteDocumento ?? "";
  let dataDocumento = bozza?.dataDocumento || oggiRoma();
  if (bozza) {
    righeDocumento = bozza.righe.map((riga) => ({
      prodottoId: riga.prodottoId ?? null,
      codice: riga.codice,
      descrizione: riga.descrizione,
      quantita: riga.quantita,
      unitaMisura: riga.unitaMisura,
      prezzoUnitario: riga.prezzoUnitario,
      scontoPercentuale: riga.scontoPercentuale,
      ivaPercentuale: riga.ivaPercentuale,
      isSpedizione: riga.isSpedizione,
      note: riga.note,
    }));
  } else {
    const { data: fatturaSalvata, error: fatErr } = await supabase
      .from("fatture_emesse")
      .select("id, data_emissione, note, destinatario_snapshot, cliente_ragione_sociale")
      .eq("ordine_id", ordine.id)
      .eq("tipo_documento", "fattura")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fatErr) return { success: false, error: fatErr.message };
    let fatturaRighe: FatturaA4Riga[] = [];
    if (fatturaSalvata?.id) {
      const { data: salvate, error: salvateErr } = await supabase
        .from("fatture_emesse_righe")
        .select(
          "prodotto_id, codice, descrizione, quantita, unita_misura, prezzo_unitario, sconto_percentuale, iva_percentuale, is_spedizione, note"
        )
        .eq("fattura_id", fatturaSalvata.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (salvateErr) return { success: false, error: salvateErr.message };
      fatturaRighe = (salvate ?? []).map((riga) => ({
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
      noteDocumento = String(fatturaSalvata.note ?? "");
      dataDocumento = String(fatturaSalvata.data_emissione || dataDocumento);
      const snap = parseDestinatarioSnapshot(fatturaSalvata.destinatario_snapshot);
      if (snap) destinatarioDocumento = snap;
    }
    if (fatturaRighe.length > 0) {
      righeDocumento = fatturaRighe;
    } else {
      const { data: righe, error: righeErr } = await supabase
        .from("ordini_righe")
        .select(
          "prodotto_id, prodotto_codice, prodotto_nome, quantita, unita_misura, prezzo_unitario, iva_percentuale"
        )
        .eq("ordine_id", ordine.id)
        .order("sort_order", { ascending: true });
      if (righeErr) return { success: false, error: righeErr.message };
      if (!righe?.length) {
        return {
          success: false,
          error: "L'ordine non ha righe da mettere in fattura.",
        };
      }
      const scontoOrdine = Number(ordine.sconto_extra_pct ?? 0);
      const listinoHeader =
        ordine.prezzo_listino_unitario != null
          ? Number(ordine.prezzo_listino_unitario)
          : null;
      righeDocumento = righe.map((riga) => {
        const mapped = listinoEScontoDaOrdine({
          prezzoRiga: Number(riga.prezzo_unitario),
          prezzoListinoHeader: listinoHeader,
          scontoExtraPct: scontoOrdine,
          isSpedizione: false,
        });
        return {
          prodottoId: riga.prodotto_id,
          codice: String(riga.prodotto_codice ?? ""),
          descrizione: String(riga.prodotto_nome || riga.prodotto_codice || "Voce"),
          quantita: Number(riga.quantita) || 0,
          unitaMisura: String(riga.unita_misura ?? "kg"),
          prezzoUnitario: mapped.prezzoUnitario,
          scontoPercentuale: mapped.scontoPercentuale,
          ivaPercentuale: Number(riga.iva_percentuale) || 22,
          isSpedizione: false,
          note: "",
        };
      });
      const importoSpedizioneSalvato = Number(ordine.spedizione_importo ?? 0);
      const importoSpedizione =
        importoSpedizioneSalvato > 0
          ? importoSpedizioneSalvato
          : Number(ordine.trasporto_imponibile) || 0;
      righeDocumento = applyContributoSpeseSpedizione(righeDocumento, {
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
    }
  }
  if (!righeDocumento.length) {
    return { success: false, error: "La fattura non ha voci da allegare." };
  }

  const service = createServiceClient();
  const { data: caselle, error: caselleErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .is("deleted_at", null)
    .limit(8);
  if (caselleErr) return { success: false, error: caselleErr.message };
  const account = ((caselle ?? []) as AccountRow[]).find(
    (riga) => riga.smtp_host && riga.password_encrypted
  );
  if (!account) {
    return {
      success: false,
      error: "Nessuna casella Webmail con SMTP. La mail non è partita.",
    };
  }

  const documento = parsed.data.documento ?? "fattura";
  const allegaPdf = parsed.data.allegaPdf !== false && documento !== "informativa";
  const data = dataDocumento || oggiRoma();
  let numeroFattura = "";
  if (allegaPdf) {
    try {
      const anteprima =
        documento === "proforma"
          ? await anteprimaNumeroProforma(supabase, oggiRoma())
          : await anteprimaNumeroFattura(supabase, oggiRoma());
      numeroFattura = anteprima.numeroFattura;
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Numerazione non disponibile.",
      };
    }
    const numeroBozza = bozza?.numeroFattura?.trim() ?? "";
    if (documento === "fattura" && /^\d+\/20\d{2}$/.test(numeroBozza)) {
      numeroFattura = numeroBozza;
    }
  }

  const destinatario = destinatarioDocumento ?? {
    ragioneSociale: cliente.ragione_sociale,
    partitaIva: String(cliente.partita_iva ?? ""),
    codiceFiscale: String(cliente.codice_fiscale ?? ""),
    email: String(cliente.email ?? ""),
    sede: {
      ...emptySede(),
      nazione: String(cliente.sede_amm_nazione ?? ""),
      provincia: String(cliente.sede_amm_provincia ?? ""),
      citta: String(cliente.sede_amm_citta ?? ""),
      cap: String(cliente.sede_amm_cap ?? ""),
      indirizzo: String(cliente.sede_amm_indirizzo ?? ""),
    },
  };
  const dataIt = data.split("-").reverse().join("/");
  const prodotti = righeDocumento.map((riga) => riga.descrizione).join(", ");
  const titoloDoc = documento === "proforma" ? "Proforma" : "Fattura";
  const subject =
    parsed.data.oggetto?.trim() ||
    (documento === "informativa"
      ? `Ordine ${ordine.numero_interno} in elaborazione`
      : `${titoloDoc} ${numeroFattura} del ${dataIt}`);
  const tracking =
    parsed.data.allegaTracking && parsed.data.trackingUrl?.trim()
      ? parsed.data.trackingUrl.trim()
      : "";
  const bodyDefault =
    documento === "informativa"
      ? [
          "Copia di controllo. Non inviata al cliente e non trasmessa allo SDI.",
          "",
          `Gentile ${destinatario.ragioneSociale},`,
          "",
          `il suo ordine ${ordine.numero_interno} è in fase di elaborazione.`,
          prodotti ? `Voci: ${prodotti}.` : "",
          tracking ? `Tracking: ${tracking}` : "",
          "",
          "Cordiali saluti,",
          "Ufficio Amministrazione",
          "Agrinsicilia Soc. Coop.",
        ]
          .filter((riga) => riga !== "")
          .join("\n")
      : [
          "Copia di controllo. Non inviata al cliente e non trasmessa allo SDI. Il numero non è stato assegnato.",
          "",
          `Gentile ${destinatario.ragioneSociale},`,
          "",
          `in allegato trova ${documento === "proforma" ? "la proforma" : "la fattura"} ${numeroFattura} del ${dataIt}.`,
          `Ordine di riferimento: ${ordine.numero_interno}.`,
          `Voci: ${prodotti}.`,
          tracking ? `Tracking: ${tracking}` : "",
          "",
          "Restiamo a disposizione per ogni chiarimento.",
          "",
          "Cordiali saluti,",
          "Ufficio Amministrazione",
          "Agrinsicilia Soc. Coop.",
        ]
          .filter((riga) => riga !== "")
          .join("\n");
  const bodyText = parsed.data.corpo?.trim()
    ? `${parsed.data.corpo.trim()}${tracking && !parsed.data.corpo.includes(tracking) ? `\n\nTracking: ${tracking}` : ""}`
    : bodyDefault;
  const pdf = allegaPdf
    ? await pdfBozzaA4({
        numeroFattura,
        dataDocumento: data,
        destinatario,
        righe: righeDocumento,
        noteDocumento:
          noteDocumento.trim() || `Ordine di riferimento ${ordine.numero_interno}.`,
        piano: bozza?.piano ?? null,
        proforma: documento === "proforma",
      })
    : null;
  const pdfBytes = pdf ? Buffer.from(await pdf.blob.arrayBuffer()) : null;
  try {
    const sent = await sendMailViaAccount({
      account,
      to: email,
      subject,
      text: bodyText,
      attachments:
        pdf && pdfBytes
          ? [
              {
                filename: pdf.fileName,
                content: pdfBytes,
                contentType: "application/pdf",
              },
            ]
          : [],
    });
    const sentAt = new Date().toISOString();
    const { data: inserted } = await service
      .from("webmail_messaggi")
      .insert({
        account_id: account.id,
        direction: "outbound",
        message_uid: `controllo-ordine-${randomUUID()}`,
        message_id_header: sent.messageId,
        folder: WEBMAIL_SENT_FOLDER,
        from_address: account.email_address,
        from_name: "",
        to_addresses: [email],
        cc_addresses: [],
        subject,
        body_text: bodyText,
        body_html: bodyText.replace(/\n/g, "<br/>"),
        received_at: sentAt,
        sent_at: sentAt,
        is_seen: true,
        created_by: accesso.auth.userId,
        updated_by: accesso.auth.userId,
      })
      .select("id")
      .single();
    if (inserted?.id && pdf && pdfBytes) {
      try {
        await persistMessaggioAttachments({
          supabase: service,
          messaggioId: String(inserted.id),
          accountId: account.id,
          userId: accesso.auth.userId,
          attachments: [
            {
              filename: pdf.fileName,
              content: pdfBytes,
              contentType: "application/pdf",
              contentDisposition: "attachment",
            } as Attachment,
          ],
        });
      } catch (e) {
        console.error("[controllo ordine allegato]", e);
      }
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Mail non partita.",
    };
  }

  await writeAuditLog({
    entity_type: "ordini",
    entity_id: ordine.id,
    action: "copia_controllo_ordine",
    actor_id: accesso.auth.userId,
    summary: `Copia fattura ${numeroFattura} dell'ordine ${ordine.numero_interno} inviata solo a ${email}. Numero non assegnato, SDI non chiamato.`,
    payload: {
      numero_ordine: ordine.numero_interno,
      numero_fattura: numeroFattura,
      numero_progressivo_fic: String(splitNumeroForFic(numeroFattura).number),
      email,
      sdi: false,
      numero_fiscale_consumato: false,
    },
  });

  return {
    success: true,
    numeroOrdine: ordine.numero_interno,
    numeroFattura,
    numeroProgressivoFic: String(splitNumeroForFic(numeroFattura).number),
    email,
  };
}

async function chiudiDocumentoProva(
  userId: string,
  ids: { ordineId?: string | null; fatturaId?: string | null; messaggioId?: string | null }
): Promise<string | null> {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const patch = {
    deleted_at: now,
    deleted_by: userId,
    updated_by: userId,
  };
  if (ids.fatturaId) {
    const righe = await service
      .from("fatture_emesse_righe")
      .update({
        deleted_at: now,
        deleted_by: userId,
        updated_by: userId,
      } as never)
      .eq("fattura_id", ids.fatturaId)
      .is("deleted_at", null);
    if (righe.error) return righe.error.message;
    const fattura = await service
      .from("fatture_emesse")
      .update(patch)
      .eq("id", ids.fatturaId)
      .is("deleted_at", null);
    if (fattura.error) return fattura.error.message;
  }
  if (ids.ordineId) {
    const calendario = await service
      .from("produzione_calendario_impegni")
      .update(patch)
      .eq("ordine_id", ids.ordineId)
      .is("deleted_at", null);
    if (calendario.error) return calendario.error.message;
    const schede = await service
      .from("produzione_schede_ordini")
      .update(patch)
      .eq("ordine_id", ids.ordineId)
      .is("deleted_at", null);
    if (schede.error) return schede.error.message;
    const ordine = await service
      .from("ordini")
      .update(patch)
      .eq("id", ids.ordineId)
      .is("deleted_at", null);
    if (ordine.error) return ordine.error.message;
  }
  if (ids.messaggioId) {
    const messaggio = await service
      .from("webmail_messaggi")
      .update(patch)
      .eq("id", ids.messaggioId)
      .is("deleted_at", null);
    if (messaggio.error) return messaggio.error.message;
  }
  return null;
}

function idWebmailDallaNota(note: string | null | undefined): string | null {
  const match = String(note ?? "").match(
    /webmail:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? null;
}

export async function statoProvaOrdineAction(): Promise<
  | { success: true; prova: ProvaOrdineAperta | null }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("is_test", true)
    .like("numero_interno", "Or-PROVA/%")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data || !isOrdineProva(data.numero_interno)) {
    return { success: true, prova: null };
  }
  const { data: fattura } = await supabase
    .from("fatture_emesse")
    .select("numero_fattura, note")
    .eq("ordine_id", data.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    success: true,
    prova: {
      ordineId: data.id,
      numeroOrdine: data.numero_interno,
      numeroFattura: String(fattura?.numero_fattura ?? "").trim(),
      email: "",
      cliente: data.cliente_ragione_sociale,
    },
  };
}

export async function annullaProvaOrdineAction(): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const accesso = await richiediAdmin();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data: ordini, error } = await supabase
    .from("ordini")
    .select("id, numero_interno")
    .eq("is_test", true)
    .like("numero_interno", "Or-PROVA/%")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const aperti = (ordini ?? []).filter((riga) => isOrdineProva(riga.numero_interno));
  if (aperti.length === 0) {
    return { success: false, error: "Non c'è un ordine di prova da chiudere." };
  }
  for (const ordine of aperti) {
    const { data: fatture } = await supabase
      .from("fatture_emesse")
      .select("id, note, numero_fattura")
      .eq("ordine_id", ordine.id)
      .is("deleted_at", null);
    for (const fattura of fatture ?? []) {
      const chiusuraFattura = await chiudiDocumentoProva(accesso.auth.userId, {
        fatturaId: fattura.id,
        messaggioId: idWebmailDallaNota(fattura.note),
      });
      if (chiusuraFattura) return { success: false, error: chiusuraFattura };
    }
    const chiusuraOrdine = await chiudiDocumentoProva(accesso.auth.userId, {
      ordineId: ordine.id,
    });
    if (chiusuraOrdine) return { success: false, error: chiusuraOrdine };
    await writeAuditLog({
      entity_type: "ordini",
      entity_id: ordine.id,
      action: "prova_ordine_annullata",
      actor_id: accesso.auth.userId,
      summary: `Ordine di prova ${ordine.numero_interno} chiuso senza cancellazione fisica.`,
      payload: {
        numero_ordine: ordine.numero_interno,
        fatture: (fatture ?? []).map((fattura) => fattura.numero_fattura),
        soft_delete: true,
      },
    });
  }
  return { success: true };
}
