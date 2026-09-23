import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";
import nodemailer from "nodemailer";
import {
  matchWebmailAnagrafica,
  matchWebmailAnagraficaRecipients,
} from "@/lib/webmail/anagrafica-link";
import {
  WEBMAIL_IMPORT_PARZIALE_PREFIX,
  WEBMAIL_SENT_FOLDER,
} from "@/lib/webmail/types";
import { persistMessaggioAttachments } from "@/lib/webmail/attachments";
import { normalizeBlacklistEmail } from "@/lib/webmail/blacklist";
import { applyLearningOnImport } from "@/lib/webmail/category-learn-db";
import { decryptWebmailSecret } from "@/lib/webmail/crypto";
import { extractPlainFromHtml } from "@/lib/webmail/html-render";
import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

export type AccountRow = {
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
  if (/unexpected response/i.test(`${base} ${responseText}`)) {
    return [
      `Il server IMAP o la richiesta di sync si è interrotta (${account.email_address}).`,
      "Le mail già importate restano. Riprova: la sync continua dalle successive, a piccoli lotti.",
      responseText ? `Dettaglio: ${responseText}` : "",
    ]
      .filter(Boolean)
      .join(" ");
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
/** Inviate: MIME + allegati; lotti piccoli per non far cadere la Server Action. */
export const WEBMAIL_SYNC_SENT_BATCH = 6;
const WEBMAIL_SYNC_TIME_BUDGET_MS = 8_000;
const WEBMAIL_DOWNLOAD_TIMEOUT_MS = 8_000;
/** Oltre questa soglia non si scarica il MIME intero (timeout / memoria). */
const WEBMAIL_IMPORT_MAX_BYTES = 2_000_000;
const WEBMAIL_PART_TIMEOUT_MS = 12_000;
const WEBMAIL_PART_ATTACH_MAX = 20 * 1024 * 1024;
/** Newsletter da 15+ MB: basta l’inizio del MIME per testo/HTML. */
const WEBMAIL_BODY_PART_MAX_BYTES = 400_000;

/** Finestra UID recenti + attesa IDLE per «Mantieni sincronizzato». */
export const WEBMAIL_LIVE_UID_WINDOW = 40;
export const WEBMAIL_LIVE_IDLE_MS = 25_000;

export type WebmailSyncFolders = {
  inbox?: boolean;
  sent?: boolean;
  junk?: boolean;
};

export function resolveWebmailSyncFolders(
  folders?: WebmailSyncFolders
): { inbox: boolean; sent: boolean; junk: boolean } {
  return {
    inbox: folders?.inbox !== false,
    sent: folders?.sent !== false,
    junk: folders?.junk !== false,
  };
}

export type WebmailSyncPreviewAccount = {
  accountId: string;
  email: string;
  missing: number;
  inboxMissing: number;
  sentMissing: number;
  sentUnavailable: boolean;
  importedInScope: number;
  olderAvailable: number;
  sentOlderAvailable: number;
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

async function loadExistingUids(
  supabase: Service,
  accountId: string,
  candidateUids: string[],
  folder = "INBOX"
): Promise<Set<string>> {
  const existingSet = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < candidateUids.length; i += chunkSize) {
    const chunk = candidateUids.slice(i, i + chunkSize);
    const { data: existingRows, error } = await supabase
      .from("webmail_messaggi")
      .select("message_uid")
      .eq("account_id", accountId)
      .eq("folder", folder)
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
async function loadMaxFolderUid(
  supabase: Service,
  accountId: string,
  folder = "INBOX"
): Promise<number> {
  let maxUid = 0;
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .select("message_uid")
      .eq("account_id", accountId)
      .eq("folder", folder)
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

async function loadMaxInboxUid(
  supabase: Service,
  accountId: string
): Promise<number> {
  return loadMaxFolderUid(supabase, accountId, "INBOX");
}

async function sentAlreadyImported(
  supabase: Service,
  accountId: string,
  input: {
    messageId: string | null | undefined;
    subject: string;
    toAddresses: string[];
    sentAt: string;
  }
): Promise<boolean> {
  const header = input.messageId?.trim();
  if (header) {
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .select("id")
      .eq("account_id", accountId)
      .eq("direction", "outbound")
      .eq("message_id_header", header)
      .limit(1);
    if (error) {
      console.error("[webmail sync sent message-id]", error.message);
      return true;
    }
    if (data?.[0]?.id) return true;
  }
  const firstTo = (input.toAddresses[0] ?? "").trim().toLowerCase();
  const subject = input.subject.trim();
  if (!firstTo || !subject) return false;
  const t = new Date(input.sentAt).getTime();
  if (!Number.isFinite(t)) return false;
  const from = new Date(t - 20 * 60_000).toISOString();
  const to = new Date(t + 20 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("id, to_addresses")
    .eq("account_id", accountId)
    .eq("direction", "outbound")
    .eq("folder", WEBMAIL_SENT_FOLDER)
    .eq("subject", subject)
    .gte("sent_at", from)
    .lte("sent_at", to)
    .limit(12);
  if (error) {
    console.error("[webmail sync sent duplicate]", error.message);
    return false;
  }
  return (data ?? []).some((row) =>
    ((row.to_addresses as string[] | null) ?? []).some(
      (addr) => String(addr ?? "").trim().toLowerCase() === firstTo
    )
  );
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

async function markExistingSpamByMessageId(
  supabase: Service,
  accountId: string,
  messageId: string | null | undefined
): Promise<boolean> {
  const header = messageId?.trim();
  if (!header) return false;
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("id, spam_at")
    .eq("account_id", accountId)
    .eq("message_id_header", header)
    .limit(1);
  if (error) {
    console.error("[webmail sync spam message-id]", error.message);
    return true;
  }
  const row = data?.[0];
  if (!row?.id) return false;
  if (!row.spam_at) {
    await supabase
      .from("webmail_messaggi")
      .update({
        spam_at: new Date().toISOString(),
        archived_at: null,
        archived_by: null,
      })
      .eq("id", row.id)
      .is("deleted_at", null);
  }
  return true;
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

function isAbortiveImapError(e: unknown): boolean {
  const text = [
    e instanceof Error ? e.message : String(e ?? ""),
    e && typeof e === "object" && "responseText" in e
      ? String((e as { responseText?: unknown }).responseText ?? "")
      : "",
  ].join(" ");
  return /unexpected response|timeout|socket|closed|disconnected|econnreset|econnaborted|not available|connection/i.test(
    text
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout ${label} (${ms}ms)`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ImapLeafPart = {
  part: string;
  type: string;
  subtype: string;
  encoding: string;
  size: number;
  disposition: string;
  filename: string;
  contentId: string;
};

function splitImapMime(type: string, subtype: string): {
  type: string;
  subtype: string;
} {
  const rawType = String(type ?? "").toLowerCase().trim();
  const rawSub = String(subtype ?? "").toLowerCase().trim();
  if (rawType.includes("/")) {
    const [a, b] = rawType.split("/", 2);
    return { type: a || "", subtype: rawSub || b || "" };
  }
  return { type: rawType, subtype: rawSub };
}

function isImapTextBodyPart(part: Pick<ImapLeafPart, "type" | "subtype">): boolean {
  const { type, subtype } = splitImapMime(part.type, part.subtype);
  return type === "text" && (subtype === "html" || subtype === "plain" || !subtype);
}

function flattenImapStructure(
  node: unknown,
  fallbackPart = "1"
): ImapLeafPart[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const children = Array.isArray(n.childNodes) ? n.childNodes : [];
  const { type, subtype } = splitImapMime(
    String(n.type ?? ""),
    String(n.subtype ?? "")
  );
  const part = String(n.part ?? fallbackPart);
  const dispRaw = n.disposition;
  const disposition =
    typeof dispRaw === "string"
      ? dispRaw.toLowerCase()
      : String(
          (dispRaw && typeof dispRaw === "object"
            ? (dispRaw as { type?: string }).type
            : "") ?? ""
        ).toLowerCase();
  const params = {
    ...((n.parameters as Record<string, string> | undefined) ?? {}),
    ...((n.dispositionParameters as Record<string, string> | undefined) ?? {}),
  };
  const filename = String(params.filename ?? params.name ?? "").trim();
  const contentId = String(n.id ?? "")
    .replace(/[<>]/g, "")
    .trim();
  const size = Number(n.size ?? 0);
  if (children.length > 0 || type === "multipart") {
    return children.flatMap((child, i) =>
      flattenImapStructure(child, part ? `${part}.${i + 1}` : String(i + 1))
    );
  }
  return [
    {
      part,
      type,
      subtype,
      encoding: String(n.encoding ?? "").toLowerCase(),
      size: Number.isFinite(size) ? size : 0,
      disposition,
      filename,
      contentId,
    },
  ];
}

async function readableToBuffer(content: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return Buffer.from(content);
  if (
    content &&
    typeof content === "object" &&
    Symbol.asyncIterator in (content as object)
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of content as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.alloc(0);
}

async function downloadImapPartBuffer(
  client: ImapFlow,
  uid: number,
  part: string | undefined,
  timeoutMs: number,
  maxBytes = WEBMAIL_BODY_PART_MAX_BYTES
): Promise<Buffer> {
  const downloaded = await withTimeout(
    client.download(uid, part, {
      uid: true,
      maxBytes,
    } as { uid: boolean; maxBytes: number }),
    timeoutMs,
    `part ${part || "RFC822"} UID ${uid}`
  );
  return readableToBuffer(
    downloaded && typeof downloaded === "object"
      ? (downloaded as { content?: unknown }).content
      : downloaded
  );
}

async function parseLooseMimePart(
  buf: Buffer,
  mime: string,
  encoding?: string
): Promise<{ html: string; text: string }> {
  if (!buf.length) return { html: "", text: "" };
  const head = buf.subarray(0, 1_200).toString("latin1");
  const looksRfc =
    /^(From |Return-Path:|Received:|MIME-Version:|Content-Type:|Subject:|To:|Date:|Message-ID:)/im.test(
      head
    );
  const payload = looksRfc
    ? buf
    : Buffer.concat([
        Buffer.from(
          `MIME-Version: 1.0\r\nContent-Type: ${mime}; charset=utf-8\r\n${
            encoding ? `Content-Transfer-Encoding: ${encoding}\r\n` : ""
          }\r\n`
        ),
        buf,
      ]);
  try {
    const parsed = await simpleParser(
      payload as Parameters<typeof simpleParser>[0]
    );
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const text =
      parsed.text?.trim() || (html ? extractPlainFromHtml(html) : "");
    return { html, text };
  } catch {
    const raw = buf.toString("utf8");
    const html = /<[a-z][\s\S]*>/i.test(raw) ? raw : "";
    return { html, text: html ? extractPlainFromHtml(html) : raw };
  }
}

async function downloadPartialRfc822(
  client: ImapFlow,
  uid: number,
  timeoutMs: number
): Promise<{ bodyHtml: string; bodyText: string } | null> {
  try {
    const msg = await withTimeout(
      client.fetchOne(
        uid,
        { source: { start: 0, maxLength: WEBMAIL_BODY_PART_MAX_BYTES } },
        { uid: true }
      ),
      timeoutMs,
      `partial source UID ${uid}`
    );
    const source =
      msg && typeof msg === "object" && "source" in msg
        ? (msg as { source?: unknown }).source
        : null;
    const buf = await readableToBuffer(source);
    if (!buf.length) return null;
    const parsed = await parseLooseMimePart(buf, "text/plain");
    if (!parsed.html && !parsed.text) return null;
    return { bodyHtml: parsed.html, bodyText: parsed.text };
  } catch {
    try {
      const buf = await downloadImapPartBuffer(
        client,
        uid,
        undefined,
        timeoutMs,
        WEBMAIL_BODY_PART_MAX_BYTES
      );
      if (!buf.length) return null;
      const parsed = await parseLooseMimePart(buf, "message/rfc822");
      if (!parsed.html && !parsed.text) return null;
      return { bodyHtml: parsed.html, bodyText: parsed.text };
    } catch {
      return null;
    }
  }
}

async function downloadMessageByParts(
  client: ImapFlow,
  uid: number,
  options?: { skipAttachments?: boolean; timeoutMs?: number }
): Promise<{
  bodyHtml: string;
  bodyText: string;
  attachments: Attachment[];
} | null> {
  const timeoutMs = options?.timeoutMs ?? WEBMAIL_PART_TIMEOUT_MS;
  let structure: unknown = null;
  try {
    const meta = await withTimeout(
      client.fetchOne(uid, { bodyStructure: true }, { uid: true }),
      8_000,
      `structure UID ${uid}`
    );
    structure =
      meta && typeof meta === "object" && "bodyStructure" in meta
        ? (meta as { bodyStructure?: unknown }).bodyStructure
        : null;
  } catch {
    structure = null;
  }
  const parts = flattenImapStructure(structure);

  let bodyHtml = "";
  let bodyText = "";
  const attachments: Attachment[] = [];

  const textParts = parts
    .filter((p) => isImapTextBodyPart(p))
    .sort((a, b) => {
      const aPlain = splitImapMime(a.type, a.subtype).subtype === "plain" ? 0 : 1;
      const bPlain = splitImapMime(b.type, b.subtype).subtype === "plain" ? 0 : 1;
      if (aPlain !== bPlain) return aPlain - bPlain;
      return (a.size || 9e9) - (b.size || 9e9);
    });
  const otherParts = parts.filter((p) => !textParts.includes(p));

  const tryTextPart = async (p: {
    part: string;
    type: string;
    subtype: string;
    encoding?: string;
  }) => {
    const { subtype } = splitImapMime(p.type, p.subtype);
    const mime = `text/${subtype || "plain"}`;
    const buf = await downloadImapPartBuffer(
      client,
      uid,
      p.part || "1",
      timeoutMs,
      WEBMAIL_BODY_PART_MAX_BYTES
    );
    if (!buf.length) return;
    const parsed = await parseLooseMimePart(buf, mime, p.encoding);
    if (subtype === "html" || parsed.html) {
      if (parsed.html && !bodyHtml) bodyHtml = parsed.html;
      if (parsed.text && !bodyText) bodyText = parsed.text;
      return;
    }
    if (parsed.text && !bodyText) bodyText = parsed.text;
  };

  for (const p of textParts) {
    try {
      await tryTextPart(p);
      if (bodyHtml && bodyText) break;
    } catch {
      /* parte testo non disponibile */
    }
  }

  if (!bodyHtml && !bodyText) {
    for (const part of ["1", "1.1", "1.2", "2", "TEXT"]) {
      if (textParts.some((p) => p.part === part)) continue;
      try {
        await tryTextPart({
          part,
          type: "text",
          subtype: part === "1.2" || part === "2" ? "html" : "plain",
        });
        if (bodyHtml || bodyText) break;
      } catch {
        /* candidata assente */
      }
    }
  }

  if (!bodyHtml && !bodyText) {
    const partial = await downloadPartialRfc822(client, uid, timeoutMs);
    if (partial) {
      bodyHtml = partial.bodyHtml;
      bodyText = partial.bodyText;
    }
  }

  if (!options?.skipAttachments) {
    for (const p of otherParts) {
      if (p.size > WEBMAIL_PART_ATTACH_MAX) continue;
      try {
        const buf = await downloadImapPartBuffer(
          client,
          uid,
          p.part,
          timeoutMs,
          Math.min(WEBMAIL_PART_ATTACH_MAX, p.size || WEBMAIL_PART_ATTACH_MAX)
        );
        if (!buf.length || buf.length > WEBMAIL_PART_ATTACH_MAX) continue;
        const { type, subtype } = splitImapMime(p.type, p.subtype);
        const mime = `${type || "application"}/${subtype || "octet-stream"}`;
        attachments.push({
          filename: p.filename || `parte-${p.part}`,
          contentType: mime,
          content: buf,
          contentId: p.contentId || undefined,
          cid: p.contentId || undefined,
          contentDisposition: p.disposition || "attachment",
        } as Attachment);
      } catch {
        /* allegato singolo saltato */
      }
    }
  }

  if (!bodyText && bodyHtml) bodyText = extractPlainFromHtml(bodyHtml);
  if (!bodyHtml && !bodyText && attachments.length === 0) return null;
  return {
    bodyHtml: bodyHtml.slice(0, 200_000),
    bodyText: bodyText.slice(0, 500_000),
    attachments,
  };
}

async function insertPartialImport(
  supabase: Service,
  account: AccountRow,
  input: {
    uidStr: string;
    folder: string;
    asSent: boolean;
    asSpam: boolean;
    subject: string;
    fromAddr: string;
    fromName: string;
    toAddresses: string[];
    sentAt: string;
    reason: string;
  }
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .insert({
      account_id: account.id,
      direction: input.asSent ? "outbound" : "inbound",
      message_uid: input.uidStr,
      folder: input.folder,
      spam_at: input.asSpam ? nowIso : null,
      from_address: input.fromAddr || account.email_address,
      from_name: input.fromName,
      to_addresses: input.toAddresses,
      cc_addresses: [],
      subject: input.subject || "(import parziale)",
      body_text: `${WEBMAIL_IMPORT_PARZIALE_PREFIX} ${input.reason}`,
      body_html: "",
      received_at: input.sentAt,
      sent_at: input.sentAt,
      is_seen: Boolean(input.asSent),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[webmail sync stub]", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

async function importInboxUidList(
  supabase: Service,
  account: AccountRow,
  client: ImapFlow,
  list: string[],
  blacklist: Set<string>,
  options?: {
    folder?: string;
    asSpam?: boolean;
    asSent?: boolean;
    timeBudgetMs?: number;
    startedAt?: number;
  }
): Promise<{ imported: number; importedIds: string[]; remaining: number }> {
  let imported = 0;
  const importedIds: string[] = [];
  const startedAt = options?.startedAt ?? Date.now();
  const budgetMs = options?.timeBudgetMs ?? WEBMAIL_SYNC_TIME_BUDGET_MS;
  let processed = 0;

  for (const uidStr of list) {
    if (Date.now() - startedAt > budgetMs) break;
    const uid = Number(uidStr);
    let downloaded: { content?: unknown } | undefined;
    let partsHit: Awaited<ReturnType<typeof downloadMessageByParts>> = null;
    let envelopeSubject = "";
    let envelopeFrom = "";
    let envelopeFromName = "";
    let envelopeTo: string[] = [];
    let envelopeDate = new Date().toISOString();
    try {
      let size = 0;
      try {
        const meta = await withTimeout(
          client.fetchOne(
            uid,
            { envelope: true, size: true },
            { uid: true }
          ),
          4_000,
          `meta UID ${uidStr}`
        );
        size = Number(
          meta && typeof meta === "object" && "size" in meta
            ? (meta as { size?: number }).size ?? 0
            : 0
        );
        const env =
          meta && typeof meta === "object" && "envelope" in meta
            ? (
                meta as {
                  envelope?: {
                    subject?: string;
                    date?: Date | string;
                    from?: { address?: string; name?: string }[];
                    to?: { address?: string }[];
                  };
                }
              ).envelope
            : undefined;
        envelopeSubject = String(env?.subject ?? "").trim();
        envelopeFrom = String(env?.from?.[0]?.address ?? "").trim();
        envelopeFromName = String(env?.from?.[0]?.name ?? "").trim();
        envelopeTo = (env?.to ?? [])
          .map((v) => String(v.address ?? "").trim())
          .filter(Boolean);
        if (env?.date) {
          const d = new Date(env.date);
          if (Number.isFinite(d.getTime())) envelopeDate = d.toISOString();
        }
      } catch {
        /* meta non disponibile: si tenta il download */
      }

      if (size > WEBMAIL_IMPORT_MAX_BYTES) {
        const remaining = budgetMs - (Date.now() - startedAt);
        let byParts: Awaited<ReturnType<typeof downloadMessageByParts>> = null;
        try {
          byParts = await downloadMessageByParts(client, uid, {
            skipAttachments: remaining < 12_000,
            timeoutMs: Math.min(
              WEBMAIL_PART_TIMEOUT_MS,
              Math.max(6_000, remaining - 400)
            ),
          });
        } catch (partErr) {
          console.error(
            "[webmail sync parts]",
            uidStr,
            partErr instanceof Error ? partErr.message : partErr
          );
        }
        if (byParts && (byParts.bodyText || byParts.bodyHtml)) {
          partsHit = byParts;
        } else {
          const stubId = await insertPartialImport(supabase, account, {
            uidStr,
            folder: options?.folder || "INBOX",
            asSent: Boolean(options?.asSent),
            asSpam: Boolean(options?.asSpam),
            subject: envelopeSubject,
            fromAddr: envelopeFrom,
            fromName: envelopeFromName,
            toAddresses: envelopeTo,
            sentAt: envelopeDate,
            reason: `messaggio da ${Math.round(size / 1024)} KB non scaricato per intero (limite sync).`,
          });
          if (stubId) {
            imported += 1;
            importedIds.push(stubId);
          }
          processed += 1;
          continue;
        }
      } else {
        downloaded = await withTimeout(
          client.download(uid, undefined, { uid: true }),
          WEBMAIL_DOWNLOAD_TIMEOUT_MS,
          `download UID ${uidStr}`
        );
      }
    } catch (dlErr) {
      console.error(
        "[webmail sync download]",
        uidStr,
        dlErr instanceof Error ? dlErr.message : dlErr
      );
      if (isAbortiveImapError(dlErr)) break;
      processed += 1;
      continue;
    }

    try {
    let fromAddr = envelopeFrom;
    let fromName = envelopeFromName;
    let toAddresses = envelopeTo;
    let ccAddresses: string[] = [];
    let subject = envelopeSubject || "(senza oggetto)";
    let bodyText = "";
    let bodyHtml = "";
    let receivedAt = envelopeDate;
    let messageIdHeader = "";
    let parsedAttachments: Attachment[] | undefined;

    if (partsHit) {
      bodyText = partsHit.bodyText;
      bodyHtml = partsHit.bodyHtml;
      parsedAttachments = partsHit.attachments;
    } else {
    const parsed = await withTimeout(
      simpleParser(downloaded?.content as Parameters<typeof simpleParser>[0]),
      WEBMAIL_DOWNLOAD_TIMEOUT_MS,
      `parse UID ${uidStr}`
    );
    const fromObj = Array.isArray(parsed.from)
      ? parsed.from[0]
      : parsed.from;
    const toObj = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
    fromAddr =
      fromObj?.value?.[0]?.address?.trim() || fromObj?.text || envelopeFrom;
    fromName = fromObj?.value?.[0]?.name?.trim() || envelopeFromName;
    toAddresses = (toObj?.value ?? [])
      .map((v: { address?: string }) => v.address || "")
      .filter(Boolean);
    if (!toAddresses.length) toAddresses = envelopeTo;
    const ccObj = Array.isArray(parsed.cc) ? parsed.cc[0] : parsed.cc;
    ccAddresses = (ccObj?.value ?? [])
      .map((v: { address?: string }) => v.address || "")
      .filter(Boolean);
    subject = parsed.subject?.trim() || envelopeSubject || "(senza oggetto)";
    bodyText = (
      parsed.text?.trim() ||
      (parsed.html ? extractPlainFromHtml(String(parsed.html)) : "")
    ).slice(0, 500_000);
    const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
    bodyHtml = rawHtml.length > 200_000 ? rawHtml.slice(0, 200_000) : rawHtml;
    receivedAt = parsed.date?.toISOString() || envelopeDate;
    messageIdHeader =
      typeof parsed.messageId === "string" ? parsed.messageId.trim() : "";
    parsedAttachments = parsed.attachments;
    }
    const fromNorm = normalizeBlacklistEmail(fromAddr);
    if (!options?.asSent && fromNorm && blacklist.has(fromNorm)) {
      processed += 1;
      continue;
    }

    const anagrafica = options?.asSent
      ? await matchWebmailAnagraficaRecipients(
          supabase,
          [...toAddresses, ...ccAddresses],
          account.email_address
        )
      : await matchWebmailAnagrafica(supabase, fromAddr);
    const learned = options?.asSent
      ? {
          categoriaId: null as string | null,
          categoriaSuggestId: null as string | null,
          categoriaSuggestMode: null as
            | "suggest"
            | "auto_notify"
            | "auto_silent"
            | null,
          categoriaAutoPending: false,
          categoriaAutoAppliedAt: null as string | null,
          categoriaAutoNotified: false,
          info: "",
        }
      : await applyLearningOnImport(supabase, {
          accountId: account.id,
          fromAddress: fromAddr,
        });

    if (options?.asSent) {
      if (
        await sentAlreadyImported(supabase, account.id, {
          messageId: messageIdHeader,
          subject,
          toAddresses,
          sentAt: receivedAt,
        })
      ) {
        processed += 1;
        continue;
      }
    } else if (options?.asSpam) {
      if (
        await markExistingSpamByMessageId(
          supabase,
          account.id,
          messageIdHeader
        )
      ) {
        processed += 1;
        continue;
      }
    } else if (
      await messageIdAlreadyImported(supabase, account.id, messageIdHeader)
    ) {
      processed += 1;
      continue;
    }

    const storeFolder = options?.folder || "INBOX";
    const nowIso = new Date().toISOString();

    const { data: inserted, error } = await supabase
      .from("webmail_messaggi")
      .insert({
        account_id: account.id,
        direction: options?.asSent ? "outbound" : "inbound",
        message_uid: uidStr,
        message_id_header: messageIdHeader || null,
        folder: storeFolder,
        spam_at: options?.asSpam ? nowIso : null,
        from_address: fromAddr || account.email_address,
        from_name: fromName,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        received_at: receivedAt,
        sent_at: receivedAt,
        is_seen: Boolean(options?.asSent),
        categoria_id: learned.categoriaId,
        categoria_suggest_id: learned.categoriaId
          ? null
          : learned.categoriaSuggestId,
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
      processed += 1;
      continue;
    }
    imported += 1;
    importedIds.push(String(inserted.id));

    let attSaved = 0;
    try {
      const attRes = await persistMessaggioAttachments({
        supabase,
        messaggioId: String(inserted.id),
        accountId: account.id,
        attachments: parsedAttachments,
      });
      attSaved = attRes.saved;
      if (attRes.errors.length) {
        console.error(
          "[webmail sync allegati]",
          inserted.id,
          attRes.errors.slice(0, 3).join("; ")
        );
      }
    } catch (attErr) {
      console.error(
        "[webmail sync allegati]",
        inserted.id,
        attErr instanceof Error ? attErr.message : attErr
      );
    }

    await logElaborazione(supabase, {
      messaggioId: inserted.id,
      accountId: account.id,
      action: "imported",
      aiGenerated: false,
      summary: options?.asSent
        ? "Import SENT"
        : learned.info
          ? `Import INBOX + ${learned.info}`
          : "Import INBOX (senza bozza AI automatica)",
      payload: {
        learnedMode: learned.categoriaSuggestMode,
        categoriaId: learned.categoriaId,
        allegati: attSaved,
      },
    });
    processed += 1;
    } catch (parseErr) {
      console.error(
        "[webmail sync parse/insert]",
        uidStr,
        parseErr instanceof Error ? parseErr.message : parseErr
      );
      if (isAbortiveImapError(parseErr)) break;
      processed += 1;
    }
  }

  return {
    imported,
    importedIds,
    remaining: Math.max(0, list.length - processed),
  };
}

export const IMAP_SPAM_CANDIDATES = [
  "Junk",
  "Spam",
  "INBOX.Spam",
  "INBOX/Spam",
  "INBOX.Junk",
  "INBOX/Junk",
  "[Gmail]/Spam",
  "Bulk Mail",
  "Junk E-mail",
];

function mailboxPath(box: {
  path?: string;
  pathAsListed?: string;
  name?: string;
}): string {
  return String(box.path ?? box.pathAsListed ?? box.name ?? "").trim();
}

function mailboxFlags(
  box: { flags?: Iterable<string> | string[] | Set<string> }
): string[] {
  const raw = box.flags;
  if (!raw) return [];
  if (raw instanceof Set) return [...raw].map((f) => String(f).toLowerCase());
  if (Array.isArray(raw)) return raw.map((f) => String(f).toLowerCase());
  try {
    return [...(raw as Iterable<string>)].map((f) => String(f).toLowerCase());
  } catch {
    return [];
  }
}

function isSelectableListedMailbox(box: {
  path?: string;
  pathAsListed?: string;
  name?: string;
  flags?: Iterable<string> | string[] | Set<string>;
}): boolean {
  if (!mailboxPath(box)) return false;
  const flags = mailboxFlags(box);
  return !flags.some(
    (f) => f.includes("noselect") || f.includes("nonexistent")
  );
}

function mailboxLeafName(path: string): string {
  const parts = path.split(/[/\\[\].]+/).filter(Boolean);
  return (parts[parts.length - 1] ?? path).trim();
}

type ListedImapBox = {
  path?: string;
  pathAsListed?: string;
  name?: string;
  flags?: Iterable<string> | string[] | Set<string>;
  specialUse?: string | null;
};

const listedMailboxesCache = new WeakMap<ImapFlow, Promise<ListedImapBox[]>>();

async function listSelectableMailboxes(
  client: ImapFlow
): Promise<ListedImapBox[]> {
  const cached = listedMailboxesCache.get(client);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const boxes = await client.list();
      return (boxes ?? []).filter(isSelectableListedMailbox);
    } catch (error) {
      console.error("[webmail imap list]", error);
      return [];
    }
  })();
  listedMailboxesCache.set(client, pending);
  return pending;
}

function pickListedMailbox(
  boxes: ListedImapBox[],
  specialUse: string,
  leafExact: RegExp,
  leafLoose: RegExp
): string | null {
  const special = boxes.find(
    (box) => String(box.specialUse ?? "").toLowerCase() === specialUse
  );
  if (special) return mailboxPath(special);

  const exact = boxes.find((box) =>
    leafExact.test(mailboxLeafName(mailboxPath(box)))
  );
  if (exact) return mailboxPath(exact);

  const loose = boxes.find((box) =>
    leafLoose.test(mailboxLeafName(mailboxPath(box)))
  );
  return loose ? mailboxPath(loose) : null;
}

async function resolveImapSpamMailbox(
  client: ImapFlow
): Promise<string | null> {
  const boxes = await listSelectableMailboxes(client);
  return pickListedMailbox(
    boxes,
    "\\junk",
    /^(spam|junk|junk e-mail|bulk mail)$/i,
    /^(spam|junk)$/i
  );
}

async function importSpamMailbox(
  supabase: Service,
  account: AccountRow,
  client: ImapFlow,
  blacklist: Set<string>,
  options: {
    batchLimit: number;
    mode: WebmailSyncMode;
    newMailOnly: boolean;
  }
): Promise<{
  imported: number;
  importedIds: string[];
  skipped: number;
  pending: number;
}> {
  const empty = {
    imported: 0,
    importedIds: [] as string[],
    skipped: 0,
    pending: 0,
  };
  try {
    const spamBox = await resolveImapSpamMailbox(client);
    if (!spamBox) return empty;

    const lock = await client.getMailboxLock(spamBox);
    try {
      const since = resolveWebmailSyncSince(account.sync_since);
      const uids = await client.search({ since }, { uid: true });
      const all = (uids || []).map((u) => String(u));
      const existingSet = await loadExistingUids(
        supabase,
        account.id,
        all,
        "JUNK"
      );
      let missing = all.filter((uid) => !existingSet.has(uid));
      if (options.newMailOnly) {
        const maxUid = await loadMaxFolderUid(supabase, account.id, "JUNK");
        missing = missing.filter((uid) => {
          const n = Number(uid);
          return Number.isFinite(n) && n > maxUid;
        });
      }
      const picked = pickMissingBatch(
        missing,
        existingSet,
        options.mode,
        options.batchLimit
      );
      const importedRes = await importInboxUidList(
        supabase,
        account,
        client,
        picked.list,
        blacklist,
        { folder: "JUNK", asSpam: true }
      );
      return {
        imported: importedRes.imported,
        importedIds: importedRes.importedIds,
        skipped: all.length - missing.length,
        pending: picked.pending + importedRes.remaining,
      };
    } finally {
      try {
        lock.release();
      } catch {
        /* sessione IMAP già chiusa */
      }
    }
  } catch (error) {
    console.error("[webmail import spam]", account.email_address, error);
    return empty;
  }
}

export const IMAP_SENT_CANDIDATES = [
  "Sent",
  "Sent Mail",
  "Sent Items",
  "Sent Messages",
  "INBOX.Sent",
  "INBOX/Sent",
  "[Gmail]/Sent Mail",
  "Posta inviata",
  "Posta Inviata",
  "Elementi inviati",
  "Inviata",
  "Inviate",
  "Inviati",
];

async function resolveImapSentMailbox(
  client: ImapFlow
): Promise<string | null> {
  const boxes = await listSelectableMailboxes(client);
  return pickListedMailbox(
    boxes,
    "\\sent",
    /^(sent|sent items|sent mail|sent messages|posta inviata|elementi inviati|inviata|inviate|inviati)$/i,
    /^(sent|inviata|inviate|inviati)$/i
  );
}

/** Cartella logica gestionale (INBOX/SENT/JUNK) → mailbox IMAP reale. */
export async function resolveImapBoxForStoredFolder(
  client: ImapFlow,
  stored: string
): Promise<string> {
  const f = String(stored || "INBOX").trim();
  const upper = f.toUpperCase();
  if (!f || upper === "INBOX") return "INBOX";
  if (upper === WEBMAIL_SENT_FOLDER || upper === "SENT") {
    return (await resolveImapSentMailbox(client)) || "Sent";
  }
  if (upper === "JUNK" || upper === "SPAM") {
    return (await resolveImapSpamMailbox(client)) || "Junk";
  }
  return f;
}

function isSentLikeMailboxPath(path: string): boolean {
  return /(sent|posta inviata|elementi inviati|inviata|inviate|inviati)/i.test(
    path
  );
}

const lastMailboxByClient = new WeakMap<ImapFlow, string>();

async function acquireMailboxForUid(
  client: ImapFlow,
  stored: string,
  uid: number
): Promise<{ lock: { release: () => void }; box: string }> {
  const primary = await resolveImapBoxForStoredFolder(client, stored);
  const storedUpper = String(stored || "").trim().toUpperCase();
  const listed = await listSelectableMailboxes(client);
  const extras =
    storedUpper === WEBMAIL_SENT_FOLDER || storedUpper === "SENT"
      ? listed.map(mailboxPath).filter(isSentLikeMailboxPath)
      : storedUpper === "JUNK" || storedUpper === "SPAM"
        ? IMAP_SPAM_CANDIDATES
        : [];
  const lastOk = lastMailboxByClient.get(client);
  const boxes = [
    ...new Set(
      [lastOk, primary, ...extras, stored].filter((b): b is string =>
        Boolean(b)
      )
    ),
  ];
  let lastErr: unknown = new Error(
    `UID ${uid} non trovato nelle cartelle IMAP.`
  );
  for (const box of boxes) {
    let lock: { release: () => void } | undefined;
    try {
      lock = await client.getMailboxLock(box);
    } catch (e) {
      lastErr = e;
      continue;
    }
    try {
      const hit = await withTimeout(
        client.fetchOne(uid, { uid: true, flags: true }, { uid: true }),
        8_000,
        `uid ${uid} in ${box}`
      );
      if (hit) {
        lastMailboxByClient.set(client, box);
        return { lock, box };
      }
      try {
        lock.release();
      } catch {
        /* ignore */
      }
    } catch (e) {
      lastErr = e;
      try {
        lock.release();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr;
}

async function countMailboxMissing(
  supabase: Service,
  account: AccountRow,
  client: ImapFlow,
  imapBox: string,
  storeFolder: string
): Promise<{
  missing: number;
  importedInScope: number;
  olderAvailable: number;
}> {
  const lock = await client.getMailboxLock(imapBox);
  try {
    const since = resolveWebmailSyncSince(account.sync_since);
    const uids = await client.search({ since }, { uid: true });
    const all = (uids || []).map((u) => String(u));
    const existingSet = await loadExistingUids(
      supabase,
      account.id,
      all,
      storeFolder
    );
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
    try {
      lock.release();
    } catch {
      /* sessione IMAP già chiusa */
    }
  }
}

async function importSentMailbox(
  supabase: Service,
  account: AccountRow,
  client: ImapFlow,
  blacklist: Set<string>,
  options: {
    batchLimit: number;
    mode: WebmailSyncMode;
    newMailOnly: boolean;
    timeBudgetMs?: number;
    startedAt?: number;
  }
): Promise<{
  imported: number;
  importedIds: string[];
  skipped: number;
  pending: number;
}> {
  const empty = {
    imported: 0,
    importedIds: [] as string[],
    skipped: 0,
    pending: 0,
  };
  try {
    const sentBox = await resolveImapSentMailbox(client);
    if (!sentBox) return empty;

    const lock = await client.getMailboxLock(sentBox);
    try {
      const since = resolveWebmailSyncSince(account.sync_since);
      const uids = await client.search({ since }, { uid: true });
      const all = (uids || []).map((u) => String(u));
      const existingSet = await loadExistingUids(
        supabase,
        account.id,
        all,
        WEBMAIL_SENT_FOLDER
      );
      let missing = all.filter((uid) => !existingSet.has(uid));
      if (options.newMailOnly) {
        const maxUid = await loadMaxFolderUid(
          supabase,
          account.id,
          WEBMAIL_SENT_FOLDER
        );
        missing = missing.filter((uid) => {
          const n = Number(uid);
          return Number.isFinite(n) && n > maxUid;
        });
      }
      const picked = pickMissingBatch(
        missing,
        existingSet,
        options.mode,
        Math.min(options.batchLimit, WEBMAIL_SYNC_SENT_BATCH)
      );
      const importedRes = await importInboxUidList(
        supabase,
        account,
        client,
        picked.list,
        blacklist,
        {
          folder: WEBMAIL_SENT_FOLDER,
          asSent: true,
          timeBudgetMs: options.timeBudgetMs,
          startedAt: options.startedAt,
        }
      );
      return {
        imported: importedRes.imported,
        importedIds: importedRes.importedIds,
        skipped: all.length - missing.length,
        pending: picked.pending + importedRes.remaining,
      };
    } finally {
      try {
        lock.release();
      } catch {
        /* sessione IMAP già chiusa */
      }
    }
  } catch (error) {
    console.error("[webmail import sent]", account.email_address, error);
    return empty;
  }
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
    folders?: WebmailSyncFolders;
  }
): Promise<SyncWebmailResult> {
  const limit = options?.limit ?? WEBMAIL_SYNC_SAFE_BATCH;
  const batchLimit = Math.min(
    WEBMAIL_SYNC_SAFE_BATCH,
    Math.max(1, Number.isFinite(limit) ? limit : WEBMAIL_SYNC_SAFE_BATCH)
  );
  const mode: WebmailSyncMode = options?.mode === "older" ? "older" : "recent";
  const newMailOnly = Boolean(options?.newMailOnly);
  const folders = resolveWebmailSyncFolders(options?.folders);

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
    socketTimeout: 20_000,
    greetingTimeout: 15_000,
  });

  try {
    await client.connect();
    const since = resolveWebmailSyncSince(account.sync_since);
    const blacklist = await loadAccountBlacklist(supabase, account.id);
    const startedAt = Date.now();
    let all: string[] = [];
    let pending = 0;

    if (folders.inbox) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ since }, { uid: true });
        all = (uids || []).map((u) => String(u));

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
        pending = picked.pending;

        const importedRes = await importInboxUidList(
          supabase,
          account,
          client,
          list,
          blacklist,
          { timeBudgetMs: WEBMAIL_SYNC_TIME_BUDGET_MS, startedAt }
        );
        imported = importedRes.imported;
        importedIds.push(...importedRes.importedIds);
        pending += importedRes.remaining;
      } finally {
        try {
          lock.release();
        } catch {
          /* sessione IMAP già chiusa */
        }
      }
    }

    const spamRes = folders.junk
      ? await importSpamMailbox(supabase, account, client, blacklist, {
          batchLimit,
          mode,
          newMailOnly,
        })
      : {
          imported: 0,
          importedIds: [] as string[],
          skipped: 0,
          pending: 0,
        };
    imported += spamRes.imported;
    importedIds.push(...spamRes.importedIds);
    skipped += spamRes.skipped;
    pending += spamRes.pending;

    const sentRes = folders.sent
      ? await importSentMailbox(supabase, account, client, blacklist, {
          batchLimit: WEBMAIL_SYNC_SENT_BATCH,
          mode,
          newMailOnly,
          timeBudgetMs: WEBMAIL_SYNC_TIME_BUDGET_MS,
          startedAt,
        })
      : {
          imported: 0,
          importedIds: [] as string[],
          skipped: 0,
          pending: 0,
        };
    imported += sentRes.imported;
    importedIds.push(...sentRes.importedIds);
    skipped += sentRes.skipped;
    pending += sentRes.pending;

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
      summary: `Sync INBOX+Spam+Sent: ${imported} nuovi (dal ${since.toISOString().slice(0, 10)})`,
      payload: {
        imported,
        drafted,
        skipped,
        pending,
        since: since.toISOString().slice(0, 10),
        totalMatched: all.length,
        spamImported: spamRes.imported,
        sentImported: sentRes.imported,
      },
    });

    return {
      imported,
      drafted,
      skipped,
      pending,
      importedIds,
    };
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
    const inbox = await countMailboxMissing(
      supabase,
      account,
      client,
      "INBOX",
      "INBOX"
    );
    const emptySent = {
      missing: 0,
      importedInScope: 0,
      olderAvailable: 0,
    };
    let sent = emptySent;
    let sentUnavailable = true;
    try {
      const sentBox = await resolveImapSentMailbox(client);
      if (sentBox) {
        sent = await countMailboxMissing(
          supabase,
          account,
          client,
          sentBox,
          WEBMAIL_SENT_FOLDER
        );
        sentUnavailable = false;
      }
    } catch (error) {
      console.error("[webmail preview sent]", account.email_address, error);
      sent = emptySent;
      sentUnavailable = true;
    }
    return {
      missing: inbox.missing + sent.missing,
      inboxMissing: inbox.missing,
      sentMissing: sent.missing,
      sentUnavailable,
      importedInScope: inbox.importedInScope + sent.importedInScope,
      olderAvailable: inbox.olderAvailable,
      sentOlderAvailable: sent.olderAvailable,
    };
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
      inboxMissing: res.inboxMissing,
      sentMissing: res.sentMissing,
      sentUnavailable: res.sentUnavailable,
      importedInScope: res.importedInScope,
      olderAvailable: res.olderAvailable,
      sentOlderAvailable: res.sentOlderAvailable,
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
 * Best effort: sposta un UID verso una delle cartelle candidate (Spam / INBOX).
 */
export async function moveImapMessageBestEffort(input: {
  account: AccountRow;
  folder: string;
  messageUid: string;
  targets: string[];
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
      for (const dest of input.targets) {
        try {
          const moved = await client.messageMove(String(uidNum), dest, {
            uid: true,
          });
          if (moved) {
            return { ok: true, detail: `Spostata in ${dest}` };
          }
        } catch {
          // prova cartella successiva
        }
      }
      return { ok: false, detail: "Nessuna cartella IMAP di destinazione." };
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

/**
 * Best effort: allinea \\Seen sulla casella allo stato del gestionale.
 * Lo stato gestionale non viene mai letto da IMAP.
 */
export async function setImapSeenManyBestEffort(input: {
  items: Array<{
    account: AccountRow;
    folder: string;
    messageUid: string;
  }>;
  seen: boolean;
}): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const byAccount = new Map<string, { account: AccountRow; items: typeof input.items }>();
  for (const item of input.items) {
    const uidNum = Number(item.messageUid);
    if (!Number.isFinite(uidNum) || uidNum <= 0 || !item.account?.id) {
      failed += 1;
      continue;
    }
    const cur = byAccount.get(item.account.id) ?? {
      account: item.account,
      items: [],
    };
    cur.items.push(item);
    byAccount.set(item.account.id, cur);
  }

  for (const { account, items } of byAccount.values()) {
    let password: string;
    try {
      password = decryptWebmailSecret(account.password_encrypted);
    } catch {
      failed += items.length;
      continue;
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
      const byFolder = new Map<string, string[]>();
      for (const item of items) {
        const folder = item.folder || "INBOX";
        const list = byFolder.get(folder) ?? [];
        list.push(item.messageUid);
        byFolder.set(folder, list);
      }
      for (const [folder, uids] of byFolder) {
        try {
          const lock = await client.getMailboxLock(folder);
          try {
            const range = uids.join(",");
            if (input.seen) {
              await client.messageFlagsAdd(range, ["\\Seen"], { uid: true });
            } else {
              await client.messageFlagsRemove(range, ["\\Seen"], { uid: true });
            }
            ok += uids.length;
          } finally {
            lock.release();
          }
        } catch {
          failed += uids.length;
        }
      }
    } catch {
      failed += items.length;
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    }
  }

  return { ok, failed };
}

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
    folders?: WebmailSyncFolders;
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

const TIMELINE_IMAP_BUDGET_MS = 20_000;
const TIMELINE_IMAP_MAX_UIDS = 28;
const TIMELINE_IMAP_MAX_EMAILS = 12;

type TimelineImapSearch = {
  from?: string;
  to?: string;
  or?: TimelineImapSearch[];
};

function nestImapOr(parts: TimelineImapSearch[]): TimelineImapSearch | null {
  if (parts.length === 0) return null;
  return parts.reduce((acc, cur) => ({ or: [acc, cur] }));
}

function newestImapUids(uids: string[], max: number): string[] {
  return [...uids]
    .filter((u) => Number.isFinite(Number(u)) && Number(u) > 0)
    .sort((a, b) => Number(a) - Number(b))
    .slice(-max);
}

async function searchImapUidsByEmails(
  client: ImapFlow,
  emails: string[]
): Promise<string[]> {
  const parts: TimelineImapSearch[] = [];
  for (const email of emails) {
    parts.push({ from: email }, { to: email });
  }
  const combined = nestImapOr(parts);
  if (combined) {
    try {
      const uids = await client.search(
        combined as Parameters<ImapFlow["search"]>[0],
        { uid: true }
      );
      return newestImapUids((uids || []).map(String), TIMELINE_IMAP_MAX_UIDS);
    } catch {
      /* alcuni provider non accettano OR annidato */
    }
  }
  const found = new Set<string>();
  for (const email of emails) {
    for (const crit of [{ from: email }, { to: email }] as const) {
      try {
        const uids = await client.search({ ...crit }, { uid: true });
        for (const u of uids || []) found.add(String(u));
      } catch {
        /* criterio non supportato */
      }
    }
  }
  return newestImapUids([...found], TIMELINE_IMAP_MAX_UIDS);
}

/**
 * Cerca in INBOX e Posta inviata i messaggi da/verso gli indirizzi anagrafica
 * e li importa (senza limite sync_since). Usato da «Forza nuova sincronizzazione».
 */
export async function importImapMessagesByEmails(
  supabase: Service,
  accounts: AccountRow[],
  emails: string[],
  options?: { timeBudgetMs?: number }
): Promise<{
  imported: number;
  importedIds: string[];
  accountsTried: number;
  errors: string[];
}> {
  const unique = [
    ...new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ].slice(0, TIMELINE_IMAP_MAX_EMAILS);
  const empty = {
    imported: 0,
    importedIds: [] as string[],
    accountsTried: 0,
    errors: [] as string[],
  };
  if (unique.length === 0 || accounts.length === 0) return empty;

  const budgetMs = options?.timeBudgetMs ?? TIMELINE_IMAP_BUDGET_MS;
  const startedAt = Date.now();
  let imported = 0;
  const importedIds: string[] = [];
  const errors: string[] = [];
  let accountsTried = 0;

  for (const account of accounts) {
    if (Date.now() - startedAt > budgetMs) break;
    accountsTried += 1;
    let password: string;
    try {
      password = decryptWebmailSecret(account.password_encrypted);
    } catch (e) {
      errors.push(
        `${account.email_address}: ${
          e instanceof Error ? e.message : "password non decifrabile"
        }`
      );
      continue;
    }

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      auth: { user: account.username, pass: password },
      logger: false,
      socketTimeout: 18_000,
      greetingTimeout: 12_000,
    });

    try {
      await client.connect();
      const blacklist = await loadAccountBlacklist(supabase, account.id);
      const remaining = () => Math.max(1_500, budgetMs - (Date.now() - startedAt));

      const inboxLock = await client.getMailboxLock("INBOX");
      try {
        const inboxUids = await searchImapUidsByEmails(client, unique);
        const existingInbox = await loadExistingUids(
          supabase,
          account.id,
          inboxUids,
          "INBOX"
        );
        const missingInbox = inboxUids.filter((u) => !existingInbox.has(u));
        if (missingInbox.length > 0) {
          const res = await importInboxUidList(
            supabase,
            account,
            client,
            missingInbox,
            blacklist,
            { folder: "INBOX", timeBudgetMs: remaining(), startedAt }
          );
          imported += res.imported;
          importedIds.push(...res.importedIds);
        }
      } finally {
        try {
          inboxLock.release();
        } catch {
          /* sessione IMAP già chiusa */
        }
      }

      if (Date.now() - startedAt > budgetMs) {
        continue;
      }

      const sentBox = await resolveImapSentMailbox(client);
      if (sentBox) {
        const sentLock = await client.getMailboxLock(sentBox);
        try {
          const sentUids = await searchImapUidsByEmails(client, unique);
          const existingSent = await loadExistingUids(
            supabase,
            account.id,
            sentUids,
            WEBMAIL_SENT_FOLDER
          );
          const missingSent = sentUids.filter((u) => !existingSent.has(u));
          if (missingSent.length > 0) {
            const res = await importInboxUidList(
              supabase,
              account,
              client,
              missingSent,
              blacklist,
              {
                folder: WEBMAIL_SENT_FOLDER,
                asSent: true,
                timeBudgetMs: remaining(),
                startedAt,
              }
            );
            imported += res.imported;
            importedIds.push(...res.importedIds);
          }
        } finally {
          try {
            sentLock.release();
          } catch {
            /* sessione IMAP già chiusa */
          }
        }
      }
    } catch (e) {
      errors.push(
        `${account.email_address}: ${formatImapSyncError(e, account)}`
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  }

  return { imported, importedIds, accountsTried, errors };
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
}): Promise<{ messageId: string | null }> {
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
  const info = await transporter.sendMail({
    from: input.account.email_address,
    to: input.to,
    cc: input.cc || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text.replace(/\n/g, "<br/>"),
    attachments: input.attachments,
  });
  const messageId =
    typeof info.messageId === "string" ? info.messageId.trim() : "";
  return { messageId: messageId || null };
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
  /** Prima riparazione: solo testo/HTML, senza allegati pesanti. */
  skipAttachments?: boolean;
  /** Sessione IMAP già aperta (ripara a lotti senza riconnettere). */
  client?: ImapFlow;
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

  const ownClient = !input.client;
  let client = input.client;
  if (!client) {
    const password = decryptWebmailSecret(input.account.password_encrypted);
    client = new ImapFlow({
      host: input.account.imap_host,
      port: input.account.imap_port,
      secure: input.account.imap_secure,
      auth: { user: input.account.username, pass: password },
      logger: false,
    });
  }

  try {
    if (ownClient) await client.connect();
    const storedFolder = input.folder || "INBOX";
    const { lock } = await acquireMailboxForUid(
      client,
      storedFolder,
      uidNum
    );
    try {
      let size = 0;
      try {
        const meta = await withTimeout(
          client.fetchOne(uidNum, { size: true }, { uid: true }),
          6_000,
          `reload size UID ${input.messageUid}`
        );
        size = Number(
          meta && typeof meta === "object" && "size" in meta
            ? (meta as { size?: number }).size ?? 0
            : 0
        );
      } catch {
        /* si prova comunque */
      }

      let bodyHtml = "";
      let bodyText = "";
      let attachments: Attachment[] | undefined;

      const preferParts =
        input.skipAttachments || size > WEBMAIL_IMPORT_MAX_BYTES || size === 0;
      if (preferParts) {
        const byParts = await downloadMessageByParts(client, uidNum, {
          skipAttachments: Boolean(input.skipAttachments),
          timeoutMs: WEBMAIL_PART_TIMEOUT_MS,
        });
        if (byParts) {
          bodyHtml = byParts.bodyHtml;
          bodyText = byParts.bodyText;
          attachments = byParts.attachments;
        }
      }

      if (!bodyHtml && !bodyText && !input.skipAttachments) {
        const downloaded = await withTimeout(
          client.download(uidNum, undefined, { uid: true }),
          preferParts ? 25_000 : WEBMAIL_DOWNLOAD_TIMEOUT_MS,
          `reload UID ${input.messageUid}`
        );
        const parsed = await simpleParser(downloaded.content);
        const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
        bodyHtml =
          rawHtml.length > 200_000 ? rawHtml.slice(0, 200_000) : rawHtml;
        bodyText = (
          parsed.text?.trim() ||
          (rawHtml ? extractPlainFromHtml(rawHtml) : "")
        ).slice(0, 500_000);
        attachments = parsed.attachments;
      }

      if (!bodyHtml && !bodyText) {
        const partial = await downloadPartialRfc822(
          client,
          uidNum,
          WEBMAIL_PART_TIMEOUT_MS
        );
        if (partial) {
          bodyHtml = partial.bodyHtml;
          bodyText = partial.bodyText;
        }
      }

      if (!bodyHtml && !bodyText) {
        return {
          success: false,
          error:
            "Il server non ha restituito il corpo. Riprova: la mail è molto grande.",
        };
      }

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

      let allegatiSaved = 0;
      if (!input.skipAttachments) {
        const attRes = await persistMessaggioAttachments({
          supabase: input.supabase,
          messaggioId: input.messaggioId,
          accountId: input.account.id,
          attachments,
          userId: input.userId,
        });
        allegatiSaved = attRes.saved;
      }

      return {
        success: true,
        bodyHtml,
        bodyText,
        allegatiSaved,
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
    if (ownClient) {
      try {
        await client.logout();
      } catch {
        // ignore
      }
    }
  }
}

/** Ripara un lotto di import parziali sulla stessa casella, una connessione IMAP. */
export async function remediaImportParzialiForAccount(input: {
  supabase: Service;
  account: AccountRow;
  rows: Array<{
    id: string;
    folder: string;
    messageUid: string;
    subject: string;
  }>;
  userId?: string | null;
}): Promise<{
  results: Array<{
    id: string;
    subject: string;
    success: boolean;
    error?: string;
    allegatiSaved?: number;
  }>;
}> {
  const password = decryptWebmailSecret(input.account.password_encrypted);
  const client = new ImapFlow({
    host: input.account.imap_host,
    port: input.account.imap_port,
    secure: input.account.imap_secure,
    auth: { user: input.account.username, pass: password },
    logger: false,
  });
  const results: Array<{
    id: string;
    subject: string;
    success: boolean;
    error?: string;
    allegatiSaved?: number;
  }> = [];
  try {
    await client.connect();
    for (const row of input.rows) {
      const reload = await reloadMessaggioBodyAndAttachments({
        supabase: input.supabase,
        account: input.account,
        messaggioId: row.id,
        folder: row.folder,
        messageUid: row.messageUid,
        userId: input.userId,
        skipAttachments: true,
        client,
      });
      if (reload.success) {
        results.push({
          id: row.id,
          subject: row.subject,
          success: true,
          allegatiSaved: reload.allegatiSaved,
        });
      } else {
        results.push({
          id: row.id,
          subject: row.subject,
          success: false,
          error: reload.error,
        });
      }
    }
  } catch (e) {
    const err = formatImapSyncError(e, input.account);
    for (const row of input.rows) {
      if (results.some((r) => r.id === row.id)) continue;
      results.push({
        id: row.id,
        subject: row.subject,
        success: false,
        error: err,
      });
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
  return { results };
}
