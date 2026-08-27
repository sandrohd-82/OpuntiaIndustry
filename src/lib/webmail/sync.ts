import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { classifyInboundEmail, generateDraftReply } from "@/lib/webmail/ai";
import {
  intentToCategoriaCodice,
  matchWebmailAnagrafica,
} from "@/lib/webmail/anagrafica-link";
import { decryptWebmailSecret } from "@/lib/webmail/crypto";
import { buildRagForIntent } from "@/lib/webmail/rag";
import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

type AccountRow = {
  id: string;
  email_address: string;
  provider?: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  username: string;
  password_encrypted: string;
};

function formatImapSyncError(
  e: unknown,
  account: Pick<AccountRow, "email_address" | "username" | "provider">
): string {
  const base =
    e instanceof Error ? e.message : "Errore sync IMAP sconosciuto";
  const responseText =
    e && typeof e === "object" && "responseText" in e
      ? String((e as { responseText?: unknown }).responseText ?? "")
      : "";
  const authFailed =
    e &&
    typeof e === "object" &&
    "authenticationFailed" in e &&
    Boolean((e as { authenticationFailed?: boolean }).authenticationFailed);

  const userMismatch =
    account.username.trim().toLowerCase() !==
    account.email_address.trim().toLowerCase();

  if (
    authFailed ||
    /command failed|authentication|invalid credentials|login|auth/i.test(
      `${base} ${responseText}`
    )
  ) {
    const bits = [
      `Accesso IMAP rifiutato (${base}${responseText ? ` — ${responseText}` : ""}).`,
      "Per Aruba: Username deve essere l'indirizzo completo della casella (es. info@dominio.it), non un altro account Gmail.",
      "Usa la password della casella Aruba (non OTP / non password pannello admin).",
      "Host tipico: imaps.aruba.it porta 993 SSL.",
    ];
    if (userMismatch) {
      bits.push(
        `Attenzione: username salvato «${account.username}» ≠ email «${account.email_address}».`
      );
    }
    return bits.join(" ");
  }
  return responseText ? `${base}: ${responseText}` : base;
}

async function loadCategoriaMap(
  supabase: Service
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("webmail_categorie")
    .select("id, codice")
    .is("deleted_at", null);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.codice), String(row.id));
  }
  return map;
}

async function logElaborazione(
  supabase: Service,
  input: {
    messaggioId?: string | null;
    bozzaId?: string | null;
    accountId?: string | null;
    action: string;
    aiGenerated?: boolean;
    approvedBy?: string | null;
    sentAt?: string | null;
    summary: string;
    payload?: Record<string, unknown>;
    userId?: string | null;
  }
) {
  await supabase.from("webmail_ai_elaborazioni").insert({
    messaggio_id: input.messaggioId ?? null,
    bozza_id: input.bozzaId ?? null,
    account_id: input.accountId ?? null,
    action: input.action,
    ai_generated: Boolean(input.aiGenerated),
    approved_by: input.approvedBy ?? null,
    sent_at: input.sentAt ?? null,
    summary: input.summary,
    payload: input.payload ?? {},
    created_by: input.userId ?? null,
  });
}

