import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { matchWebmailAnagrafica } from "@/lib/webmail/anagrafica-link";
import { persistMessaggioAttachments } from "@/lib/webmail/attachments";
import { normalizeBlacklistEmail } from "@/lib/webmail/blacklist";
import { applyLearningOnImport } from "@/lib/webmail/category-learn-db";
import { decryptWebmailSecret } from "@/lib/webmail/crypto";
import { extractPlainFromHtml } from "@/lib/webmail/html-render";
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
  importedIds: string[];
  error?: string;
};

export type WebmailSyncMode = "recent" | "older";

/** Massimo mail per singola richiesta IMAP (sicurezza timeout / provider). */
export const WEBMAIL_SYNC_SAFE_BATCH = 40;

/** Finestra UID recenti + attesa IDLE per «Mantieni sincronizzato». */
export const WEBMAIL_LIVE_UID_WINDOW = 40;
export const WEBMAIL_LIVE_IDLE_MS = 25_000;

export type WebmailSyncPreviewAccount = {
  accountId: string;
  email: string;
  missing: number;
  importedInScope: number;
  olderAvailable: number;
};

function pickMissingBatch(
  missing: string[],
  existing: Iterable<string>,
  mode: WebmailSyncMode,
  batchLimit: number
): { list: string[]; pending: number } {
  const missingSorted = [...missing].sort((a, b) => Number(a) - Number(b));
  if (missingSorted.length === 0) return { list: [], pending: 0 };

  if (mode === "older") {
    const existingNums = [...existing]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (existingNums.length === 0) {
      return { list: [], pending: missingSorted.length };
    }
    const minImported = Math.min(...existingNums);
    const older = missingSorted.filter((u) => Number(u) < minImported);
    const list = older.slice(-batchLimit);
    return { list, pending: missingSorted.length - list.length };
  }

  const list = missingSorted.slice(-batchLimit);
  return { list, pending: missingSorted.length - list.length };
}

function normalizeMessageUid(value: unknown): string {
  return String(value ?? "").trim();
}

function imapFlagsHasSeen(flags: unknown): boolean {
  if (!flags) return false;
  const items =
    flags instanceof Set
      ? [...flags]
      : Array.isArray(flags)
        ? flags
        : typeof flags === "object"
          ? Object.values(flags as Record<string, unknown>)
          : [flags];
  return items.some((f) => String(f).toLowerCase() === "\\seen");
}

async function loadExistingUids(
  supabase: Service,
  accountId: string,
  candidateUids: string[]
): Promise<Set<string>> {
  const existingSet = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < candidateUids.length; i += chunkSize) {
    const chunk = candidateUids.slice(i, i + chunkSize);
    const { data: existingRows, error } = await supabase
      .from("webmail_messaggi")
      .select("message_uid")
      .eq("account_id", accountId)
      .eq("folder", "INBOX")
      .in("message_uid", chunk);
    if (error) {
      console.error("[webmail sync existing uids]", error.message);
      for (const uid of chunk) existingSet.add(normalizeMessageUid(uid));
      continue;
    }
    for (const row of existingRows ?? []) {
      existingSet.add(normalizeMessageUid(row.message_uid));
    }
  }
  return existingSet;
}

/** UID IMAP più alto già in archivio (anche soft-delete): il cron non deve tornare indietro. */
async function loadMaxInboxUid(
  supabase: Service,
  accountId: string
): Promise<number> {
  let maxUid = 0;
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .select("message_uid")
      .eq("account_id", accountId)
      .eq("folder", "INBOX")
      .range(from, from + page - 1);
    if (error) {
      console.error("[webmail sync max uid]", error.message);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const n = Number(normalizeMessageUid(row.message_uid));
      if (Number.isFinite(n) && n > maxUid) maxUid = n;
    }
    if (rows.length < page) break;
  }
  return maxUid;
}

async function messageIdAlreadyImported(
  supabase: Service,
  accountId: string,
  messageId: string | null | undefined
): Promise<boolean> {
  const header = messageId?.trim();
  if (!header) return false;
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("id")
    .eq("account_id", accountId)
    .eq("message_id_header", header)
    .limit(1);
  if (error) {
    console.error("[webmail sync message-id]", error.message);
    return true;
  }
  return Boolean(data?.[0]?.id);
}

