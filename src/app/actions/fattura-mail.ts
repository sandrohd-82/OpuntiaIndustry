"use server";

import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";
import { generaTestoMailFattura } from "@/lib/amministrazione/fattura-mail-ai";
import {
  parseDestinatarioSnapshot,
  type FatturaA4Riga,
} from "@/lib/amministrazione/fattura-a4-documento";
import { buildFatturaA4PdfBlob } from "@/lib/amministrazione/fattura-a4-pdf";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { motivoBloccoInvioClienteOrdine } from "@/app/actions/ordine-calcolo-spedizione";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { persistMessaggioAttachments } from "@/lib/webmail/attachments";
import { sendMailViaAccount } from "@/lib/webmail/sync";
import { WEBMAIL_SENT_FOLDER } from "@/lib/webmail/types";
import type { Attachment } from "mailparser";
import { z } from "zod";

export async function generaCorpoMailFatturaAction(input: {
  cliente: string;
  numeroFattura: string;
  dataDocumento: string;
  ordineNumero: string;
  prodotti: string;
  totaleEuro: string;
}): Promise<
  | { success: true; subject: string; bodyText: string; model: string }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "webmail"]);
  try {
    const testo = await generaTestoMailFattura(input);
    return {
      success: true,
      subject: testo.subject,
      bodyText: testo.bodyText,
      model: testo.model,
    };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error ? e.message : "Generazione testo mail non riuscita.",
    };
  }
}

const invioWebmailSchema = z.object({
  fatturaId: z.string().uuid(),
  accountId: z.string().uuid(),
  to: z.string().trim().email("Indirizzo destinatario non valido"),
  subject: z.string().trim().min(1).max(500),
  bodyText: z.string().trim().min(1).max(50000),
});

export async function inviaFatturaDaWebmailAction(
  raw: z.input<typeof invioWebmailSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "webmail"]);
  const parsed = invioWebmailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mail non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: fattura, error: fatErr } = await supabase
    .from("fatture_emesse")
    .select(
      "id, numero_fattura, numero_documento_esterno, data_emissione, note, cliente_id, ordine_id, cliente_ragione_sociale, destinatario_snapshot, tipo_documento"
    )
    .eq("id", input.fatturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fatErr || !fattura) {
    return { success: false, error: fatErr?.message ?? "Fattura non trovata." };
  }
  const bloccoSpedizione = await motivoBloccoInvioClienteOrdine(
    (fattura as { ordine_id?: string | null }).ordine_id
  );
  if (bloccoSpedizione) return { success: false, error: bloccoSpedizione };
  const { data: cliente } = await supabase
    .from("clienti")
    .select(
      "ragione_sociale, partita_iva, codice_fiscale, sede_amm_nazione, sede_amm_provincia, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo"
    )
    .eq("id", fattura.cliente_id)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: righeRaw, error: righeErr } = await supabase
    .from("fatture_emesse_righe")
    .select(
      "prodotto_id, codice, descrizione, quantita, unita_misura, prezzo_unitario, sconto_percentuale, iva_percentuale, is_spedizione, note, sort_order"
    )
    .eq("fattura_id", input.fatturaId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (righeErr) return { success: false, error: righeErr.message };
  const righe: FatturaA4Riga[] = (righeRaw ?? []).map((r) => ({
    prodottoId: r.prodotto_id ? String(r.prodotto_id) : null,
    codice: String(r.codice ?? ""),
    descrizione: String(r.descrizione ?? ""),
    quantita: Number(r.quantita) || 0,
    unitaMisura: String(r.unita_misura ?? "nr"),
    prezzoUnitario: Number(r.prezzo_unitario) || 0,
    scontoPercentuale: Number(r.sconto_percentuale) || 0,
    ivaPercentuale: Number(r.iva_percentuale) || 22,
    isSpedizione: Boolean(r.is_spedizione),
    note: String(r.note ?? ""),
  }));
  if (righe.length === 0) {
    return { success: false, error: "La fattura non ha righe da allegare." };
  }
  const destSalvato = parseDestinatarioSnapshot(fattura.destinatario_snapshot);
  const destinatario = destSalvato ?? {
    ragioneSociale: String(
      fattura.cliente_ragione_sociale || cliente?.ragione_sociale || "Cliente"
    ),
    partitaIva: String(cliente?.partita_iva ?? ""),
    codiceFiscale: String(cliente?.codice_fiscale ?? ""),
    email: input.to,
    sede: {
      nazione: String(cliente?.sede_amm_nazione ?? ""),
      provincia: String(cliente?.sede_amm_provincia ?? ""),
      citta: String(cliente?.sede_amm_citta ?? ""),
      cap: String(cliente?.sede_amm_cap ?? ""),
      indirizzo: String(cliente?.sede_amm_indirizzo ?? ""),
    },
  };
  const numero = String(
    fattura.numero_fattura || fattura.numero_documento_esterno || "Fattura"
  );
  const pdf = buildFatturaA4PdfBlob({
    numeroFattura: numero,
    dataDocumento: String(fattura.data_emissione ?? ""),
    destinatario,
    righe,
    noteDocumento: String(fattura.note ?? ""),
    proforma: String(fattura.tipo_documento ?? "") === "proforma",
  });
  const pdfBytes = Buffer.from(await pdf.blob.arrayBuffer());

  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", input.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella non trovata." };
  }

  let smtpMessageId: string | null = null;
  try {
    const sent = await sendMailViaAccount({
      account: account as {
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
      },
      to: input.to,
      subject: input.subject,
      text: input.bodyText,
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
      error: e instanceof Error ? e.message : "Invio SMTP fallito.",
    };
  }

  const sentAt = new Date().toISOString();
  const { data: inserted, error: insErr } = await service
    .from("webmail_messaggi")
    .insert({
      account_id: input.accountId,
      direction: "outbound",
      message_uid: `fattura-${randomUUID()}`,
      message_id_header: smtpMessageId,
      folder: WEBMAIL_SENT_FOLDER,
      from_address: String(account.email_address),
      from_name: "",
      to_addresses: [input.to],
      cc_addresses: [],
      subject: input.subject,
      body_text: input.bodyText,
      body_html: input.bodyText.replace(/\n/g, "<br/>"),
      received_at: sentAt,
      sent_at: sentAt,
      is_seen: true,
      azienda_tipo: "cliente",
      azienda_id: fattura.cliente_id,
      azienda_label: destinatario.ragioneSociale,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      success: false,
      error:
        insErr?.message ??
        "Mail inviata ma registrazione in Webmail non riuscita.",
    };
  }
  const messaggioId = String(inserted.id);
  try {
    await persistMessaggioAttachments({
      supabase: service,
      messaggioId,
      accountId: input.accountId,
      userId: auth.userId,
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
    console.error("[fattura webmail allegato]", e);
  }

  await service
    .from("fatture_emesse")
    .update({
      invio_email: input.to,
      courtesy_email_sent: true,
      sent_at: sentAt,
      sent_by: auth.userId,
      updated_by: auth.userId,
      updated_at: sentAt,
    })
    .eq("id", input.fatturaId)
    .is("deleted_at", null);

  await writeAuditLog({
    entity_type: "fatture_emesse",
    entity_id: input.fatturaId,
    action: "fattura_mail_webmail",
    actor_id: auth.userId,
    summary: `Fattura ${numero} inviata da Webmail a ${input.to}`,
    payload: {
      account_id: input.accountId,
      to: input.to,
      subject: input.subject,
      messaggio_id: messaggioId,
      allegato: pdf.fileName,
    },
  });
  return { success: true };
}
