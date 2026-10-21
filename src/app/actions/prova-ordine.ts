"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { buildFatturaA4PdfBlob } from "@/lib/amministrazione/fattura-a4-pdf";
import { emptySede } from "@/lib/amministrazione/fornitori";
import {
  EMAIL_PROVA_DEFAULT,
  isOrdineProva,
  numeroFatturaProva,
  numeroOrdineProva,
  oggiRoma,
  prossimoProgressivoProva,
} from "@/lib/amministrazione/prova-ordine";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { persistMessaggioAttachments } from "@/lib/webmail/attachments";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";
import { WEBMAIL_SENT_FOLDER } from "@/lib/webmail/types";
import type { Attachment } from "mailparser";
import type { FatturaEmessaInsert, OrdineInsert } from "@/types/database";

const emailSchema = z.object({
  email: z.string().trim().max(200).optional(),
});

export type ProvaOrdineAperta = {
  ordineId: string;
  numeroOrdine: string;
  numeroFattura: string;
  email: string;
  cliente: string;
};

async function richiediAdminProva() {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "produzione"]);
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      ok: false as const,
      error: "Solo un amministratore può avviare o chiudere la prova ordine.",
    };
  }
  return { ok: true as const, auth };
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
  const accesso = await richiediAdminProva();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale, note")
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
    .select("numero_fattura, invio_email")
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
      email: String(fattura?.invio_email ?? "").trim() || EMAIL_PROVA_DEFAULT,
      cliente: data.cliente_ragione_sociale,
    },
  };
}

export async function avviaProvaOrdineAction(raw: {
  email?: string;
}): Promise<
  | { success: true; prova: ProvaOrdineAperta }
  | { success: false; error: string }