async function loadImapSeenByUid(
  client: ImapFlow,
  uids: string[]
): Promise<Map<string, boolean>> {
  const seenByUid = new Map<string, boolean>();
  if (uids.length === 0) return seenByUid;
  try {
    for await (const msg of client.fetch(uids.join(","), { flags: true }, { uid: true })) {
      if (!msg.uid) continue;
      seenByUid.set(String(msg.uid), imapFlagsHasSeen(msg.flags));
    }
  } catch (e) {
    console.error(
      "[webmail sync flags]",
      e instanceof Error ? e.message : e
    );
  }
  return seenByUid;
}

async function loadAccountBlacklist(
  supabase: Service,
  accountId: string
): Promise<Set<string>> {
  const { data: blRows } = await supabase
    .from("webmail_blacklist")
    .select("email_address, account_id")
    .is("deleted_at", null)
    .or(`account_id.eq.${accountId},account_id.is.null`);
  return new Set(
    (blRows ?? []).map((r) =>
      normalizeBlacklistEmail(String(r.email_address ?? ""))
    )
  );
}

async function listRecentInboxUids(
  client: ImapFlow,
  window: number
): Promise<string[]> {
  const exists = Number(
    (client.mailbox as { exists?: number } | undefined)?.exists ?? 0
  );
  if (exists <= 0) return [];
  const fromSeq = Math.max(1, exists - window + 1);
  const uids: string[] = [];
  for await (const msg of client.fetch(`${fromSeq}:${exists}`, { uid: true })) {
    if (msg.uid) uids.push(String(msg.uid));
  }
  return uids;
}

async function waitForImapNewMail(
  client: ImapFlow,
  maxWaitMs: number
): Promise<void> {
  const idle = (
    client as ImapFlow & {
      idle?: (maxWait?: number) => Promise<unknown>;
    }
  ).idle;
  if (typeof idle === "function") {
    try {
      await idle.call(client, maxWaitMs);
      return;
    } catch {
      // alcuni provider non espongono IDLE: attesa con evento exists
    }
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const t = setTimeout(finish, maxWaitMs);
    client.once("exists", () => {
      clearTimeout(t);
      finish();
    });
  });
}

async function importInboxUidList(
  supabase: Service,
  account: AccountRow,
  client: ImapFlow,
  list: string[],
  blacklist: Set<string>
): Promise<{ imported: number; importedIds: string[] }> {
  let imported = 0;
  const importedIds: string[] = [];
  const seenByUid = await loadImapSeenByUid(client, list);

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
    const fromNorm = normalizeBlacklistEmail(fromAddr);
    if (fromNorm && blacklist.has(fromNorm)) {
      continue;
    }
    const fromName = fromObj?.value?.[0]?.name?.trim() || "";
    const toAddresses = (toObj?.value ?? [])
      .map((v: { address?: string }) => v.address || "")
      .filter(Boolean);
    const ccObj = Array.isArray(parsed.cc) ? parsed.cc[0] : parsed.cc;
    const ccAddresses = (ccObj?.value ?? [])
      .map((v: { address?: string }) => v.address || "")
      .filter(Boolean);
    const subject = parsed.subject?.trim() || "(senza oggetto)";
    const bodyText = (
      parsed.text?.trim() ||
      (parsed.html ? extractPlainFromHtml(String(parsed.html)) : "")
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

    const messageIdHeader =
      typeof parsed.messageId === "string" ? parsed.messageId.trim() : "";
    if (await messageIdAlreadyImported(supabase, account.id, messageIdHeader)) {
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("webmail_messaggi")
      .insert({
        account_id: account.id,
        direction: "inbound",
        message_uid: uidStr,
        message_id_header: messageIdHeader || null,
        folder: "INBOX",
        from_address: fromAddr,
        from_name: fromName,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        received_at: receivedAt,
        sent_at: receivedAt,
        is_seen: seenByUid.get(uidStr) === true,
        // Sempre In arrivo (non letta): l’apprendimento resta un suggerimento.
        categoria_id: null,
        categoria_suggest_id:
          learned.categoriaSuggestId || learned.categoriaId || null,
        categoria_suggest_mode: learned.categoriaId
          ? "suggest"
          : learned.categoriaSuggestMode,
        categoria_auto_pending: false,
        categoria_auto_applied_at: null,
        categoria_auto_notified: false,
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
    importedIds.push(String(inserted.id));

    const attRes = await persistMessaggioAttachments({
      supabase,
      messaggioId: String(inserted.id),
      accountId: account.id,
      attachments: parsed.attachments,
    });
    if (attRes.errors.length) {
      console.error(
        "[webmail sync allegati]",
        inserted.id,
        attRes.errors.slice(0, 3).join("; ")
      );
    }

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
        allegati: attRes.saved,
      },
    });
  }

  return { imported, importedIds };
}

