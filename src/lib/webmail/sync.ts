import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { matchWebmailAnagrafica } from "@/lib/webmail/anagrafica-link";
import { applyLearningOnImport } from "@/lib/webmail/category-learn-db";
import { decryptWebmailSecret } from "@/lib/webmail/crypto";
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
  sync_since?: string | null;
};

/** Data SINCE per IMAP: sync_since casella oppure ultimi 30 giorni. */
export function resolveWebmailSyncSince(
  syncSince: string | null | undefined
): Date {
  const raw = syncSince ? String(syncSince).slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
  }
  const fallbackDays = Number(process.env.WEBMAIL_SYNC_FALLBACK_DAYS ?? "30");
  const since = new Date();
  since.setDate(
    since.getDate() - (Number.isFinite(fallbackDays) ? fallbackDays : 30)
  );
  since.setHours(0, 0, 0, 0);
  return since;
}

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

export type SyncWebmailResult = {
  imported: number;
  drafted: number;
  skipped: number;
  pending: number;
  error?: string;
};

/**
 * Sync IMAP in batch. Con sync_since storico non importa tutto in un colpo
 * (evita timeout Vercel / schermata bianca): rilanciare sync per continuare.
 */
export async function syncWebmailAccount(
  supabase: Service,
  account: AccountRow,
  options?: { limit?: number }
): Promise<SyncWebmailResult> {
  const hasCustomSince = Boolean(
    account.sync_since &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(account.sync_since).slice(0, 10))
  );
  const limit =
    options?.limit ??
    Number(
      process.env.WEBMAIL_SYNC_BATCH_SIZE ?? (hasCustomSince ? "40" : "60")
    );
  const batchLimit = Math.max(1, Number.isFinite(limit) ? limit : 40);

  let imported = 0;
  let skipped = 0;
  const drafted = 0;

  let password: string;
  try {
    password = decryptWebmailSecret(account.password_encrypted);
  } catch (e) {
    return {
      imported: 0,
      drafted: 0,
      skipped: 0,
      pending: 0,
      error:
        e instanceof Error
          ? e.message
          : "Password casella non decifrabile (WEBMAIL_ENCRYPTION_KEY?).",
    };
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: { user: account.username, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = resolveWebmailSyncSince(account.sync_since);
      const uids = await client.search({ since }, { uid: true });
      const all = (uids || []).map((u) => String(u));

      const existingSet = new Set<string>();
      const chunkSize = 200;
      for (let i = 0; i < all.length; i += chunkSize) {
        const chunk = all.slice(i, i + chunkSize);
        const { data: existingRows } = await supabase
          .from("webmail_messaggi")
          .select("message_uid")
          .eq("account_id", account.id)
          .eq("folder", "INBOX")
          .in("message_uid", chunk);
        for (const row of existingRows ?? []) {
          existingSet.add(String(row.message_uid));
        }
      }

      const missing = all.filter((uid) => !existingSet.has(uid));
      skipped = all.length - missing.length;
      // Ultime mancanti per prime (INBOX recente); ripeti sync per le più vecchie
      const list = missing.slice(-batchLimit);
      const pending = Math.max(0, missing.length - list.length);

      for (const uidStr of list) {
        const uid = Number(uidStr);
        let downloaded;
        try {
          downloaded = await client.download(uid, undefined, { uid: true });
        } catch (dlErr) {
          console.error(
            "[webmail sync download]",
            uidStr,
            dlErr instanceof Error ? dlErr.message : dlErr
          );
          continue;
        }

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
        const bodyText = (
          parsed.text?.trim() ||
          (parsed.html
            ? String(parsed.html).replace(/<[^>]+>/g, " ").trim()
            : "")
        ).slice(0, 500_000);
        const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
        const bodyHtml =
          rawHtml.length > 200_000 ? rawHtml.slice(0, 200_000) : rawHtml;
        const receivedAt =
          parsed.date?.toISOString() || new Date().toISOString();

        const anagrafica = await matchWebmailAnagrafica(supabase, fromAddr);
        const learned = await applyLearningOnImport(supabase, {
          accountId: account.id,
          fromAddress: fromAddr,
        });

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
            categoria_id: learned.categoriaId,
            categoria_suggest_id: learned.categoriaSuggestId,
            categoria_suggest_mode: learned.categoriaSuggestMode,
            categoria_auto_pending: learned.categoriaAutoPending,
            categoria_auto_applied_at: learned.categoriaAutoAppliedAt,
            categoria_auto_notified: learned.categoriaAutoNotified,
            azienda_tipo: anagrafica.aziendaTipo,
            azienda_id: anagrafica.aziendaId,
            azienda_label: anagrafica.aziendaLabel,
            contatto_id: anagrafica.contattoId,
            link_stato: anagrafica.linkStato,
          })
          .select("id")
          .single();
        if (error) {
          console.error("[webmail sync insert]", error.message);
          continue;
        }
        imported += 1;

        await logElaborazione(supabase, {
          messaggioId: inserted.id,
          accountId: account.id,
          action: "imported",
          aiGenerated: false,
          summary: learned.info
            ? `Import INBOX + ${learned.info}`
            : "Import INBOX (senza bozza AI automatica)",
          payload: {
            learnedMode: learned.categoriaSuggestMode,
            categoriaId: learned.categoriaId,
          },
        });
      }

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
        summary: `Sync INBOX: ${imported} nuovi, ${pending} ancora da importare (dal ${since.toISOString().slice(0, 10)})`,
        payload: {
          imported,
          drafted,
          skipped,
          pending,
          since: since.toISOString().slice(0, 10),
          totalMatched: all.length,
        },
      });

      return { imported, drafted, skipped, pending };
    } finally {
      lock.release();
    }
  } catch (e) {
    const message = formatImapSyncError(e, account);
    await supabase
      .from("webmail_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: message.slice(0, 900),
      })
      .eq("id", account.id);
    return { imported, drafted, skipped, pending: 0, error: message };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