export async function syncWebmailAccount(
  supabase: Service,
  account: AccountRow,
  options?: { limit?: number }
): Promise<{ imported: number; drafted: number; error?: string }> {
  const limit = options?.limit ?? 40;
  const password = decryptWebmailSecret(account.password_encrypted);
  const categorie = await loadCategoriaMap(supabase);
  let imported = 0;
  let drafted = 0;

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: {
      user: account.username,
      pass: password,
    },
    logger: false,
  });

  try {
    if (
      account.provider === "aruba" &&
      account.username.trim().toLowerCase() !==
        account.email_address.trim().toLowerCase()
    ) {
      throw new Error(
        `Username Aruba errato: «${account.username}» deve coincidere con la casella «${account.email_address}». Apri Modifica casella e correggi.`
      );
    }
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const uids = await client.search({ since }, { uid: true });
      const list = (uids || []).slice(-limit);

      for (const uid of list) {
        const uidStr = String(uid);
        const { data: existing } = await supabase
          .from("webmail_messaggi")
          .select("id, ai_processed_at, has_ai_draft")
          .eq("account_id", account.id)
          .eq("folder", "INBOX")
          .eq("message_uid", uidStr)
          .is("deleted_at", null)
          .maybeSingle();

        if (existing?.ai_processed_at && existing.has_ai_draft) {
          continue;
        }

        const downloaded = await client.download(uid, undefined, { uid: true });
        const parsed = await simpleParser(downloaded.content);
        const fromObj = Array.isArray(parsed.from)
          ? parsed.from[0]
          : parsed.from;
        const toObj = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
        const fromAddr =
          fromObj?.value?.[0]?.address?.trim() || fromObj?.text || "";
        const fromName = fromObj?.value?.[0]?.name?.trim() || "";
        const toAddresses = (toObj?.value ?? [])
          .map((v: { address?: string }) => v.address || "")
          .filter(Boolean);
        const subject = parsed.subject?.trim() || "(senza oggetto)";
        const bodyText =
          parsed.text?.trim() ||
          (parsed.html
            ? String(parsed.html).replace(/<[^>]+>/g, " ").trim()
            : "");
        const bodyHtml = typeof parsed.html === "string" ? parsed.html : "";
        const receivedAt =
          parsed.date?.toISOString() || new Date().toISOString();

        let messaggioId = existing?.id as string | undefined;
        if (!messaggioId) {
          const { data: inserted, error } = await supabase
            .from("webmail_messaggi")
            .insert({
              account_id: account.id,
              direction: "inbound",
              message_uid: uidStr,
              message_id_header: parsed.messageId || null,
              folder: "INBOX",
              from_address: fromAddr,
              from_name: fromName,
              to_addresses: toAddresses,
              subject,
              body_text: bodyText,
              body_html: bodyHtml,
              received_at: receivedAt,
              is_seen: false,
            })
            .select("id")
            .single();
          if (error) {
            console.error("[webmail sync insert]", error.message);
            continue;
          }
          messaggioId = inserted.id;
          imported += 1;
        }

        if (!messaggioId) continue;

        const classification = await classifyInboundEmail({
          subject,
          bodyText,
          fromName,
        });
        const catCode = intentToCategoriaCodice(classification.intent);
        const categoriaId =
          categorie.get(catCode) ??
          categorie.get(classification.intent) ??
          categorie.get("da_revisionare") ??
          null;

        const anagrafica = await matchWebmailAnagrafica(supabase, fromAddr);

        await supabase
          .from("webmail_messaggi")
          .update({
            categoria_id: categoriaId,
            ai_intent: classification.intent,
            ai_confidence: classification.confidence,
            ai_processed_at: new Date().toISOString(),
            azienda_tipo: anagrafica.aziendaTipo,
            azienda_id: anagrafica.aziendaId,
            azienda_label: anagrafica.aziendaLabel,
            contatto_id: anagrafica.contattoId,
            link_stato: anagrafica.linkStato,
          })
          .eq("id", messaggioId);

        await logElaborazione(supabase, {
          messaggioId,
          accountId: account.id,
          action: "classified",
          aiGenerated: true,
          summary: `Classificata come ${classification.intent} (${classification.confidence}%)`,
          payload: {
            intent: classification.intent,
            confidence: classification.confidence,
            model: classification.modelName,
          },
        });

        if (
          classification.intent === "scartate" ||
          classification.intent === "da_revisionare"
        ) {
          // bozza opzionale solo se confidence media su da_revisionare
          if (classification.intent === "scartate") continue;
        }

        const rag = await buildRagForIntent(
          supabase,
          classification.intent,
          classification.productQuery,
          bodyText
        );
        const draft = await generateDraftReply({
          intent: classification.intent,
          subject,
          bodyText,
          fromName,
          referentName: classification.referentName,
          ragContext: rag.notes,
        });

        const { data: existingDraft } = await supabase
          .from("webmail_bozze_ai")
          .select("id")
          .eq("messaggio_id", messaggioId)
          .is("deleted_at", null)
          .in("documento_stato", ["bozza", "approvata"])
          .maybeSingle();

        let bozzaId = existingDraft?.id as string | undefined;
        if (!bozzaId) {
          const { data: bozza, error: bozzaErr } = await supabase
            .from("webmail_bozze_ai")
            .insert({
              messaggio_id: messaggioId,
              account_id: account.id,
              documento_stato: "bozza",
              to_address: fromAddr,
              subject: draft.subject,
              body_text: draft.bodyText,
              body_html: draft.bodyText.replace(/\n/g, "<br/>"),
              intent: classification.intent,
              confidence: classification.confidence,
              model_name: draft.modelName,
              rag_notes: rag.notes,
              ai_generated: true,
            })
            .select("id")
            .single();
          if (bozzaErr) {
            console.error("[webmail draft]", bozzaErr.message);
            continue;
          }
          bozzaId = bozza.id;
          drafted += 1;

          if (rag.allegati.length > 0) {
            await supabase.from("webmail_bozze_allegati").insert(
              rag.allegati.map((a) => ({
                bozza_id: bozzaId,
                file_name: a.fileName,
                storage_path: a.storagePath,
                content_type: "application/pdf",
                source: a.source,
                prodotto_id: a.prodottoId,
              }))
            );
          }

          await supabase
            .from("webmail_messaggi")
            .update({ has_ai_draft: true })
            .eq("id", messaggioId);

          await logElaborazione(supabase, {
            messaggioId,
            bozzaId,
            accountId: account.id,
            action: "draft_created",
            aiGenerated: true,
            summary: `Bozza AI creata (${classification.intent})`,
            payload: { model: draft.modelName },
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await supabase
      .from("webmail_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", account.id);

    await logElaborazione(supabase, {
      accountId: account.id,
      action: "sync",
      summary: `Sync INBOX: ${imported} nuovi, ${drafted} bozze`,
      payload: { imported, drafted },
    });

    return { imported, drafted };
  } catch (e) {
    const message = formatImapSyncError(e, account);
    await supabase
      .from("webmail_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: message.slice(0, 900),
      })
      .eq("id", account.id);
    return { imported, drafted, error: message };
  }
}

export async function syncAllWebmailAccounts(
  supabase: Service
): Promise<{ accounts: number; imported: number; drafted: number; errors: string[] }> {
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("sync_enabled", true)
    .is("deleted_at", null);
  if (error) {
    return { accounts: 0, imported: 0, drafted: 0, errors: [error.message] };
  }

  let imported = 0;
  let drafted = 0;
  const errors: string[] = [];
  for (const row of (data ?? []) as AccountRow[]) {
    const res = await syncWebmailAccount(supabase, row);
    imported += res.imported;
    drafted += res.drafted;
    if (res.error) errors.push(`${row.email_address}: ${res.error}`);
  }
  return {
    accounts: (data ?? []).length,
    imported,
    drafted,
    errors,
  };
}

export async function sendMailViaAccount(input: {
  account: AccountRow;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}): Promise<void> {
  const password = decryptWebmailSecret(input.account.password_encrypted);
  const transporter = nodemailer.createTransport({
    host: input.account.smtp_host,
    port: input.account.smtp_port,
    secure: input.account.smtp_secure,
    auth: {
      user: input.account.username,
      pass: password,
    },
  });
  await transporter.sendMail({
    from: input.account.email_address,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text.replace(/\n/g, "<br/>"),
    attachments: input.attachments,
  });
}