/**
 * Sync IMAP in batch. Con sync_since storico non importa tutto in un colpo
 * (evita timeout Vercel / schermata bianca): rilanciare sync per continuare.
 */
export async function syncWebmailAccount(
  supabase: Service,
  account: AccountRow,
  options?: {
    limit?: number;
    mode?: WebmailSyncMode;
    /** Solo UID più alti di quelli già in archivio (cron / nuove arrivate). */
    newMailOnly?: boolean;
  }
): Promise<SyncWebmailResult> {
  const limit = options?.limit ?? WEBMAIL_SYNC_SAFE_BATCH;
  const batchLimit = Math.min(
    WEBMAIL_SYNC_SAFE_BATCH,
    Math.max(1, Number.isFinite(limit) ? limit : WEBMAIL_SYNC_SAFE_BATCH)
  );
  const mode: WebmailSyncMode = options?.mode === "older" ? "older" : "recent";
  const newMailOnly = Boolean(options?.newMailOnly);

  let imported = 0;
  let skipped = 0;
  const drafted = 0;
  const importedIds: string[] = [];

  let password: string;
  try {
    password = decryptWebmailSecret(account.password_encrypted);
  } catch (e) {
    return {
      imported: 0,
      drafted: 0,
      skipped: 0,
      pending: 0,
      importedIds: [],
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

      const blacklist = await loadAccountBlacklist(supabase, account.id);

      const existingSet = await loadExistingUids(supabase, account.id, all);
      let missing = all.filter((uid) => !existingSet.has(uid));
      if (newMailOnly) {
        const maxUid = await loadMaxInboxUid(supabase, account.id);
        missing = missing.filter((uid) => {
          const n = Number(uid);
          return Number.isFinite(n) && n > maxUid;
        });
      }
      skipped = all.length - missing.length;
      const picked = pickMissingBatch(missing, existingSet, mode, batchLimit);
      const list = picked.list;
      const pending = picked.pending;

      const importedRes = await importInboxUidList(
        supabase,
        account,
        client,
        list,
        blacklist
      );
      imported = importedRes.imported;
      importedIds.push(...importedRes.importedIds);

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

      return { imported, drafted, skipped, pending, importedIds };
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
    return {
      imported,
      drafted,
      skipped,
      pending: 0,
      importedIds,
      error: message,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export type WebmailLiveSyncResult = SyncWebmailResult & {
  waited: boolean;
  email: string;
};

/**
 * Ascolto casella: importa solo UID più nuovi di quelli già in archivio.
 * Se non ce ne sono, resta in IMAP IDLE finché ne arriva una (o scade l’attesa).
 */
export async function syncWebmailAccountLive(
  supabase: Service,
  account: AccountRow,
  options?: { idleMs?: number; userId?: string | null }
): Promise<WebmailLiveSyncResult> {
  const idleMs =
    options?.idleMs === 0
      ? 0
      : Math.min(
          50_000,
          Math.max(3_000, options?.idleMs ?? WEBMAIL_LIVE_IDLE_MS)
        );
  const empty: WebmailLiveSyncResult = {
    imported: 0,
    drafted: 0,
    skipped: 0,
    pending: 0,
    importedIds: [],
    waited: false,
    email: account.email_address,
  };

  let password: string;
  try {
    password = decryptWebmailSecret(account.password_encrypted);
  } catch (e) {
    return {
      ...empty,
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

  let imported = 0;
  const importedIds: string[] = [];
  let waited = false;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const blacklist = await loadAccountBlacklist(supabase, account.id);

      const pullNew = async () => {
        const recent = await listRecentInboxUids(
          client,
          WEBMAIL_LIVE_UID_WINDOW
        );
        if (recent.length === 0) return { imported: 0, importedIds: [] as string[] };
        const existingSet = await loadExistingUids(
          supabase,
          account.id,
          recent
        );
        const maxUid = await loadMaxInboxUid(supabase, account.id);
        const missing = recent.filter((uid) => {
          if (existingSet.has(uid)) return false;
          const n = Number(uid);
          return Number.isFinite(n) && n > maxUid;
        });
        if (missing.length === 0) {
          return { imported: 0, importedIds: [] as string[] };
        }
        return importInboxUidList(
          supabase,
          account,
          client,
          missing,
          blacklist
        );
      };

      const first = await pullNew();
      imported = first.imported;
      importedIds.push(...first.importedIds);

      if (imported === 0 && idleMs > 0) {
        waited = true;
        await waitForImapNewMail(client, idleMs);
        const second = await pullNew();
        imported = second.imported;
        importedIds.push(...second.importedIds);
      }

      await supabase
        .from("webmail_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", account.id);

      if (imported > 0) {
        await logElaborazione(supabase, {
          accountId: account.id,
          action: "live_sync",
          userId: options?.userId ?? null,
          summary: `Ascolto casella: ${imported} mail nuove importate`,
          payload: { imported, waited, importedIds },
        });
      }

      return {
        imported,
        drafted: 0,
        skipped: 0,
        pending: 0,
        importedIds,
        waited,
        email: account.email_address,
      };
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
    return {
      imported,
      drafted: 0,
      skipped: 0,
      pending: 0,
      importedIds,
      waited,
      email: account.email_address,
      error: message,
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export async function syncWebmailLive(
  supabase: Service,
  options?: {
    accountId?: string;
    idleMs?: number;
    userId?: string | null;
    accountIds?: string[];
  }
): Promise<{
  imported: number;
  importedIds: string[];
  errors: string[];
  waited: boolean;
  emails: string[];
}> {
  let query = supabase
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
    )
    .is("deleted_at", null);
  if (options?.accountId) {
    query = query.eq("id", options.accountId);
  } else if (options?.accountIds && options.accountIds.length > 0) {
    query = query.in("id", options.accountIds);
  } else {
    query = query.eq("sync_enabled", true);
  }

  const { data, error } = await query;
  if (error) {
    return {
      imported: 0,
      importedIds: [],
      errors: [error.message],
      waited: false,
      emails: [],
    };
  }
  const rows = (data ?? []) as AccountRow[];
  if (rows.length === 0) {
    return {
      imported: 0,
      importedIds: [],
      errors: ["Nessuna casella da ascoltare."],
      waited: false,
      emails: [],
    };
  }

  let imported = 0;
  const importedIds: string[] = [];
  const errors: string[] = [];
  let waited = false;
  const emails = rows.map((r) => r.email_address);

  if (rows.length === 1) {
    const res = await syncWebmailAccountLive(supabase, rows[0]!, {
      idleMs: options?.idleMs,
      userId: options?.userId,
    });
    imported = res.imported;
    importedIds.push(...res.importedIds);
    waited = res.waited;
    if (res.error) errors.push(`${res.email}: ${res.error}`);
    return { imported, importedIds, errors, waited, emails };
  }

  for (const row of rows) {
    const res = await syncWebmailAccountLive(supabase, row, {
      idleMs: 0,
      userId: options?.userId,
    });
    imported += res.imported;
    importedIds.push(...res.importedIds);
    if (res.error) errors.push(`${res.email}: ${res.error}`);
  }

  if (imported === 0 && !errors.length) {
    const listen = await syncWebmailAccountLive(supabase, rows[0]!, {
      idleMs: options?.idleMs,
      userId: options?.userId,
    });
    imported += listen.imported;
    importedIds.push(...listen.importedIds);
    waited = listen.waited;
    if (listen.error) errors.push(`${listen.email}: ${listen.error}`);
  }

  return { imported, importedIds, errors, waited, emails };
}

export async function previewWebmailAccount(
  supabase: Service,
  account: AccountRow
): Promise<
  | Omit<WebmailSyncPreviewAccount, "accountId" | "email">
  | { error: string }
> {
  let password: string;
  try {
    password = decryptWebmailSecret(account.password_encrypted);
  } catch (e) {
    return {
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
      const existingSet = await loadExistingUids(supabase, account.id, all);
      const missing = all.filter((uid) => !existingSet.has(uid));
      const older = pickMissingBatch(
        missing,
        existingSet,
        "older",
        WEBMAIL_SYNC_SAFE_BATCH
      );
      return {
        missing: missing.length,
        importedInScope: existingSet.size,
        olderAvailable: older.list.length,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return { error: formatImapSyncError(e, account) };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export async function previewWebmailAccounts(
  supabase: Service,
  accountId?: string
): Promise<
  | { success: true; totalMissing: number; accounts: WebmailSyncPreviewAccount[] }
  | { success: false; error: string }
> {
  let query = supabase
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
    )
    .is("deleted_at", null);
  if (accountId) {
    query = query.eq("id", accountId);
  } else {
    query = query.eq("sync_enabled", true);
  }
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as AccountRow[];
  if (rows.length === 0) {
    return { success: false, error: "Nessuna casella da sincronizzare." };
  }

  const accounts: WebmailSyncPreviewAccount[] = [];
  let totalMissing = 0;
  for (const row of rows) {
    const res = await previewWebmailAccount(supabase, row);
    if ("error" in res) {
      return {
        success: false,
        error: `${row.email_address}: ${res.error}`,
      };
    }
    totalMissing += res.missing;
    accounts.push({
      accountId: row.id,
      email: row.email_address,
      missing: res.missing,
      importedInScope: res.importedInScope,
      olderAvailable: res.olderAvailable,
    });
  }
  return { success: true, totalMissing, accounts };
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
  supabase: Service,
  options?: {
    mode?: WebmailSyncMode;
    limit?: number;
    newMailOnly?: boolean;
  }
): Promise<{
  accounts: number;
  imported: number;
  drafted: number;
  pending: number;
  importedIds: string[];
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
      importedIds: [],
      errors: [error.message],
    };
  }

  let imported = 0;
  let drafted = 0;
  let pending = 0;
  const importedIds: string[] = [];
  const errors: string[] = [];
  for (const row of (data ?? []) as AccountRow[]) {
    const res = await syncWebmailAccount(supabase, row, options);
    imported += res.imported;
    drafted += res.drafted;
    pending += res.pending;
    importedIds.push(...res.importedIds);
    if (res.error) errors.push(`${row.email_address}: ${res.error}`);
  }
  return {
    accounts: (data ?? []).length,
    imported,
    drafted,
    pending,
    importedIds,
    errors,
  };
}

export async function sendMailViaAccount(input: {
  account: AccountRow;
  to: string;
  cc?: string;
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
    cc: input.cc || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text.replace(/\n/g, "<br/>"),
    attachments: input.attachments,
  });
}

/**
 * Re-download IMAP del singolo messaggio: aggiorna body_html/text + allegati CID.
 */
export async function reloadMessaggioBodyAndAttachments(input: {
  supabase: Service;
  account: AccountRow;
  messaggioId: string;
  folder: string;
  messageUid: string;
  userId?: string | null;
}): Promise<
  | {
      success: true;
      bodyHtml: string;
      bodyText: string;
      allegatiSaved: number;
    }
  | { success: false; error: string }
> {
  const uidNum = Number(input.messageUid);
  if (!Number.isFinite(uidNum) || uidNum <= 0) {
    return { success: false, error: "UID IMAP non valido." };
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
      const downloaded = await client.download(uidNum, undefined, { uid: true });
      const parsed = await simpleParser(downloaded.content);
      const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
      const bodyHtml =
        rawHtml.length > 200_000 ? rawHtml.slice(0, 200_000) : rawHtml;
      const bodyText = (
        parsed.text?.trim() ||
        (rawHtml ? extractPlainFromHtml(rawHtml) : "")
      ).slice(0, 500_000);

      const { error: upErr } = await input.supabase
        .from("webmail_messaggi")
        .update({
          body_html: bodyHtml,
          body_text: bodyText,
          updated_by: input.userId ?? null,
        })
        .eq("id", input.messaggioId)
        .is("deleted_at", null);
      if (upErr) return { success: false, error: upErr.message };

      const attRes = await persistMessaggioAttachments({
        supabase: input.supabase,
        messaggioId: input.messaggioId,
        accountId: input.account.id,
        attachments: parsed.attachments,
        userId: input.userId,
      });

      return {
        success: true,
        bodyHtml,
        bodyText,
        allegatiSaved: attRes.saved,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return {
      success: false,
      error: formatImapSyncError(e, input.account),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}