const TRASH_CANDIDATES = [
  "Trash",
  "INBOX.Trash",
  "INBOX/Trash",
  "Deleted Messages",
  "Deleted",
  "Cestino",
  "[Gmail]/Trash",
];

/**
 * Best effort: sposta in Trash o marca \\Deleted sul server IMAP.
 */
export async function deleteImapMessageBestEffort(input: {
  account: AccountRow;
  folder: string;
  messageUid: string;
}): Promise<{ ok: boolean; detail: string }> {
  const uidNum = Number(input.messageUid);
  if (!Number.isFinite(uidNum) || uidNum <= 0) {
    return { ok: false, detail: "UID IMAP non valido." };
  }
  const password = decryptWebmailSecret(input.account.password_encrypted);
  const client = new ImapFlow({
    host: input.account.imap_host,
    port: input.account.imap_port,
    secure: input.account.imap_secure,
    auth: { user: input.account.username, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const folder = input.folder || "INBOX";
    const lock = await client.getMailboxLock(folder);
    try {
      for (const trash of TRASH_CANDIDATES) {
        try {
          const moved = await client.messageMove(String(uidNum), trash, {
            uid: true,
          });
          if (moved) {
            return { ok: true, detail: `Spostata in ${trash}` };
          }
        } catch {
          // prova cartella successiva
        }
      }

      await client.messageFlagsAdd(String(uidNum), ["\\Deleted"], {
        uid: true,
      });
      return { ok: true, detail: "Marcata \\Deleted su IMAP" };
    } finally {
      lock.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore IMAP";
    return { ok: false, detail: msg };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export async function syncAllWebmailAccounts(
  supabase: Service
): Promise<{
  accounts: number;
  imported: number;
  drafted: number;
  pending: number;
  errors: string[];
}> {
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
    )
    .eq("sync_enabled", true)
    .is("deleted_at", null);
  if (error) {
    return {
      accounts: 0,
      imported: 0,
      drafted: 0,
      pending: 0,
      errors: [error.message],
    };
  }

  let imported = 0;
  let drafted = 0;
  let pending = 0;
  const errors: string[] = [];
  for (const row of (data ?? []) as AccountRow[]) {
    const res = await syncWebmailAccount(supabase, row);
    imported += res.imported;
    drafted += res.drafted;
    pending += res.pending;
    if (res.error) errors.push(`${row.email_address}: ${res.error}`);
  }
  return {
    accounts: (data ?? []).length,
    imported,
    drafted,
    pending,
    errors,
  };
}

export async function sendMailViaAccount(input: {
  account: AccountRow;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
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