> {
  const accesso = await richiediAdminProva();
  if (!accesso.ok) return { success: false, error: accesso.error };
  const parsed = emailSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Indirizzo non valido.",
    };
  }
  const emailInserita = (parsed.data.email ?? "").trim();
  const email = (emailInserita || EMAIL_PROVA_DEFAULT).toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { success: false, error: "Indirizzo email non valido." };
  }
  const supabase = await createClient();
  const gia = await statoProvaOrdineAction();
  if (!gia.success) return gia;
  if (gia.prova) {
    return {
      success: false,
      error: `C'è già la prova ${gia.prova.numeroOrdine}. Usa Cancella e ripeti il test prima di farne un'altra.`,
    };
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
      error:
        "Nessuna casella Webmail con SMTP. La prova non è stata creata e nulla è partito.",
    };
  }

  const { data: cliente, error: clienteErr } = await supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, codice_targa, partita_iva, codice_fiscale, email, pec, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo"
    )
    .is("deleted_at", null)
    .order("ragione_sociale", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clienteErr) return { success: false, error: clienteErr.message };
  if (!cliente) {
    return { success: false, error: "Non c'è un cliente registrato su cui appoggiare la prova." };
  }
  const emailCliente = String(cliente.email ?? "").trim().toLowerCase();
  const pecCliente = String(cliente.pec ?? "").trim().toLowerCase();
  if (email === emailCliente || (pecCliente && email === pecCliente)) {
    return {
      success: false,
      error:
        "Questo indirizzo è del cliente. La prova non parte verso il cliente. Lascia sandrohd@gmail.com o scrivine un altro.",
    };
  }

  const { data: prodotto, error: prodottoErr } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome")
    .is("deleted_at", null)
    .order("codice", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (prodottoErr) return { success: false, error: prodottoErr.message };
  if (!prodotto) {
    return { success: false, error: "Non c'è un prodotto su cui appoggiare la riga di prova." };
  }

  const dataDocumento = oggiRoma();
  const anno = Number(dataDocumento.slice(0, 4));
  const [{ data: fattureNumeri }, { data: ordiniNumeri }] = await Promise.all([
    supabase.from("fatture_emesse").select("numero_fattura, numero_interno").like("numero_interno", "Ft-PROVA-%"),
    supabase.from("ordini").select("numero_interno").like("numero_interno", "Or-PROVA/%"),
  ]);
  const esistenti = [
    ...(fattureNumeri ?? []).flatMap((riga) => [
      String(riga.numero_fattura ?? ""),
      String(riga.numero_interno ?? ""),
    ]),
    ...(ordiniNumeri ?? []).map((riga) => String(riga.numero_interno ?? "")),
  ];
  const progressivo = prossimoProgressivoProva(esistenti, anno);
  const numeroFattura = numeroFatturaProva(progressivo, anno);
  const numeroOrdine = numeroOrdineProva(progressivo, anno);
  const numeroInternoFattura = `Ft-${numeroFattura}`;
  const descrizione = String(prodotto.nome || prodotto.codice);
  const imponibile = 1;
  const iva = 22;
  const imposta = 0.22;
  const totale = 1.22;
  const sede = [
    cliente.sede_amm_indirizzo,
    cliente.sede_amm_cap,
    cliente.sede_amm_citta,
    cliente.sede_amm_provincia,
  ]
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const nota =
    `PROVA. Fattura ${numeroFattura} non trasmessa allo SDI. ` +
    `Mail solo a ${email}, non al cliente.`;

  const ordineInsert: OrdineInsert = {
    numero_interno: numeroOrdine,
    numero_cliente: "PROVA",
    cliente_id: cliente.id,
    cliente_ragione_sociale: cliente.ragione_sociale,
    cliente_codice_targa: String(cliente.codice_targa ?? "").trim().toUpperCase() || "PROVA",
    destinatario: cliente.ragione_sociale,
    indirizzo_spedizione: sede,
    data_ordine: dataDocumento,
    stato: "in_attesa",
    documento_stato: "registrato",
    tipo: "vendita",
    is_test: true,
    consegna_tipo: "asap",
    tipo_pagamento: "alla_consegna",
    pagamento_modalita: "unica",
    modalita_spedizione_prezzo: "non_applicabile",
    spedizione_importo: 0,
    spedizione_mezzo: "corriere",
    corriere_da_compilare: false,
    importo_euro: totale,
    note: nota,
    versione: 1,
    created_by: accesso.auth.userId,
    updated_by: accesso.auth.userId,
  };
  const { data: ordine, error: ordineErr } = await supabase
    .from("ordini")
    .insert(ordineInsert)
    .select("id")
    .single();
  if (ordineErr || !ordine) {
    return { success: false, error: ordineErr?.message ?? "Ordine di prova non creato." };
  }

  const { error: rigaOrdineErr } = await supabase.from("ordini_righe").insert({
    ordine_id: ordine.id,
    prodotto_id: prodotto.id,
    prodotto_codice: prodotto.codice,
    prodotto_nome: descrizione,
    quantita: 1,
    unita_misura: "kg",
    prezzo_unitario: imponibile,
    iva_percentuale: iva,
    sort_order: 0,
    note: "Riga di prova",
  });
  if (rigaOrdineErr) {
    await chiudiDocumentoProva(accesso.auth.userId, { ordineId: ordine.id });
    return { success: false, error: rigaOrdineErr.message };
  }

  const destinatario = {
    ragioneSociale: cliente.ragione_sociale,
    partitaIva: String(cliente.partita_iva ?? ""),
    codiceFiscale: String(cliente.codice_fiscale ?? ""),
    email,
    sede: {
      ...emptySede(),
      nazione: String(cliente.sede_amm_nazione ?? ""),
      provincia: String(cliente.sede_amm_provincia ?? ""),
      citta: String(cliente.sede_amm_citta ?? ""),
      cap: String(cliente.sede_amm_cap ?? ""),
      indirizzo: String(cliente.sede_amm_indirizzo ?? ""),
    },
  };
  const fatturaInsert: FatturaEmessaInsert = {
    numero_interno: numeroInternoFattura,
    numero_fattura: numeroFattura,
    numero_documento_esterno: numeroFattura,
    cliente_id: cliente.id,
    cliente_ragione_sociale: cliente.ragione_sociale,
    cliente_codice_targa: ordineInsert.cliente_codice_targa ?? "",
    destinatario_snapshot: destinatario as unknown as Record<string, unknown>,
    data_emissione: dataDocumento,
    imponibile,
    iva_percentuale: iva,
    imposta,
    totale,
    stato_pagamento: "da_pagare",
    documento_stato: "registrata",
    tipo_documento: "fattura",
    origine: "manuale",
    ordine_id: ordine.id,
    fic_id: null,
    ei_status: "prova",
    courtesy_email_sent: false,
    invio_email: email,
    note: nota,
    versione: 1,
    created_by: accesso.auth.userId,
    updated_by: accesso.auth.userId,
  };
  const { data: fattura, error: fatturaErr } = await supabase
    .from("fatture_emesse")
    .insert(fatturaInsert)
    .select("id")
    .single();
  if (fatturaErr || !fattura) {
    await chiudiDocumentoProva(accesso.auth.userId, { ordineId: ordine.id });
    return {
      success: false,
      error: fatturaErr?.message ?? "Fattura di prova non creata. L'ordine è stato chiuso.",
    };
  }
  const { error: rigaFatturaErr } = await supabase.from("fatture_emesse_righe").insert({
    fattura_id: fattura.id,
    prodotto_id: prodotto.id,
    codice: prodotto.codice,
    descrizione,
    quantita: 1,
    unita_misura: "kg",
    prezzo_unitario: imponibile,
    sconto_percentuale: 0,
    iva_percentuale: iva,
    importo: imponibile,
    is_spedizione: false,
    note: "Riga di prova",
    sort_order: 0,
    created_by: accesso.auth.userId,
    updated_by: accesso.auth.userId,
  });
  if (rigaFatturaErr) {
    await chiudiDocumentoProva(accesso.auth.userId, {
      ordineId: ordine.id,
      fatturaId: fattura.id,
    });
    return { success: false, error: rigaFatturaErr.message };
  }

  const pdf = buildFatturaA4PdfBlob({
    numeroFattura,
    dataDocumento,
    destinatario,
    righe: [
      {
        prodottoId: prodotto.id,
        codice: prodotto.codice,
        descrizione,
        quantita: 1,
        unitaMisura: "kg",
        prezzoUnitario: imponibile,
        scontoPercentuale: 0,
        ivaPercentuale: iva,
        isSpedizione: false,
        note: "",
      },
    ],
    noteDocumento: nota,
  });
  const pdfBytes = Buffer.from(await pdf.blob.arrayBuffer());
  const subject = `Fattura di prova ${numeroFattura} — non SDI`;
  const bodyText = [
    `Fattura di prova ${numeroFattura} del ${dataDocumento}.`,
    `Ordine ${numeroOrdine}, cliente di appoggio ${cliente.ragione_sociale}.`,
    "Questo documento non è stato trasmesso allo SDI.",
    `La mail è stata inviata solo a ${email}, non all'indirizzo del cliente.`,
    "Il numero non consuma la serie fiscale.",
  ].join("\n");

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
    await chiudiDocumentoProva(accesso.auth.userId, {
      ordineId: ordine.id,
      fatturaId: fattura.id,
    });
    return {
      success: false,
      error:
        e instanceof Error
          ? `Mail non partita, prova annullata: ${e.message}`
          : "Mail non partita. La prova è stata annullata e si può ripetere.",
    };
  }

  const sentAt = new Date().toISOString();
  const { data: inserted, error: mailErr } = await service
    .from("webmail_messaggi")
    .insert({
      account_id: account.id,
      direction: "outbound",
      message_uid: `prova-fattura-${randomUUID()}`,
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
      azienda_tipo: "cliente",
      azienda_id: cliente.id,
      azienda_label: cliente.ragione_sociale,
      created_by: accesso.auth.userId,
      updated_by: accesso.auth.userId,
    })
    .select("id")
    .single();
  const messaggioId = inserted?.id ? String(inserted.id) : null;
  if (messaggioId) {
    try {
      await persistMessaggioAttachments({
        supabase: service,
        messaggioId,
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
      console.error("[prova ordine allegato]", e);
    }
    await supabase
      .from("fatture_emesse")
      .update({
        note: `${nota} webmail:${messaggioId}`,
        courtesy_email_sent: true,
        sent_at: sentAt,
        sent_by: accesso.auth.userId,
        updated_by: accesso.auth.userId,
      })
      .eq("id", fattura.id);
  }

  await writeAuditLog({
    entity_type: "ordini",
    entity_id: ordine.id,
    action: "prova_ordine_creata",
    actor_id: accesso.auth.userId,
    summary: `Prova ${numeroOrdine} con fattura ${numeroFattura} inviata solo a ${email}. Nessun SDI.`,
    payload: {
      numero_ordine: numeroOrdine,
      numero_fattura: numeroFattura,
      email,
      cliente_id: cliente.id,
      fattura_id: fattura.id,
      sdi: false,
      numero_fiscale_consumato: false,
      webmail_messaggio_id: messaggioId,
      webmail_errore: mailErr?.message ?? null,
    },
  });

  return {
    success: true,
    prova: {
      ordineId: ordine.id,
      numeroOrdine,
      numeroFattura,
      email,
      cliente: cliente.ragione_sociale,
    },
  };
}

export async function annullaProvaOrdineAction(): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const accesso = await richiediAdminProva();
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
    return { success: false, error: "Non c'è una prova aperta da cancellare." };
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
      summary: `Prova ${ordine.numero_interno} chiusa. Si può ripetere. Nessuna cancellazione fisica.`,
      payload: {
        numero_ordine: ordine.numero_interno,
        fatture: (fatture ?? []).map((fattura) => fattura.numero_fattura),
        soft_delete: true,
      },
    });
  }
  return { success: true };
}
