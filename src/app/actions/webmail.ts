"use server";

import { isAdminLikeProfile } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { requireSuperadmin, requireWebmailAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptWebmailSecret } from "@/lib/webmail/crypto";
import {
  deleteImapMessageBestEffort,
  IMAP_SPAM_CANDIDATES,
  moveImapMessageBestEffort,
  previewWebmailAccounts,
  reloadMessaggioBodyAndAttachments,
  sendMailViaAccount,
  syncAllWebmailAccounts,
  syncWebmailAccount,
  WEBMAIL_SYNC_SAFE_BATCH,
  type WebmailSyncMode,
  type WebmailSyncPreviewAccount,
} from "@/lib/webmail/sync";
import {
  bufferToDataUrl,
  normalizeContentId,
  rewriteWebmailHtml,
  WEBMAIL_ALLEGATI_BUCKET,
  WEBMAIL_INLINE_DATA_URL_MAX_BYTES,
} from "@/lib/webmail/html-render";
import {
  bulkWebmailCategoriaSchema,
  bulkWebmailDeleteSchema,
  bulkWebmailMessaggiSchema,
  composeNuovaMailSchema,
  sendBozzaSchema,
  setWebmailImportedSeenSchema,
  WEBMAIL_PAGE_SIZE,
  WEBMAIL_SORT_DIRS,
  WEBMAIL_SORT_KEYS,
  translateWebmailSchema,
  type WebmailSortDir,
  type WebmailSortKey,
  updateBozzaSchema,
  webmailAccountInputSchema,
  WEBMAIL_PROVIDER_PRESETS,
  type WebmailAccountPublic,
  type WebmailListFilter,
  type WebmailBozzaAi,
  type WebmailCategoria,
  type WebmailMailboxView,
  type WebmailMessaggio,
  type WebmailProvider,
} from "@/lib/webmail/types";
import { translateMailWithGemini } from "@/lib/webmail/translate";
import { z } from "zod";
import { randomUUID } from "crypto";

function mapAccount(row: Record<string, unknown>): WebmailAccountPublic {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    emailAddress: String(row.email_address ?? ""),
    provider: row.provider as WebmailProvider,
    imapHost: String(row.imap_host ?? ""),
    imapPort: Number(row.imap_port) || 993,
    imapSecure: row.imap_secure == null ? true : Boolean(row.imap_secure),
    smtpHost: String(row.smtp_host ?? ""),
    smtpPort: Number(row.smtp_port) || 465,
    smtpSecure: row.smtp_secure == null ? true : Boolean(row.smtp_secure),
    username: String(row.username ?? ""),
    syncEnabled: Boolean(row.sync_enabled),
    syncSince: row.sync_since
      ? String(row.sync_since).slice(0, 10)
      : null,
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    lastSyncError: (row.last_sync_error as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
  };
}

function mapMessaggio(r: Record<string, unknown>): WebmailMessaggio {
  return {
    id: String(r.id),
    accountId: String(r.account_id),
    categoriaId: (r.categoria_id as string | null) ?? null,
    direction: r.direction as "inbound" | "outbound",
    fromAddress: String(r.from_address ?? ""),
    fromName: String(r.from_name ?? ""),
    toAddresses: (r.to_addresses as string[]) ?? [],
    ccAddresses: (r.cc_addresses as string[]) ?? [],
    subject: String(r.subject ?? ""),
    bodyText: String(r.body_text ?? ""),
    bodyHtml: String(r.body_html ?? ""),
    receivedAt: (r.received_at as string | null) ?? null,
    sentAt: (r.sent_at as string | null) ?? null,
    messageIdHeader: String(r.message_id_header ?? ""),
    messageUid: String(r.message_uid ?? ""),
    folder: String(r.folder ?? "INBOX"),
    createdAt: (r.created_at as string | null) ?? null,
    isSeen: Boolean(r.is_seen),
    aiIntent: (r.ai_intent as WebmailMessaggio["aiIntent"]) ?? null,
    aiConfidence: r.ai_confidence == null ? null : Number(r.ai_confidence),
    hasAiDraft: Boolean(r.has_ai_draft),
    aziendaTipo: (r.azienda_tipo as WebmailMessaggio["aziendaTipo"]) ?? null,
    aziendaId: (r.azienda_id as string | null) ?? null,
    aziendaLabel: String(r.azienda_label ?? ""),
    contattoId: (r.contatto_id as string | null) ?? null,
    linkStato: (r.link_stato as WebmailMessaggio["linkStato"]) ?? "bozza",
    categoriaSuggestId: (r.categoria_suggest_id as string | null) ?? null,
    categoriaSuggestMode:
      (r.categoria_suggest_mode as WebmailMessaggio["categoriaSuggestMode"]) ??
      null,
    categoriaAutoPending: Boolean(r.categoria_auto_pending),
    categoriaAutoAppliedAt:
      (r.categoria_auto_applied_at as string | null) ?? null,
    categoriaAutoNotified: Boolean(r.categoria_auto_notified),
  };
}

const MESSAGGIO_SELECT =
  "id, account_id, categoria_id, direction, from_address, from_name, to_addresses, cc_addresses, subject, body_text, body_html, received_at, sent_at, message_id_header, message_uid, folder, created_at, is_seen, ai_intent, ai_confidence, has_ai_draft, azienda_tipo, azienda_id, azienda_label, contatto_id, link_stato, categoria_suggest_id, categoria_suggest_mode, categoria_auto_pending, categoria_auto_applied_at, categoria_auto_notified";

export async function listWebmailCategorieAction(): Promise<
  | { success: true; items: WebmailCategoria[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_categorie")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      codice: String(r.codice),
      nome: String(r.nome),
      descrizione: String(r.descrizione ?? ""),
      colore: String(r.colore ?? "#64748b"),
      isSystem: Boolean(r.is_system),
      sortOrder: Number(r.sort_order) || 0,
    })),
  };
}

export type WebmailUnreadCounts = {
  inbox: number;
  spam: number;
  byCategoriaId: Record<string, number>;
};

/**
 * Conteggio mail non aperte (is_seen=false) per In arrivo e per categoria, per casella.
 */
export async function listWebmailUnreadCountsAction(
  accountId: string
): Promise<
  | { success: true; counts: WebmailUnreadCounts }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const parsed = z.string().uuid().safeParse(accountId);
  if (!parsed.success) {
    return { success: false, error: "Casella non valida." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("id, categoria_id, spam_at, folder")
    .eq("account_id", parsed.data)
    .eq("direction", "inbound")
    .eq("is_seen", false)
    .is("deleted_at", null)
    .is("archived_at", null)
    .neq("folder", "TRASH")
    .limit(5000);
  if (error) return { success: false, error: error.message };

  let inbox = 0;
  let spam = 0;
  const byCategoriaId: Record<string, number> = {};
  for (const r of data ?? []) {
    const isSpam =
      Boolean(r.spam_at) ||
      String(r.folder ?? "").toUpperCase() === "JUNK";
    if (isSpam) {
      spam += 1;
      continue;
    }
    const cat = r.categoria_id ? String(r.categoria_id) : null;
    if (!cat) {
      inbox += 1;
    } else {
      byCategoriaId[cat] = (byCategoriaId[cat] ?? 0) + 1;
    }
  }
  return { success: true, counts: { inbox, spam, byCategoriaId } };
}

/**
 * Non lette in In arrivo (senza categoria) per ogni casella visibile.
 */
export async function listWebmailUnreadInboxByAccountAction(): Promise<
  | { success: true; byAccountId: Record<string, number> }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("account_id")
    .eq("direction", "inbound")
    .eq("is_seen", false)
    .is("categoria_id", null)
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("spam_at", null)
    .neq("folder", "TRASH")
    .neq("folder", "JUNK")
    .limit(8000);
  if (error) return { success: false, error: error.message };
  const byAccountId: Record<string, number> = {};
  for (const r of data ?? []) {
    const id = String(r.account_id ?? "");
    if (!id) continue;
    byAccountId[id] = (byAccountId[id] ?? 0) + 1;
  }
  return { success: true, byAccountId };
}

export async function markWebmailMessaggioSeenAction(
  messaggioId: string
): Promise<
  | { success: true; messaggio: WebmailMessaggio }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = z.string().uuid().safeParse(messaggioId);
  if (!parsed.success) {
    return { success: false, error: "Messaggio non valido." };
  }
  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from("webmail_messaggi")
    .select(MESSAGGIO_SELECT)
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (exErr) return { success: false, error: exErr.message };
  if (!existing) return { success: false, error: "Messaggio non trovato." };
  if (Boolean(existing.is_seen)) {
    return {
      success: true,
      messaggio: mapMessaggio(existing as Record<string, unknown>),
    };
  }
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .update({
      is_seen: true,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .select(MESSAGGIO_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  return {
    success: true,
    messaggio: mapMessaggio(data as Record<string, unknown>),
  };
}

export async function listWebmailAccountsAction(): Promise<
  | {
      success: true;
      accounts: WebmailAccountPublic[];
      canManageAccounts: boolean;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const canManageAccounts =
    isAdminLikeProfile(auth.profile) ||
    auth.areas.some((a) => a.slug === "amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select(
      "id, label, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, sync_enabled, sync_since, last_sync_at, last_sync_error, owner_user_id"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: (data ?? []).map((r) => mapAccount(r as Record<string, unknown>)),
    canManageAccounts,
  };
}

export async function upsertWebmailAccountAction(
  raw: unknown
): Promise<
  | { success: true; account: WebmailAccountPublic }
  | { success: false; error: string }
> {
  const { auth } = await requireSuperadmin();
  const parsed = webmailAccountInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati casella non validi.",
    };
  }
  const input = parsed.data;
  const preset = WEBMAIL_PROVIDER_PRESETS[input.provider];
  const supabase = await createClient();
  const selectCols =
    "id, label, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, sync_enabled, sync_since, last_sync_at, last_sync_error, owner_user_id";

  const forcedUsername =
    input.provider === "generic"
      ? input.username.trim()
      : input.emailAddress.trim().toLowerCase();

  const grantedIds = [
    ...new Set((input.grantedUserIds ?? []).filter(Boolean)),
  ];
  // Owner = primo profilo selezionato (o fallback email matching / owner esplicito)
  let ownerUserId: string | null =
    input.ownerUserId ?? grantedIds[0] ?? null;
  if (!ownerUserId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", input.emailAddress.trim())
      .maybeSingle();
    ownerUserId = prof?.id ? String(prof.id) : null;
  }
  if (grantedIds.length === 0 && ownerUserId) {
    grantedIds.push(ownerUserId);
  }
  if (grantedIds.length === 0) {
    return {
      success: false,
      error: "Seleziona almeno un profilo a cui collegare la casella.",
    };
  }
  if (!grantedIds.includes(ownerUserId ?? "")) {
    ownerUserId = grantedIds[0]!;
  }

  const basePayload: Record<string, unknown> = {
    label: input.label,
    email_address: input.emailAddress.toLowerCase(),
    provider: input.provider,
    imap_host: input.imapHost || preset.imapHost,
    imap_port: input.imapPort,
    imap_secure: input.imapSecure,
    smtp_host: input.smtpHost || preset.smtpHost,
    smtp_port: input.smtpPort,
    smtp_secure: input.smtpSecure,
    username: forcedUsername,
    sync_enabled: input.syncEnabled ?? true,
    owner_user_id: ownerUserId,
    updated_by: auth.userId,
    last_sync_error: null as string | null,
  };
  if (input.syncSince !== undefined) {
    basePayload.sync_since = input.syncSince;
  }

  async function syncGrantsForAccount(accountId: string) {
    const wanted = new Set(grantedIds);
    wanted.add(auth.userId);
    const grantRes = await setWebmailAccountGrantsAction({
      accountId,
      userIds: [...wanted],
    });
    return grantRes;
  }

  if (input.id) {
    const updatePayload: Record<string, unknown> = { ...basePayload };
    if (input.password && input.password.trim().length > 0) {
      updatePayload.password_encrypted = encryptWebmailSecret(
        input.password.trim()
      );
    }

    const { data, error } = await supabase
      .from("webmail_accounts")
      .update(updatePayload)
      .eq("id", input.id)
      .is("deleted_at", null)
      .select(selectCols)
      .single();
    if (error) return { success: false, error: error.message };

    const grants = await syncGrantsForAccount(data.id);
    if (!grants.success) return grants;

    await writeAuditLog({
      entity_type: "webmail_accounts",
      entity_id: data.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Casella webmail aggiornata: ${input.emailAddress} (${input.provider})`,
      payload: {
        provider: input.provider,
        email: input.emailAddress,
        username: input.username,
        ownerUserId,
        grantedUserIds: grantedIds,
        password_changed: Boolean(input.password?.trim()),
      },
    });

    return {
      success: true,
      account: mapAccount(data as Record<string, unknown>),
    };
  }

  if (!input.password?.trim()) {
    return { success: false, error: "Password obbligatoria per una nuova casella." };
  }

  const { data, error } = await supabase
    .from("webmail_accounts")
    .insert({
      ...basePayload,
      password_encrypted: encryptWebmailSecret(input.password.trim()),
      created_by: auth.userId,
    })
    .select(selectCols)
    .single();
  if (error) return { success: false, error: error.message };

  const grants = await syncGrantsForAccount(data.id);
  if (!grants.success) return grants;

  await writeAuditLog({
    entity_type: "webmail_accounts",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Casella webmail collegata: ${input.emailAddress} (${input.provider})`,
    payload: {
      provider: input.provider,
      email: input.emailAddress,
      ownerUserId,
      grantedUserIds: grantedIds,
    },
  });

  return { success: true, account: mapAccount(data as Record<string, unknown>) };
}

export async function softDeleteWebmailAccountAction(
  accountId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireSuperadmin();
  const idParsed = z.string().uuid().safeParse(accountId);
  if (!idParsed.success) return { success: false, error: "Casella non valida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("webmail_accounts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
      sync_enabled: false,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "webmail_accounts",
    entity_id: idParsed.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Casella webmail disattivata (soft delete)",
  });
  return { success: true };
}

export type WebmailOperatorOption = {
  id: string;
  email: string;
  fullName: string;
};

export type WebmailAccountGrantPublic = {
  id: string;
  accountId: string;
  userId: string;
  canSend: boolean;
  email: string;
  fullName: string;
};

export async function listWebmailOperatorsAction(): Promise<
  | { success: true; operators: WebmailOperatorOption[] }
  | { success: false; error: string }
> {
  await requireSuperadmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, is_active")
    .eq("is_active", true)
    .order("email", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    operators: (data ?? []).map((r) => ({
      id: String(r.id),
      email: String(r.email ?? ""),
      fullName:
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
        String(r.full_name ?? r.email ?? ""),
    })),
  };
}

export async function listWebmailAccountGrantsAction(
  accountId: string
): Promise<
  | { success: true; grants: WebmailAccountGrantPublic[] }
  | { success: false; error: string }
> {
  await requireSuperadmin();
  if (!accountId) return { success: false, error: "Casella non valida." };
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_account_grants")
    .select("id, account_id, user_id, can_send")
    .eq("account_id", accountId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  const userIds = [...new Set((data ?? []).map((g) => String(g.user_id)))];
  const profileMap = new Map<string, { email: string; fullName: string }>();
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(String(p.id), {
        email: String(p.email ?? ""),
        fullName:
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          String(p.full_name ?? p.email ?? ""),
      });
    }
  }

  return {
    success: true,
    grants: (data ?? []).map((g) => {
      const profile = profileMap.get(String(g.user_id));
      return {
        id: String(g.id),
        accountId: String(g.account_id),
        userId: String(g.user_id),
        canSend: Boolean(g.can_send),
        email: profile?.email ?? "",
        fullName: profile?.fullName ?? "",
      };
    }),
  };
}

export async function setWebmailAccountGrantsAction(input: {
  accountId: string;
  userIds: string[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireSuperadmin();
  const accountId = input.accountId?.trim();
  if (!accountId) return { success: false, error: "Casella non valida." };
  const wanted = [
    ...new Set(
      (input.userIds ?? []).map((id) => id.trim()).filter(Boolean)
    ),
  ];

  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from("webmail_account_grants")
    .select("id, user_id")
    .eq("account_id", accountId)
    .is("deleted_at", null);
  if (exErr) return { success: false, error: exErr.message };

  const currentIds = new Set((existing ?? []).map((g) => String(g.user_id)));
  const wantedSet = new Set(wanted);
  const now = new Date().toISOString();

  const toRemove = (existing ?? []).filter(
    (g) => !wantedSet.has(String(g.user_id))
  );
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("webmail_account_grants")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in(
        "id",
        toRemove.map((g) => g.id)
      );
    if (error) return { success: false, error: error.message };
  }

  const toAdd = wanted.filter((id) => !currentIds.has(id));
  if (toAdd.length > 0) {
    const { error } = await supabase.from("webmail_account_grants").insert(
      toAdd.map((userId) => ({
        account_id: accountId,
        user_id: userId,
        can_send: true,
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    );
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "webmail_account_grants",
    entity_id: accountId,
    action: "update",
    actor_id: auth.userId,
    summary: `Assegnazione operatori casella webmail aggiornata (${wanted.length} utenti)`,
    payload: { account_id: accountId, user_ids: wanted },
  });

  return { success: true };
}

function applyWebmailMessaggiFilters<T>(
  q: T,
  input?: WebmailListFilter
): T {
  const view = input?.view ?? "all";
  let next = q as {
    eq: (c: string, v: unknown) => typeof next;
    is: (c: string, v: null) => typeof next;
    not: (c: string, op: string, v: null) => typeof next;
    neq: (c: string, v: unknown) => typeof next;
  };

  if (view === "cestino") {
    next = next.not("deleted_at", "is", null).is("purged_at", null);
  } else if (view === "archiviate") {
    next = next.is("deleted_at", null).not("archived_at", "is", null);
  } else if (view === "spam") {
    next = next
      .is("deleted_at", null)
      .is("archived_at", null)
      .not("spam_at", "is", null);
  } else {
    next = next
      .is("deleted_at", null)
      .is("archived_at", null)
      .is("spam_at", null)
      .neq("folder", "JUNK");
  }

  if (view !== "bozze") {
    if (
      view === "inbox" ||
      view === "categoria" ||
      view === "all" ||
      view === "spam"
    ) {
      next = next.eq("direction", "inbound");
    }
  } else {
    next = next.eq("has_ai_draft", true);
  }

  if (view === "inbox") {
    next = next.is("categoria_id", null);
  } else if (view === "categoria" && input?.categoriaId) {
    next = next.eq("categoria_id", input.categoriaId);
  } else if (input?.categoriaId) {
    next = next.eq("categoria_id", input.categoriaId);
  }

  if (input?.accountId) next = next.eq("account_id", input.accountId);
  if (input?.onlyAiDraft && view !== "bozze") {
    next = next.eq("has_ai_draft", true);
  }

  return next as T;
}

function parseWebmailSort(
  input?: WebmailListFilter
): { key: WebmailSortKey; dir: WebmailSortDir } {
  const key = WEBMAIL_SORT_KEYS.includes(input?.sortKey as WebmailSortKey)
    ? (input!.sortKey as WebmailSortKey)
    : "received_at";
  const dir = WEBMAIL_SORT_DIRS.includes(input?.sortDir as WebmailSortDir)
    ? (input!.sortDir as WebmailSortDir)
    : key === "is_seen"
      ? "asc"
      : "desc";
  return { key, dir };
}

function applyWebmailMessaggiSort<T>(
  q: T,
  input?: WebmailListFilter
): T {
  const { key, dir } = parseWebmailSort(input);
  const ascending = dir === "asc";
  let next = q as {
    order: (
      col: string,
      opts?: { ascending?: boolean; nullsFirst?: boolean }
    ) => typeof next;
  };
  next = next.order(key, { ascending, nullsFirst: false });
  if (key !== "received_at") {
    next = next.order("received_at", { ascending: false, nullsFirst: false });
  }
  next = next.order("id", { ascending: false });
  return next as T;
}

export async function listWebmailMessaggiAction(input?: WebmailListFilter): Promise<
  | { success: true; messaggi: WebmailMessaggio[]; total: number; page: number }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  const page = Math.max(0, Math.floor(input?.page ?? 0));
  const from = page * WEBMAIL_PAGE_SIZE;
  const to = from + WEBMAIL_PAGE_SIZE - 1;

  let q = supabase
    .from("webmail_messaggi")
    .select(MESSAGGIO_SELECT, { count: "exact" });
  q = applyWebmailMessaggiFilters(q, input);
  q = applyWebmailMessaggiSort(q, input);
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    messaggi: (data ?? []).map((r) =>
      mapMessaggio(r as Record<string, unknown>)
    ),
    total: count ?? 0,
    page,
  };
}

export async function listWebmailMessaggioIdsAction(
  input?: WebmailListFilter
): Promise<
  { success: true; ids: string[]; total: number } | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  const ids: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  let total = 0;

  while (ids.length < 8000) {
    let q = supabase
      .from("webmail_messaggi")
      .select("id", { count: offset === 0 ? "exact" : undefined })
      .range(offset, offset + pageSize - 1);
    q = applyWebmailMessaggiFilters(q, input);
    q = applyWebmailMessaggiSort(q, input);
    const { data, error, count } = await q;
    if (error) return { success: false, error: error.message };
    if (offset === 0) total = count ?? 0;
    const batch = (data ?? []).map((r) => String(r.id));
    ids.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return { success: true, ids: ids.slice(0, 8000), total };
}

export async function bulkSetWebmailMessaggiCategoriaAction(raw: unknown): Promise<
  { success: true; updated: number } | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = bulkWebmailCategoriaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const ids = [...new Set(parsed.data.messaggioIds)];
  const supabase = await createClient();
  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .update({
        categoria_id: parsed.data.categoriaId,
        categoria_suggest_id: null,
        categoria_suggest_mode: null,
        categoria_auto_pending: false,
        spam_at: null,
        spam_by: null,
        updated_by: auth.userId,
      })
      .in("id", chunk)
      .is("purged_at", null)
      .select("id");
    if (error) return { success: false, error: error.message };
    updated += data?.length ?? 0;
  }

  void writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: ids[0]!,
    action: "set_categoria",
    actor_id: auth.userId,
    summary: `Spostate ${updated} mail in categoria`,
    payload: {
      categoriaId: parsed.data.categoriaId,
      requested: ids.length,
      updated,
    },
  });

  return { success: true, updated };
}

export async function bulkDeleteWebmailMessaggiAction(raw: unknown): Promise<
  | { success: true; updated: number; purged: number; imapTried: number }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = bulkWebmailDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const ids = [...new Set(parsed.data.messaggioIds)];
  const expected = fraseConfermaSoftDelete(`MAIL-${ids.length}`);
  if (parsed.data.confermaTestuale.trim() !== expected) {
    return { success: false, error: `Digita esattamente: ${expected}` };
  }

  const supabase = await createClient();
  const service = createServiceClient();
  const now = new Date().toISOString();
  let updated = 0;
  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const patch: Record<string, unknown> = {
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    };
    if (parsed.data.purgeFromTrash) {
      patch.purged_at = now;
      patch.purged_by = auth.userId;
    }
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .update(patch)
      .in("id", chunk)
      .is("purged_at", null)
      .select("id");
    if (error) return { success: false, error: error.message };
    updated += data?.length ?? 0;

    await supabase
      .from("webmail_bozze_ai")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in("messaggio_id", chunk)
      .is("deleted_at", null);
  }

  let imapTried = 0;
  if (ids.length <= WEBMAIL_PAGE_SIZE) {
    const { data: rows } = await service
      .from("webmail_messaggi")
      .select("id, account_id, folder, message_uid")
      .in("id", ids);
    const accountCache = new Map<
      string,
      Parameters<typeof deleteImapMessageBestEffort>[0]["account"]
    >();
    for (const m of rows ?? []) {
      const accId = String(m.account_id);
      let account = accountCache.get(accId);
      if (!account) {
        const { data: acc } = await service
          .from("webmail_accounts")
          .select(
            "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
          )
          .eq("id", accId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!acc) continue;
        account = acc as Parameters<
          typeof deleteImapMessageBestEffort
        >[0]["account"];
        accountCache.set(accId, account);
      }
      if (!m.message_uid) continue;
      imapTried += 1;
      await deleteImapMessageBestEffort({
        account,
        folder: String(m.folder || "INBOX"),
        messageUid: String(m.message_uid),
      });
    }
  }

  void writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: ids[0]!,
    action: parsed.data.purgeFromTrash ? "purge" : "soft_delete",
    actor_id: auth.userId,
    summary: parsed.data.purgeFromTrash
      ? `Spostate ${updated} mail nel cestino e rimosse dal cestino`
      : `Spostate ${updated} mail nel cestino`,
    payload: {
      requested: ids.length,
      updated,
      purgeFromTrash: parsed.data.purgeFromTrash,
      imapTried,
    },
  });

  return {
    success: true,
    updated,
    purged: parsed.data.purgeFromTrash ? updated : 0,
    imapTried,
  };
}

export async function getWebmailBozzaForMessaggioAction(
  messaggioId: string
): Promise<
  | { success: true; bozza: WebmailBozzaAi | null }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_bozze_ai")
    .select("*")
    .eq("messaggio_id", messaggioId)
    .is("deleted_at", null)
    .in("documento_stato", ["bozza", "approvata"])
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, bozza: null };

  const { data: allegati } = await supabase
    .from("webmail_bozze_allegati")
    .select("id, file_name, storage_path, source, prodotto_id")
    .eq("bozza_id", data.id)
    .is("deleted_at", null);

  return {
    success: true,
    bozza: {
      id: String(data.id),
      messaggioId: String(data.messaggio_id),
      documentoStato: data.documento_stato as WebmailBozzaAi["documentoStato"],
      toAddress: String(data.to_address),
      subject: String(data.subject),
      bodyText: String(data.body_text),
      bodyHtml: String(data.body_html ?? ""),
      intent: String(data.intent),
      confidence: data.confidence == null ? null : Number(data.confidence),
      ragNotes: String(data.rag_notes ?? ""),
      aiGenerated: Boolean(data.ai_generated),
      approvedBy: (data.approved_by as string | null) ?? null,
      sentAt: (data.sent_at as string | null) ?? null,
      allegati: (allegati ?? []).map((a) => ({
        id: String(a.id),
        fileName: String(a.file_name),
        storagePath: String(a.storage_path ?? ""),
        source: String(a.source),
        prodottoId: (a.prodotto_id as string | null) ?? null,
      })),
    },
  };
}

export async function updateWebmailBozzaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireWebmailAccess();
  const parsed = updateBozzaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Bozza non valida.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("webmail_bozze_ai")
    .update({
      subject: parsed.data.subject,
      body_text: parsed.data.bodyText,
      body_html:
        parsed.data.bodyHtml ??
        parsed.data.bodyText.replace(/\n/g, "<br/>"),
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.bozzaId)
    .is("deleted_at", null)
    .eq("documento_stato", "bozza");
  if (error) return { success: false, error: error.message };

  await supabase.from("webmail_ai_elaborazioni").insert({
    bozza_id: parsed.data.bozzaId,
    action: "draft_edited",
    ai_generated: true,
    summary: "Bozza AI modificata dall'operatore",
    created_by: auth.userId,
  });
  return { success: true };
}

export async function sendWebmailBozzaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireWebmailAccess();
  const parsed = sendBozzaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Bozza non valida." };
  }
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: bozza, error } = await supabase
    .from("webmail_bozze_ai")
    .select("*")
    .eq("id", parsed.data.bozzaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!bozza) return { success: false, error: "Bozza non trovata." };
  if (bozza.documento_stato === "inviata") {
    return { success: false, error: "Bozza già inviata." };
  }

  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", bozza.account_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella non trovata." };
  }

  const { data: allegati } = await supabase
    .from("webmail_bozze_allegati")
    .select("file_name, storage_path, content_type")
    .eq("bozza_id", bozza.id)
    .is("deleted_at", null);

  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }> = [];
  for (const a of allegati ?? []) {
    const path = String(a.storage_path ?? "").trim();
    if (!path) continue;
    const { data: file, error: dlErr } = await service.storage
      .from("prodotti-schede")
      .download(path);
    if (dlErr || !file) {
      console.error("[webmail attach]", dlErr?.message);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: String(a.file_name),
      content: buf,
      contentType: String(a.content_type || "application/pdf"),
    });
  }

  try {
    await sendMailViaAccount({
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
      to: String(bozza.to_address),
      subject: String(bozza.subject),
      text: String(bozza.body_text),
      html: String(bozza.body_html || ""),
      attachments,
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Invio SMTP fallito.",
    };
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("webmail_bozze_ai")
    .update({
      documento_stato: "inviata",
      approved_by: auth.userId,
      approved_at: sentAt,
      sent_at: sentAt,
      updated_by: auth.userId,
    })
    .eq("id", bozza.id);

  await supabase.from("webmail_ai_elaborazioni").insert({
    messaggio_id: bozza.messaggio_id,
    bozza_id: bozza.id,
    account_id: bozza.account_id,
    action: "sent",
    ai_generated: true,
    approved_by: auth.userId,
    sent_at: sentAt,
    summary: `Email inviata dopo approvazione operatore`,
    payload: {
      to: bozza.to_address,
      subject: bozza.subject,
      allegati: attachments.length,
    },
    created_by: auth.userId,
  });

  await writeAuditLog({
    entity_type: "webmail_bozze_ai",
    entity_id: String(bozza.id),
    action: "send",
    actor_id: auth.userId,
    summary: `Invio bozza AI approvata a ${bozza.to_address}`,
    payload: { ai_generated: true, approved_by: auth.userId, sent_at: sentAt },
  });

  return { success: true };
}

export async function previewWebmailSyncAction(accountId?: string): Promise<
  | {
      success: true;
      totalMissing: number;
      batchSize: number;
      accounts: WebmailSyncPreviewAccount[];
    }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const service = createServiceClient();
  const res = await previewWebmailAccounts(service, accountId || undefined);
  if (!res.success) return res;
  return {
    success: true,
    totalMissing: res.totalMissing,
    batchSize: WEBMAIL_SYNC_SAFE_BATCH,
    accounts: res.accounts,
  };
}

export async function runWebmailSyncAction(
  accountId?: string,
  mode: WebmailSyncMode = "recent"
): Promise<
  | {
      success: true;
      imported: number;
      drafted: number;
      pending: number;
      importedIds: string[];
      errors: string[];
    }
  | { success: false; error: string }
> {
  try {
    await requireWebmailAccess();
    const service = createServiceClient();
    const opts = { mode, limit: WEBMAIL_SYNC_SAFE_BATCH };
    if (accountId) {
      const { data: account, error } = await service
        .from("webmail_accounts")
        .select(
          "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
        )
        .eq("id", accountId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !account) {
        return {
          success: false,
          error: error?.message ?? "Casella non trovata.",
        };
      }
      const res = await syncWebmailAccount(
        service,
        account as Parameters<typeof syncWebmailAccount>[1],
        opts
      );
      return {
        success: true,
        imported: res.imported,
        drafted: res.drafted,
        pending: res.pending,
        importedIds: res.importedIds,
        errors: res.error ? [res.error] : [],
      };
    }
    const res = await syncAllWebmailAccounts(service, opts);
    return {
      success: true,
      imported: res.imported,
      drafted: res.drafted,
      pending: res.pending,
      importedIds: res.importedIds,
      errors: res.errors,
    };
  } catch (e) {
    console.error("[runWebmailSyncAction]", e);
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Errore imprevisto durante la sincronizzazione.",
    };
  }
}

export async function setWebmailImportedSeenAction(raw: {
  messaggioIds: string[];
  seen: boolean;
}): Promise<
  { success: true; updated: number } | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = setWebmailImportedSeenSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const ids = [...new Set(parsed.data.messaggioIds)];
  if (ids.length === 0) {
    return { success: true, updated: 0 };
  }

  const supabase = await createClient();
  let updated = 0;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .update({
        is_seen: parsed.data.seen,
        updated_by: auth.userId,
      })
      .in("id", chunk)
      .is("purged_at", null)
      .select("id");
    if (error) return { success: false, error: error.message };
    updated += data?.length ?? 0;
  }

  void writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: ids[0]!,
    action: "update",
    actor_id: auth.userId,
    summary: parsed.data.seen
      ? `${updated} mail impostate come Lette`
      : `${updated} mail impostate come Da leggere`,
    payload: {
      seen: parsed.data.seen,
      requested: ids.length,
      updated,
    },
  });

  return { success: true, updated };
}

export async function getWebmailProviderPresetsAction() {
  return WEBMAIL_PROVIDER_PRESETS;
}

const linkMessaggioSchema = z.object({
  messaggioId: z.string().uuid(),
  aziendaTipo: z
    .enum(["cliente", "fornitore", "cliente_possibile"])
    .nullable()
    .optional(),
  aziendaId: z.string().uuid().nullable().optional(),
  aziendaLabel: z.string().trim().max(300).optional().default(""),
  contattoId: z.string().uuid().nullable().optional(),
  linkStato: z.enum(["bozza", "collegata", "da_salvare"]).optional(),
  /** Se true, ricalcola match automatico dal mittente. */
  rematch: z.boolean().optional().default(false),
});

/**
 * Collega (o ricalcola) anagrafica/referente su un messaggio webmail.
 */
export async function linkWebmailMessaggioAnagraficaAction(
  raw: unknown
): Promise<
  | { success: true; messaggio: WebmailMessaggio }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = linkMessaggioSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati collegamento non validi." };
  }

  const supabase = await createClient();
  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, from_address, from_name, subject, body_text, has_ai_draft"
    )
    .eq("id", parsed.data.messaggioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }

  let patch: Record<string, unknown>;
  if (parsed.data.rematch) {
    const { matchWebmailAnagrafica } = await import(
      "@/lib/webmail/anagrafica-link"
    );
    const match = await matchWebmailAnagrafica(
      supabase,
      String(msg.from_address ?? "")
    );
    patch = {
      azienda_tipo: match.aziendaTipo,
      azienda_id: match.aziendaId,
      azienda_label: match.aziendaLabel,
      contatto_id: match.contattoId,
      link_stato: match.linkStato,
      updated_by: auth.userId,
    };
  } else {
    const hasAzienda = Boolean(parsed.data.aziendaId && parsed.data.aziendaTipo);
    patch = {
      azienda_tipo: parsed.data.aziendaTipo ?? null,
      azienda_id: parsed.data.aziendaId ?? null,
      azienda_label: parsed.data.aziendaLabel ?? "",
      contatto_id: parsed.data.contattoId ?? null,
      link_stato:
        parsed.data.linkStato ??
        (hasAzienda ? "collegata" : "da_salvare"),
      updated_by: auth.userId,
    };
  }

  const { data: updated, error } = await supabase
    .from("webmail_messaggi")
    .update(patch)
    .eq("id", parsed.data.messaggioId)
    .select(MESSAGGIO_SELECT)
    .single();
  if (error || !updated) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: parsed.data.messaggioId,
    action: parsed.data.rematch ? "rematch_anagrafica" : "link_anagrafica",
    actor_id: auth.userId,
    summary: "Collegamento anagrafica messaggio webmail",
    payload: patch,
  });

  return {
    success: true,
    messaggio: mapMessaggio(updated as Record<string, unknown>),
  };
}

export async function generateWebmailAiReplyAction(
  messaggioId: string
): Promise<
  | { success: true; bozza: WebmailBozzaAi }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const service = createServiceClient();
  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, from_address, from_name, subject, body_text, has_ai_draft"
    )
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }

  const { classifyInboundEmail, generateDraftReply } = await import(
    "@/lib/webmail/ai"
  );
  const { buildRagForIntent } = await import("@/lib/webmail/rag");

  const classification = await classifyInboundEmail({
    subject: String(msg.subject ?? ""),
    bodyText: String(msg.body_text ?? ""),
    fromName: String(msg.from_name ?? ""),
  });
  const rag = await buildRagForIntent(
    service,
    classification.intent,
    classification.productQuery,
    String(msg.body_text ?? "")
  );
  const draft = await generateDraftReply({
    intent: classification.intent,
    subject: String(msg.subject ?? ""),
    bodyText: String(msg.body_text ?? ""),
    fromName: String(msg.from_name ?? ""),
    referentName: classification.referentName,
    ragContext: rag.notes,
  });

  await supabase
    .from("webmail_bozze_ai")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("messaggio_id", msg.id)
    .is("deleted_at", null)
    .in("documento_stato", ["bozza", "approvata"]);

  const { data: bozza, error: bozzaErr } = await supabase
    .from("webmail_bozze_ai")
    .insert({
      messaggio_id: msg.id,
      account_id: msg.account_id,
      documento_stato: "bozza",
      to_address: String(msg.from_address ?? ""),
      subject: draft.subject,
      body_text: draft.bodyText,
      body_html: draft.bodyText.replace(/\n/g, "<br/>"),
      intent: classification.intent,
      confidence: classification.confidence,
      model_name: draft.modelName,
      rag_notes: rag.notes,
      ai_generated: true,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (bozzaErr || !bozza) {
    return {
      success: false,
      error: bozzaErr?.message ?? "Creazione bozza fallita.",
    };
  }

  if (rag.allegati.length > 0) {
    await supabase.from("webmail_bozze_allegati").insert(
      rag.allegati.map((a) => ({
        bozza_id: bozza.id,
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
    .update({
      has_ai_draft: true,
      ai_intent: classification.intent,
      ai_confidence: classification.confidence,
      ai_processed_at: new Date().toISOString(),
      updated_by: auth.userId,
    })
    .eq("id", msg.id);

  await supabase.from("webmail_ai_elaborazioni").insert({
    messaggio_id: msg.id,
    bozza_id: bozza.id,
    account_id: msg.account_id,
    action: "draft_created_on_demand",
    ai_generated: true,
    summary: `Bozza AI generata su richiesta operatore (${classification.intent})`,
    payload: { model: draft.modelName },
    created_by: auth.userId,
  });

  await writeAuditLog({
    entity_type: "webmail_bozze_ai",
    entity_id: String(bozza.id),
    action: "create_on_demand",
    actor_id: auth.userId,
    summary: "Genera risposta AI (on-demand)",
  });

  const loaded = await getWebmailBozzaForMessaggioAction(String(msg.id));
  if (!loaded.success || !loaded.bozza) {
    return { success: false, error: "Bozza creata ma non ricaricabile." };
  }
  return { success: true, bozza: loaded.bozza };
}

export async function createWebmailCategoriaAction(raw: unknown): Promise<
  | { success: true; item: WebmailCategoria }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const schema = z.object({
    nome: z.string().trim().min(2).max(80),
    colore: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .default("#64748b"),
    descrizione: z.string().trim().max(300).optional().default(""),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Nome categoria non valido." };
  }
  const { slugifyCategoriaCodice, pickUnusedCategoriaColore } = await import(
    "@/lib/webmail/category-learn"
  );
  let codice = slugifyCategoriaCodice(parsed.data.nome);
  const supabase = await createClient();
  const { data: clash } = await supabase
    .from("webmail_categorie")
    .select("id")
    .ilike("codice", codice)
    .is("deleted_at", null)
    .maybeSingle();
  if (clash) codice = `${codice}_${Date.now().toString(36).slice(-4)}`;

  const { data: existingColors } = await supabase
    .from("webmail_categorie")
    .select("colore")
    .is("deleted_at", null);
  const usedColors = (existingColors ?? []).map((r) =>
    String(r.colore ?? "")
  );
  const requested = parsed.data.colore;
  const colore =
    requested &&
    !usedColors.some((c) => c.toLowerCase() === requested.toLowerCase())
      ? requested
      : pickUnusedCategoriaColore(usedColors);

  const { data, error } = await supabase
    .from("webmail_categorie")
    .insert({
      codice,
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione,
      colore,
      is_system: false,
      sort_order: 500,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fallita." };
  }
  await writeAuditLog({
    entity_type: "webmail_categorie",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Categoria webmail creata: ${parsed.data.nome}`,
  });
  return {
    success: true,
    item: {
      id: String(data.id),
      codice: String(data.codice),
      nome: String(data.nome),
      descrizione: String(data.descrizione ?? ""),
      colore: String(data.colore ?? "#64748b"),
      isSystem: Boolean(data.is_system),
      sortOrder: Number(data.sort_order) || 0,
    },
  };
}

export async function setWebmailMessaggioCategoriaAction(raw: unknown): Promise<
  | { success: true; messaggio: WebmailMessaggio; learnMode: string }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const schema = z.object({
    messaggioId: z.string().uuid(),
    categoriaId: z.string().uuid(),
    reinforce: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };

  const supabase = await createClient();
  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select("id, account_id, from_address")
    .eq("id", parsed.data.messaggioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }

  const { data: updated, error } = await supabase
    .from("webmail_messaggi")
    .update({
      categoria_id: parsed.data.categoriaId,
      categoria_suggest_id: null,
      categoria_suggest_mode: null,
      categoria_auto_pending: false,
      updated_by: auth.userId,
    })
    .eq("id", msg.id)
    .select(MESSAGGIO_SELECT)
    .single();
  if (error || !updated) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }

  let learnMode = "none";
  if (parsed.data.reinforce) {
    const { reinforceCategoriaLearning } = await import(
      "@/lib/webmail/category-learn-db"
    );
    const rule = await reinforceCategoriaLearning(supabase, {
      accountId: String(msg.account_id),
      fromAddress: String(msg.from_address ?? ""),
      categoriaId: parsed.data.categoriaId,
      userId: auth.userId,
    });
    learnMode = rule.mode;
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(msg.id),
    action: "set_categoria",
    actor_id: auth.userId,
    summary: "Categoria messaggio impostata manualmente",
    payload: {
      categoriaId: parsed.data.categoriaId,
      learnMode,
    },
  });

  return {
    success: true,
    messaggio: mapMessaggio(updated as Record<string, unknown>),
    learnMode,
  };
}

export async function confirmWebmailCategoriaSuggestionAction(
  messaggioId: string
): Promise<
  | { success: true; messaggio: WebmailMessaggio; learnMode: string }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };
  const supabase = await createClient();
  const { data: msg } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, from_address, categoria_suggest_id, categoria_id, categoria_auto_pending"
    )
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!msg) return { success: false, error: "Messaggio non trovato." };

  const catId =
    (msg.categoria_suggest_id as string | null) ||
    (msg.categoria_auto_pending ? (msg.categoria_id as string | null) : null);
  if (!catId) {
    return { success: false, error: "Nessun suggerimento da confermare." };
  }

  return setWebmailMessaggioCategoriaAction({
    messaggioId: idParsed.data,
    categoriaId: catId,
    reinforce: true,
  });
}

export async function rejectWebmailCategoriaSuggestionAction(
  messaggioId: string
): Promise<
  | { success: true; messaggio: WebmailMessaggio }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("webmail_messaggi")
    .update({
      categoria_suggest_id: null,
      categoria_suggest_mode: null,
      categoria_auto_pending: false,
      updated_by: auth.userId,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .select(MESSAGGIO_SELECT)
    .single();
  if (error || !updated) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: idParsed.data,
    action: "reject_categoria_suggest",
    actor_id: auth.userId,
    summary: "Suggerimento/auto-categoria rifiutato",
  });
  return {
    success: true,
    messaggio: mapMessaggio(updated as Record<string, unknown>),
  };
}

export type WebmailAziendaOption = {
  tipo: "cliente" | "fornitore" | "cliente_possibile";
  id: string;
  label: string;
};

export async function searchWebmailAziendeAction(
  query: string
): Promise<
  | { success: true; items: WebmailAziendaOption[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const q = query.trim();
  if (q.length < 1) return { success: true, items: [] };
  const service = createServiceClient();
  const like = `%${q}%`;
  const [c, f, p] = await Promise.all([
    service
      .from("clienti")
      .select("id, ragione_sociale")
      .is("deleted_at", null)
      .ilike("ragione_sociale", like)
      .limit(20),
    service
      .from("fornitori")
      .select("id, ragione_sociale")
      .is("deleted_at", null)
      .ilike("ragione_sociale", like)
      .limit(20),
    service
      .from("clienti_possibili")
      .select("id, ragione_sociale")
      .is("deleted_at", null)
      .ilike("ragione_sociale", like)
      .limit(20),
  ]);
  const items: WebmailAziendaOption[] = [
    ...(c.data ?? []).map((r) => ({
      tipo: "cliente" as const,
      id: String(r.id),
      label: String(r.ragione_sociale ?? ""),
    })),
    ...(f.data ?? []).map((r) => ({
      tipo: "fornitore" as const,
      id: String(r.id),
      label: String(r.ragione_sociale ?? ""),
    })),
    ...(p.data ?? []).map((r) => ({
      tipo: "cliente_possibile" as const,
      id: String(r.id),
      label: String(r.ragione_sociale ?? ""),
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, "it"));
  return { success: true, items };
}

export type WebmailAnagraficaHit = {
  tipo: "cliente" | "cliente_possibile";
  id: string;
  label: string;
  email: string;
  via: "email" | "pec" | "referente";
  contattoId: string | null;
  contattoNome: string;
};

function normalizeLookupEmail(raw: string): string {
  const t = raw.trim().toLowerCase();
  const angled = t.match(/<([^>]+@[^>]+)>/);
  return (angled?.[1] ?? t).trim();
}

export async function lookupWebmailAnagraficaByEmailAction(
  fromAddress: string
): Promise<
  | { success: true; hits: WebmailAnagraficaHit[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const email = normalizeLookupEmail(fromAddress);
  if (!email || !email.includes("@")) {
    return { success: true, hits: [] };
  }
  const service = createServiceClient();
  const hits: WebmailAnagraficaHit[] = [];
  const seen = new Set<string>();

  function push(hit: WebmailAnagraficaHit) {
    const key = `${hit.tipo}:${hit.id}:${hit.contattoId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  }

  const [clientiEmail, clientiPec, possEmail, possPec, rubricaRes] =
    await Promise.all([
    service
      .from("clienti")
      .select("id, ragione_sociale, email, pec")
      .is("deleted_at", null)
      .ilike("email", email),
    service
      .from("clienti")
      .select("id, ragione_sociale, email, pec")
      .is("deleted_at", null)
      .ilike("pec", email),
    service
      .from("clienti_possibili")
      .select("id, ragione_sociale, email, pec")
      .is("deleted_at", null)
      .ilike("email", email),
    service
      .from("clienti_possibili")
      .select("id, ragione_sociale, email, pec")
      .is("deleted_at", null)
      .ilike("pec", email),
    service
      .from("rubrica_contatti")
      .select("id, nome, cognome, email, azienda_tipo, azienda_id, azienda_label")
      .is("deleted_at", null)
      .ilike("email", email)
      .in("azienda_tipo", ["cliente", "cliente_possibile"]),
  ]);
  if (clientiEmail.error) {
    return { success: false, error: clientiEmail.error.message };
  }
  if (clientiPec.error) {
    return { success: false, error: clientiPec.error.message };
  }
  if (possEmail.error) return { success: false, error: possEmail.error.message };
  if (possPec.error) return { success: false, error: possPec.error.message };
  if (rubricaRes.error) return { success: false, error: rubricaRes.error.message };

  const clientiRows = [...(clientiEmail.data ?? []), ...(clientiPec.data ?? [])];
  const possRows = [...(possEmail.data ?? []), ...(possPec.data ?? [])];

  for (const r of clientiRows) {
    const pec = String(r.pec ?? "").trim().toLowerCase();
    push({
      tipo: "cliente",
      id: String(r.id),
      label: String(r.ragione_sociale ?? ""),
      email,
      via: pec === email ? "pec" : "email",
      contattoId: null,
      contattoNome: "",
    });
  }
  for (const r of possRows) {
    const pec = String(r.pec ?? "").trim().toLowerCase();
    push({
      tipo: "cliente_possibile",
      id: String(r.id),
      label: String(r.ragione_sociale ?? ""),
      email,
      via: pec === email ? "pec" : "email",
      contattoId: null,
      contattoNome: "",
    });
  }
  for (const r of rubricaRes.data ?? []) {
    const tipo = r.azienda_tipo === "cliente_possibile"
      ? "cliente_possibile"
      : "cliente";
    if (!r.azienda_id) continue;
    push({
      tipo,
      id: String(r.azienda_id),
      label: String(r.azienda_label ?? ""),
      email,
      via: "referente",
      contattoId: String(r.id),
      contattoNome: `${r.nome ?? ""} ${r.cognome ?? ""}`.trim(),
    });
  }
  return { success: true, hits };
}

export async function extractWebmailAnagraficaFromEmailAction(
  messaggioId: string
): Promise<
  | {
      success: true;
      extract: import("@/lib/webmail/ai").WebmailAnagraficaExtract;
    }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select("from_address, from_name, subject, body_text")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Messaggio non trovato." };
  }
  const { extractAnagraficaFromEmail } = await import("@/lib/webmail/ai");
  const extract = await extractAnagraficaFromEmail({
    fromName: String(data.from_name ?? ""),
    fromAddress: String(data.from_address ?? ""),
    subject: String(data.subject ?? ""),
    bodyText: String(data.body_text ?? ""),
  });
  return { success: true, extract };
}

async function persistEmailAutoLink(input: {
  email: string;
  aziendaTipo: "cliente" | "cliente_possibile";
  aziendaId: string;
  aziendaLabel: string;
  contattoId: string | null;
  actorId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const service = createServiceClient();
  const email = normalizeLookupEmail(input.email);
  const now = new Date().toISOString();
  const { data: existing } = await service
    .from("webmail_email_anagrafica_auto_link")
    .select("id")
    .eq("email_normalized", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const { error } = await service
      .from("webmail_email_anagrafica_auto_link")
      .update({
        azienda_tipo: input.aziendaTipo,
        azienda_id: input.aziendaId,
        azienda_label: input.aziendaLabel,
        contatto_id: input.contattoId,
        updated_by: input.actorId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await service.from("webmail_email_anagrafica_auto_link").insert({
      email_normalized: email,
      azienda_tipo: input.aziendaTipo,
      azienda_id: input.aziendaId,
      azienda_label: input.aziendaLabel,
      contatto_id: input.contattoId,
      created_by: input.actorId,
      updated_by: input.actorId,
    });
    if (error) return { success: false, error: error.message };
  }
  await writeAuditLog({
    entity_type: "webmail_email_anagrafica_auto_link",
    entity_id: input.aziendaId,
    action: "upsert",
    actor_id: input.actorId,
    summary: `Auto-collegamento mail ${email} → ${input.aziendaLabel}`,
    payload: {
      email,
      azienda_tipo: input.aziendaTipo,
      azienda_id: input.aziendaId,
      at: now,
    },
  });
  return { success: true };
}

async function linkAllMessagesByEmail(input: {
  email: string;
  aziendaTipo: "cliente" | "cliente_possibile";
  aziendaId: string;
  aziendaLabel: string;
  contattoId: string | null;
  actorId: string;
}): Promise<number> {
  const service = createServiceClient();
  const email = normalizeLookupEmail(input.email);
  const { data } = await service
    .from("webmail_messaggi")
    .update({
      azienda_tipo: input.aziendaTipo,
      azienda_id: input.aziendaId,
      azienda_label: input.aziendaLabel,
      contatto_id: input.contattoId,
      link_stato: "collegata",
      updated_by: input.actorId,
    })
    .ilike("from_address", email)
    .is("deleted_at", null)
    .select("id");
  return data?.length ?? 0;
}

export async function confirmWebmailAnagraficaLinkAction(raw: unknown): Promise<
  | { success: true; messaggio: WebmailMessaggio; linkedCount: number }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = z
    .object({
      messaggioId: z.string().uuid(),
      aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
      aziendaId: z.string().uuid(),
      aziendaLabel: z.string().trim().max(300),
      contattoId: z.string().uuid().nullable().optional(),
      linkAllExisting: z.boolean(),
      persistAutoLink: z.boolean(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };

  const supabase = await createClient();
  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select("id, from_address")
    .eq("id", parsed.data.messaggioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }
  const email = String(msg.from_address ?? "");
  const contattoId = parsed.data.contattoId ?? null;

  const linked = await linkWebmailMessaggioAnagraficaAction({
    messaggioId: parsed.data.messaggioId,
    aziendaTipo: parsed.data.aziendaTipo,
    aziendaId: parsed.data.aziendaId,
    aziendaLabel: parsed.data.aziendaLabel,
    contattoId,
    linkStato: "collegata",
    rematch: false,
  });
  if (!linked.success) return linked;

  let linkedCount = 1;
  if (parsed.data.linkAllExisting) {
    linkedCount = await linkAllMessagesByEmail({
      email,
      aziendaTipo: parsed.data.aziendaTipo,
      aziendaId: parsed.data.aziendaId,
      aziendaLabel: parsed.data.aziendaLabel,
      contattoId,
      actorId: auth.userId,
    });
  }
  if (parsed.data.persistAutoLink) {
    const auto = await persistEmailAutoLink({
      email,
      aziendaTipo: parsed.data.aziendaTipo,
      aziendaId: parsed.data.aziendaId,
      aziendaLabel: parsed.data.aziendaLabel,
      contattoId,
      actorId: auth.userId,
    });
    if (!auto.success) return auto;
  }
  return { success: true, messaggio: linked.messaggio, linkedCount };
}

export async function createAndLinkWebmailAnagraficaAction(raw: unknown): Promise<
  | { success: true; messaggio: WebmailMessaggio; linkedCount: number }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = z
    .object({
      messaggioId: z.string().uuid(),
      kind: z.enum(["cliente", "cliente_possibile"]),
      azienda: z.object({
        ragioneSociale: z.string().trim().min(1).max(200),
        partitaIva: z.string().trim().max(20).optional().default(""),
        codiceFiscale: z.string().trim().max(20).optional().default(""),
        isPrivato: z.boolean().optional().default(false),
        email: z.string().trim().max(120).optional().default(""),
        pec: z.string().trim().max(120).optional().default(""),
        sdiCode: z.string().trim().max(10).optional().default(""),
        telefono: z.string().trim().max(60).optional().default(""),
        sitoWeb: z.string().trim().max(200).optional().default(""),
        nazione: z.string().trim().max(80).optional().default("Italia"),
        provincia: z.string().trim().max(80).optional().default(""),
        citta: z.string().trim().max(80).optional().default(""),
        cap: z.string().trim().max(16).optional().default(""),
        indirizzo: z.string().trim().max(200).optional().default(""),
      }),
      referente: z
        .object({
          nome: z.string().trim().max(80).optional().default(""),
          cognome: z.string().trim().max(80).optional().default(""),
          email: z.string().trim().max(120).optional().default(""),
          telefono: z.string().trim().max(60).optional().default(""),
          mansione: z.string().trim().max(120).optional().default(""),
        })
        .optional(),
      includeReferente: z.boolean().optional().default(false),
      linkAllExisting: z.boolean(),
      persistAutoLink: z.boolean(),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }

  const { emptySede } = await import("@/lib/amministrazione/clienti");
  const aziendaInput = {
    ragioneSociale: parsed.data.azienda.ragioneSociale,
    partitaIva: parsed.data.azienda.partitaIva,
    codiceFiscale: parsed.data.azienda.codiceFiscale,
    isPrivato: parsed.data.azienda.isPrivato,
    email: parsed.data.azienda.email,
    pec: parsed.data.azienda.pec,
    sdiCode: parsed.data.azienda.sdiCode,
    telefono: parsed.data.azienda.telefono,
    sitoWeb: parsed.data.azienda.sitoWeb,
    sedeAmministrativa: {
      nazione: parsed.data.azienda.nazione || "Italia",
      provincia: parsed.data.azienda.provincia,
      citta: parsed.data.azienda.citta,
      cap: parsed.data.azienda.cap,
      indirizzo: parsed.data.azienda.indirizzo,
    },
    sedeMagazzino: emptySede(),
    consegneAltraAzienda: [],
    prodottiAcquistati: [],
  };

  let aziendaId = "";
  let aziendaLabel = parsed.data.azienda.ragioneSociale;
  if (parsed.data.kind === "cliente") {
    const { createClienteAction } = await import("@/app/actions/clienti");
    const created = await createClienteAction(aziendaInput);
    if (!created.success) return created;
    aziendaId = created.cliente.id;
    aziendaLabel = created.cliente.ragioneSociale;
  } else {
    const { createClientePossibileAction } = await import(
      "@/app/actions/promemorie-e-note"
    );
    const created = await createClientePossibileAction(aziendaInput);
    if (!created.success) return created;
    aziendaId = created.item.id;
    aziendaLabel = created.item.ragioneSociale;
  }

  let contattoId: string | null = null;
  if (parsed.data.includeReferente && parsed.data.referente) {
    const nr = parsed.data.referente;
    const service = createServiceClient();
    const { data: created, error: cErr } = await service
      .from("rubrica_contatti")
      .insert({
        nome: nr.nome.trim() || "Referente",
        cognome: nr.cognome.trim() || "—",
        telefono: nr.telefono.trim() || "",
        email: nr.email.trim() || parsed.data.azienda.email,
        rapporto: "referente",
        azienda_tipo: parsed.data.kind,
        azienda_id: aziendaId,
        azienda_label: aziendaLabel,
        mansione: nr.mansione.trim() || "",
        note: "Creato da WebMail",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return {
        success: false,
        error: cErr?.message ?? "Creazione referente fallita.",
      };
    }
    contattoId = String(created.id);
    await writeAuditLog({
      entity_type: "rubrica_contatti",
      entity_id: contattoId,
      action: "create_from_webmail",
      actor_id: auth.userId,
      summary: "Referente creato da WebMail (nuova anagrafica)",
    });
  }

  return confirmWebmailAnagraficaLinkAction({
    messaggioId: parsed.data.messaggioId,
    aziendaTipo: parsed.data.kind,
    aziendaId,
    aziendaLabel,
    contattoId,
    linkAllExisting: parsed.data.linkAllExisting,
    persistAutoLink: parsed.data.persistAutoLink,
  });
}

export async function listWebmailReferentiAziendaAction(input: {
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile";
  aziendaId: string;
}): Promise<
  | {
      success: true;
      items: Array<{
        id: string;
        nome: string;
        cognome: string;
        email: string;
        telefono: string;
      }>;
    }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const service = createServiceClient();
  const { data, error } = await service
    .from("rubrica_contatti")
    .select("id, nome, cognome, email, telefono")
    .eq("azienda_tipo", input.aziendaTipo)
    .eq("azienda_id", input.aziendaId)
    .is("deleted_at", null)
    .order("cognome", { ascending: true })
    .limit(100);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      nome: String(r.nome ?? ""),
      cognome: String(r.cognome ?? ""),
      email: String(r.email ?? ""),
      telefono: String(r.telefono ?? ""),
    })),
  };
}

export async function linkWebmailAziendaReferenteAction(raw: unknown): Promise<
  | { success: true; messaggio: WebmailMessaggio }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const schema = z.object({
    messaggioId: z.string().uuid(),
    aziendaTipo: z.enum(["cliente", "fornitore", "cliente_possibile"]),
    aziendaId: z.string().uuid(),
    aziendaLabel: z.string().trim().max(300).optional().default(""),
    contattoId: z.string().uuid().nullable().optional(),
    nuovoReferente: z
      .object({
        nome: z.string().trim().max(80).optional().default(""),
        cognome: z.string().trim().max(80).optional().default(""),
        email: z.string().trim().max(120).optional().default(""),
        telefono: z.string().trim().max(60).optional().default(""),
        mansione: z.string().trim().max(120).optional().default(""),
        note: z.string().trim().max(2000).optional().default(""),
      })
      .optional(),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };

  const service = createServiceClient();
  let contattoId = parsed.data.contattoId ?? null;

  if (parsed.data.nuovoReferente && !contattoId) {
    const nr = parsed.data.nuovoReferente;
    const supabase = await createClient();
    const { data: msg } = await supabase
      .from("webmail_messaggi")
      .select("from_address, from_name")
      .eq("id", parsed.data.messaggioId)
      .maybeSingle();
    const email =
      nr.email.trim() || String(msg?.from_address ?? "").trim() || "";
    const nome = nr.nome.trim() || "Referente";
    const cognome = nr.cognome.trim() || "—";
    const { data: created, error: cErr } = await service
      .from("rubrica_contatti")
      .insert({
        nome,
        cognome,
        telefono: nr.telefono.trim() || "",
        email,
        rapporto: "referente",
        azienda_tipo: parsed.data.aziendaTipo,
        azienda_id: parsed.data.aziendaId,
        azienda_label: parsed.data.aziendaLabel,
        mansione: nr.mansione.trim() || "",
        note: nr.note.trim() || "",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return {
        success: false,
        error: cErr?.message ?? "Creazione referente fallita.",
      };
    }
    contattoId = String(created.id);
    await writeAuditLog({
      entity_type: "rubrica_contatti",
      entity_id: contattoId,
      action: "create_from_webmail",
      actor_id: auth.userId,
      summary: "Referente creato da WebMail",
    });
  }

  return linkWebmailMessaggioAnagraficaAction({
    messaggioId: parsed.data.messaggioId,
    aziendaTipo: parsed.data.aziendaTipo,
    aziendaId: parsed.data.aziendaId,
    aziendaLabel: parsed.data.aziendaLabel,
    contattoId,
    linkStato: "collegata",
    rematch: false,
  });
}

/**
 * Soft delete messaggio in gestionale + best effort cancellazione IMAP.
 * La sync non reimporta UID già presenti (anche soft-deleted).
 */
export async function softDeleteWebmailMessaggioAction(
  messaggioId: string
): Promise<
  | { success: true; imapOk: boolean; imapDetail: string }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const service = createServiceClient();

  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select("id, account_id, folder, message_uid, subject, from_address")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("webmail_messaggi")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", msg.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  // Soft-delete bozze collegate
  await supabase
    .from("webmail_bozze_ai")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("messaggio_id", msg.id)
    .is("deleted_at", null);

  let imapOk = false;
  let imapDetail = "IMAP non tentato";
  const { data: account } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", msg.account_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (account && msg.message_uid) {
    const imapRes = await deleteImapMessageBestEffort({
      account: account as Parameters<typeof deleteImapMessageBestEffort>[0]["account"],
      folder: String(msg.folder || "INBOX"),
      messageUid: String(msg.message_uid),
    });
    imapOk = imapRes.ok;
    imapDetail = imapRes.detail;
  } else {
    imapDetail = "Casella o UID non disponibili per IMAP";
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(msg.id),
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Mail eliminata: ${msg.subject ?? ""}`,
    payload: {
      from: msg.from_address,
      message_uid: msg.message_uid,
      imapOk,
      imapDetail,
    },
  });

  await service.from("webmail_ai_elaborazioni").insert({
    messaggio_id: msg.id,
    account_id: msg.account_id,
    action: "message_deleted",
    ai_generated: false,
    summary: `Messaggio soft-deleted (IMAP: ${imapDetail})`,
    payload: { imapOk, imapDetail },
    created_by: auth.userId,
  });

  return { success: true, imapOk, imapDetail };
}

/** Ripristina mail soft-deleted (esce dal Cestino). */
export async function restoreWebmailMessaggioAction(
  messaggioId: string
): Promise<{ success: true; messaggio: WebmailMessaggio } | { success: false; error: string }> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const { data: msg, error: findErr } = await supabase
    .from("webmail_messaggi")
    .select("id, subject")
    .eq("id", idParsed.data)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (findErr || !msg) {
    return {
      success: false,
      error: findErr?.message ?? "Messaggio non trovato nel cestino.",
    };
  }

  const { data, error } = await supabase
    .from("webmail_messaggi")
    .update({
      deleted_at: null,
      deleted_by: null,
      updated_by: auth.userId,
    })
    .eq("id", msg.id)
    .select(MESSAGGIO_SELECT)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Ripristino non riuscito." };
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(msg.id),
    action: "restore",
    actor_id: auth.userId,
    summary: `Mail ripristinata dal cestino: ${msg.subject ?? ""}`,
    payload: {},
  });

  return {
    success: true,
    messaggio: mapMessaggio(data as Record<string, unknown>),
  };
}

export async function archiveWebmailMessaggioAction(
  messaggioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .update({
      archived_at: now,
      archived_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .is("archived_at", null)
    .select("id, subject")
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Messaggio non trovato." };

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(data.id),
    action: "archive",
    actor_id: auth.userId,
    summary: `Mail archiviata: ${(data as { subject?: string }).subject ?? ""}`,
    payload: { archived_at: now },
  });
  return { success: true };
}

export async function unarchiveWebmailMessaggioAction(
  messaggioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireWebmailAccess();
  const idParsed = z.string().uuid().safeParse(messaggioId);
  if (!idParsed.success) return { success: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .update({
      archived_at: null,
      archived_by: null,
      updated_by: auth.userId,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .not("archived_at", "is", null)
    .select("id, subject")
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    return { success: false, error: "Messaggio non trovato in archivio." };
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(data.id),
    action: "unarchive",
    actor_id: auth.userId,
    summary: `Mail ripristinata dall'archivio: ${(data as { subject?: string }).subject ?? ""}`,
    payload: {},
  });
  return { success: true };
}

async function loadWebmailAccountForImap(accountId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
    )
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as
    | Parameters<typeof moveImapMessageBestEffort>[0]["account"]
    | null;
}

/**
 * Sposta mail in Spam (soft-state + best effort IMAP Junk). Non elimina.
 */
export async function setWebmailMessaggiSpamAction(raw: {
  messaggioIds: string[];
  spam: boolean;
}): Promise<
  { success: true; updated: number } | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = bulkWebmailMessaggiSchema
    .extend({ spam: z.boolean() })
    .safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const ids = [...new Set(parsed.data.messaggioIds)];
  if (ids.length === 0) return { success: true, updated: 0 };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const patch = parsed.data.spam
    ? {
        spam_at: now,
        spam_by: auth.userId,
        archived_at: null,
        archived_by: null,
        updated_by: auth.userId,
      }
    : {
        spam_at: null,
        spam_by: null,
        updated_by: auth.userId,
      };

  const { data: rows, error } = await supabase
    .from("webmail_messaggi")
    .update(patch)
    .in("id", ids)
    .is("deleted_at", null)
    .is("purged_at", null)
    .select("id, account_id, folder, message_uid, subject");
  if (error) return { success: false, error: error.message };
  const updated = rows?.length ?? 0;

  if (updated > 0 && updated <= WEBMAIL_PAGE_SIZE) {
    const accountCache = new Map<
      string,
      Parameters<typeof moveImapMessageBestEffort>[0]["account"]
    >();
    for (const m of rows ?? []) {
      const accId = String(m.account_id);
      let account = accountCache.get(accId);
      if (!account) {
        const loaded = await loadWebmailAccountForImap(accId);
        if (!loaded) continue;
        account = loaded;
        accountCache.set(accId, account);
      }
      if (!m.message_uid) continue;
      await moveImapMessageBestEffort({
        account,
        folder: String(m.folder || "INBOX"),
        messageUid: String(m.message_uid),
        targets: parsed.data.spam ? IMAP_SPAM_CANDIDATES : ["INBOX"],
      });
    }
  }

  void writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: ids[0]!,
    action: parsed.data.spam ? "spam" : "unspam",
    actor_id: auth.userId,
    summary: parsed.data.spam
      ? `Spostate ${updated} mail in Spam`
      : `Ripristinate ${updated} mail da Spam`,
    payload: { requested: ids.length, updated, spam: parsed.data.spam },
  });

  return { success: true, updated };
}

export async function markWebmailMessaggioSpamAction(
  messaggioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  return setWebmailMessaggiSpamAction({
    messaggioIds: [messaggioId],
    spam: true,
  });
}

export async function unmarkWebmailMessaggioSpamAction(
  messaggioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  return setWebmailMessaggiSpamAction({
    messaggioIds: [messaggioId],
    spam: false,
  });
}

/**
 * Composizione e invio nuova mail (SMTP) + riga outbound in webmail_messaggi.
 */
export async function sendWebmailNuovaMailAction(
  raw: unknown
): Promise<
  | { success: true; messaggioId: string }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = composeNuovaMailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mail non validi.",
    };
  }
  const d = parsed.data;
  const toList = d.to
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ccList = (d.cc ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const service = createServiceClient();
  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", d.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return { success: false, error: accErr?.message ?? "Casella non trovata." };
  }

  try {
    await sendMailViaAccount({
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
      to: toList.join(", "),
      cc: ccList.length ? ccList.join(", ") : undefined,
      subject: d.subject,
      text: d.bodyText,
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Invio SMTP fallito.",
    };
  }

  const sentAt = new Date().toISOString();
  const uid = `compose-${randomUUID()}`;
  const { data: inserted, error: insErr } = await service
    .from("webmail_messaggi")
    .insert({
      account_id: d.accountId,
      direction: "outbound",
      message_uid: uid,
      message_id_header: null,
      folder: "SENT",
      from_address: String(account.email_address),
      from_name: "",
      to_addresses: toList,
      cc_addresses: ccList,
      subject: d.subject,
      body_text: d.bodyText,
      body_html: d.bodyText.replace(/\n/g, "<br/>"),
      received_at: sentAt,
      sent_at: sentAt,
      is_seen: true,
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
        "Mail inviata ma registrazione gestionale non riuscita.",
    };
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: String(inserted.id),
    action: "send_compose",
    actor_id: auth.userId,
    summary: `Nuova mail inviata a ${toList.join(", ")}: ${d.subject}`,
    payload: { to: toList, cc: ccList, accountId: d.accountId },
  });

  await service.from("webmail_ai_elaborazioni").insert({
    messaggio_id: inserted.id,
    account_id: d.accountId,
    action: "compose_sent",
    ai_generated: false,
    sent_at: sentAt,
    summary: `Nuova mail inviata a ${toList.join(", ")}`,
    payload: { to: toList, cc: ccList, subject: d.subject },
    created_by: auth.userId,
  });

  return { success: true, messaggioId: String(inserted.id) };
}

/**
 * Traduzione on-demand Gemini (non persiste sul body originale).
 * Inbound → tipicamente IT; outbound → lingua scelta.
 */
export async function translateWebmailTextAction(
  raw: unknown
): Promise<
  | {
      success: true;
      subject: string | null;
      bodyText: string;
      model: string;
      targetLang: string;
      targetLangLabel: string;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = translateWebmailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati traduzione non validi.",
    };
  }
  const d = parsed.data;

  // Inbound forzato a italiano se non specificato altrimenti; UI passa "it"
  const targetLang =
    d.direction === "inbound" ? d.targetLang || "it" : d.targetLang;

  try {
    const result = await translateMailWithGemini({
      subject: d.subject ?? null,
      bodyText: d.bodyText,
      targetLang,
    });

    await writeAuditLog({
      entity_type: d.messaggioId
        ? "webmail_messaggi"
        : d.bozzaId
          ? "webmail_bozze_ai"
          : "webmail_translate",
      entity_id: d.messaggioId || d.bozzaId || auth.userId,
      action: "translate",
      actor_id: auth.userId,
      summary: `Traduzione ${d.direction} → ${result.targetLangLabel} (${result.model})`,
      payload: {
        direction: d.direction,
        targetLang,
        model: result.model,
        messaggioId: d.messaggioId ?? null,
        bozzaId: d.bozzaId ?? null,
        chars: d.bodyText.length,
      },
    });

    return {
      success: true,
      subject: result.subject,
      bodyText: result.bodyText,
      model: result.model,
      targetLang,
      targetLangLabel: result.targetLangLabel,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Traduzione fallita.",
    };
  }
}

export type WebmailBlacklistItem = {
  id: string;
  accountId: string | null;
  emailAddress: string;
  note: string;
  createdAt: string;
};

export async function listWebmailBlacklistAction(accountId?: string | null): Promise<
  | { success: true; items: WebmailBlacklistItem[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  let q = supabase
    .from("webmail_blacklist")
    .select("id, account_id, email_address, note, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (accountId) {
    q = q.or(`account_id.eq.${accountId},account_id.is.null`);
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      accountId: r.account_id ? String(r.account_id) : null,
      emailAddress: String(r.email_address ?? ""),
      note: String(r.note ?? ""),
      createdAt: String(r.created_at),
    })),
  };
}

async function purgeWebmailMessagesByFromAddress(input: {
  email: string;
  accountId: string | null;
  actorId: string;
}): Promise<
  | { success: true; purged: number; imapTried: number }
  | { success: false; error: string }
> {
  const service = createServiceClient();
  const now = new Date().toISOString();
  let msgQuery = service
    .from("webmail_messaggi")
    .select("id, account_id, folder, message_uid")
    .ilike("from_address", input.email)
    .is("deleted_at", null);
  if (input.accountId) {
    msgQuery = msgQuery.eq("account_id", input.accountId);
  }
  const { data: toPurge, error: purgeErr } = await msgQuery.limit(2000);
  if (purgeErr) {
    return { success: false, error: purgeErr.message };
  }

  const ids = (toPurge ?? []).map((m) => String(m.id));
  if (ids.length > 0) {
    await service
      .from("webmail_messaggi")
      .update({
        deleted_at: now,
        deleted_by: input.actorId,
        updated_by: input.actorId,
      })
      .in("id", ids);

    await service
      .from("webmail_bozze_ai")
      .update({
        deleted_at: now,
        deleted_by: input.actorId,
        updated_by: input.actorId,
      })
      .in("messaggio_id", ids)
      .is("deleted_at", null);
  }

  let imapTried = 0;
  const accountCache = new Map<
    string,
    Parameters<typeof deleteImapMessageBestEffort>[0]["account"]
  >();
  for (const m of (toPurge ?? []).slice(0, 30)) {
    const accId = String(m.account_id);
    let account = accountCache.get(accId);
    if (!account) {
      const { data: acc } = await service
        .from("webmail_accounts")
        .select(
          "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted, sync_since"
        )
        .eq("id", accId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!acc) continue;
      account = acc as Parameters<
        typeof deleteImapMessageBestEffort
      >[0]["account"];
      accountCache.set(accId, account);
    }
    if (!m.message_uid) continue;
    imapTried += 1;
    await deleteImapMessageBestEffort({
      account,
      folder: String(m.folder || "INBOX"),
      messageUid: String(m.message_uid),
    });
  }

  return { success: true, purged: ids.length, imapTried };
}

/**
 * Aggiunge mittente in blacklist. Opzionale: soft-delete le mail già importate.
 */
export async function addWebmailBlacklistAction(raw: unknown): Promise<
  | {
      success: true;
      purged: number;
      imapTried: number;
      item: WebmailBlacklistItem;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const schema = z.object({
    emailAddress: z.string().trim().min(3).max(320),
    accountId: z.string().uuid().nullable().optional(),
    /** Se true, account_id = null (tutte le caselle). */
    applyToAllAccounts: z.boolean().optional().default(false),
    messaggioId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).optional().default(""),
    /** Se false, solo blocca i futuri import (non cancella le mail già presenti). */
    purgeExisting: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati blacklist non validi." };
  }

  const { normalizeBlacklistEmail, isValidBlacklistEmail } = await import(
    "@/lib/webmail/blacklist"
  );
  const email = normalizeBlacklistEmail(parsed.data.emailAddress);
  if (!isValidBlacklistEmail(email)) {
    return { success: false, error: "Indirizzo email mittente non valido." };
  }

  const accountId = parsed.data.applyToAllAccounts
    ? null
    : (parsed.data.accountId ?? null);

  const service = createServiceClient();

  // Upsert-like: se già presente attiva, riusa
  let blQuery = service
    .from("webmail_blacklist")
    .select("id, account_id, email_address, note, created_at")
    .ilike("email_address", email)
    .is("deleted_at", null);
  if (accountId) {
    blQuery = blQuery.or(`account_id.eq.${accountId},account_id.is.null`);
  } else {
    blQuery = blQuery.is("account_id", null);
  }
  const { data: existingRows } = await blQuery.limit(1);
  let itemRow = existingRows?.[0] ?? null;
  if (!itemRow) {
    const { data: inserted, error: insErr } = await service
      .from("webmail_blacklist")
      .insert({
        account_id: accountId,
        email_address: email,
        note: parsed.data.note || "Blacklist da WebMail",
        source_messaggio_id: parsed.data.messaggioId ?? null,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id, account_id, email_address, note, created_at")
      .single();
    if (insErr || !inserted) {
      return {
        success: false,
        error: insErr?.message ?? "Impossibile salvare in blacklist.",
      };
    }
    itemRow = inserted;
  }

  let purged = 0;
  let imapTried = 0;
  if (parsed.data.purgeExisting) {
    const purge = await purgeWebmailMessagesByFromAddress({
      email,
      accountId,
      actorId: auth.userId,
    });
    if (!purge.success) return purge;
    purged = purge.purged;
    imapTried = purge.imapTried;
  }

  await writeAuditLog({
    entity_type: "webmail_blacklist",
    entity_id: String(itemRow.id),
    action: "create",
    actor_id: auth.userId,
    summary: parsed.data.purgeExisting
      ? `Blacklist mittente ${email} (purgate ${purged} mail)`
      : `Blacklist mittente ${email} (solo blocco sync)`,
    payload: {
      email,
      accountId,
      applyToAll: parsed.data.applyToAllAccounts,
      purged,
      imapTried,
      purgeExisting: parsed.data.purgeExisting,
    },
  });

  return {
    success: true,
    purged,
    imapTried,
    item: {
      id: String(itemRow.id),
      accountId: itemRow.account_id ? String(itemRow.account_id) : null,
      emailAddress: String(itemRow.email_address),
      note: String(itemRow.note ?? ""),
      createdAt: String(itemRow.created_at),
    },
  };
}

export async function confirmWebmailMessaggioDeleteAction(raw: unknown): Promise<
  | {
      success: true;
      purged: number;
      blockedFuture: boolean;
      imapOk: boolean;
      imapDetail: string;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsed = z
    .object({
      messaggioId: z.string().uuid(),
      blockFutureImport: z.boolean(),
      deleteAllFromSender: z.boolean(),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati eliminazione non validi." };
  }

  const supabase = await createClient();
  const { data: msg, error: msgErr } = await supabase
    .from("webmail_messaggi")
    .select("id, from_address, account_id")
    .eq("id", parsed.data.messaggioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message ?? "Messaggio non trovato." };
  }

  const { normalizeBlacklistEmail } = await import("@/lib/webmail/blacklist");
  const email = normalizeBlacklistEmail(String(msg.from_address ?? ""));

  let blockedFuture = false;
  if (parsed.data.blockFutureImport && email) {
    const bl = await addWebmailBlacklistAction({
      emailAddress: email,
      accountId: null,
      applyToAllAccounts: true,
      messaggioId: parsed.data.messaggioId,
      purgeExisting: false,
      note: "Blocco sync da conferma elimina WebMail",
    });
    if (!bl.success) return bl;
    blockedFuture = true;
  }

  if (parsed.data.deleteAllFromSender && email) {
    const purge = await purgeWebmailMessagesByFromAddress({
      email,
      accountId: null,
      actorId: auth.userId,
    });
    if (!purge.success) return purge;
    await writeAuditLog({
      entity_type: "webmail_messaggi",
      entity_id: parsed.data.messaggioId,
      action: "purge_by_sender",
      actor_id: auth.userId,
      summary: `Eliminate ${purge.purged} mail da ${email}`,
      payload: {
        email,
        purged: purge.purged,
        imapTried: purge.imapTried,
        blockedFuture,
      },
    });
    return {
      success: true,
      purged: purge.purged,
      blockedFuture,
      imapOk: purge.imapTried > 0,
      imapDetail:
        purge.imapTried > 0
          ? `IMAP tentato su ${purge.imapTried} messaggi`
          : "IMAP non tentato",
    };
  }

  const deleted = await softDeleteWebmailMessaggioAction(
    parsed.data.messaggioId
  );
  if (!deleted.success) return deleted;
  return {
    success: true,
    purged: 1,
    blockedFuture,
    imapOk: deleted.imapOk,
    imapDetail: deleted.imapDetail,
  };
}

export async function restoreWebmailBlacklistAction(
  blacklistId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireSuperadmin();
  const idParsed = z.string().uuid().safeParse(blacklistId);
  if (!idParsed.success) return { success: false, error: "Voce non valida." };
  const service = createServiceClient();
  const { error } = await service
    .from("webmail_blacklist")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "webmail_blacklist",
    entity_id: idParsed.data,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Voce blacklist ripristinata (rimossa dal blocco)",
  });
  return { success: true };
}

export async function isWebmailSenderBlacklistedAction(input: {
  emailAddress: string;
  accountId: string;
}): Promise<
  { success: true; blacklisted: boolean } | { success: false; error: string }
> {
  await requireWebmailAccess();
  const { normalizeBlacklistEmail } = await import("@/lib/webmail/blacklist");
  const email = normalizeBlacklistEmail(input.emailAddress);
  if (!email) return { success: true, blacklisted: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_blacklist")
    .select("id")
    .ilike("email_address", email)
    .is("deleted_at", null)
    .or(`account_id.eq.${input.accountId},account_id.is.null`)
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, blacklisted: Boolean(data?.id) };
}

const messaggioIdSchema = z.string().uuid();

export type WebmailMessaggioAllegatoPublic = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId: string;
  isInline: boolean;
  url: string | null;
};

/**
 * HTML messaggio con CID risolti (URL firmati) per iframe sandbox.
 */
export async function getWebmailMessaggioHtmlAction(
  messaggioId: string
): Promise<
  | {
      success: true;
      hasHtml: boolean;
      htmlRewritten: string;
      allegati: WebmailMessaggioAllegatoPublic[];
    }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const parsedId = messaggioIdSchema.safeParse(messaggioId);
  if (!parsedId.success) {
    return { success: false, error: "Messaggio non valido." };
  }

  const supabase = await createClient();
  const { data: msg, error } = await supabase
    .from("webmail_messaggi")
    .select("id, account_id, body_html")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!msg) return { success: false, error: "Messaggio non trovato." };

  const { data: rows, error: aErr } = await supabase
    .from("webmail_messaggi_allegati")
    .select(
      "id, filename, mime_type, size_bytes, content_id, is_inline, storage_bucket, storage_path"
    )
    .eq("messaggio_id", parsedId.data)
    .is("deleted_at", null);
  if (aErr) return { success: false, error: aErr.message };

  const service = createServiceClient();
  const cidMap: Record<string, string> = {};
  const allegati: WebmailMessaggioAllegatoPublic[] = [];

  for (const r of rows ?? []) {
    const bucket = String(r.storage_bucket || WEBMAIL_ALLEGATI_BUCKET);
    const path = String(r.storage_path || "");
    const mime = String(r.mime_type ?? "application/octet-stream");
    const sizeBytes = Number(r.size_bytes) || 0;
    const contentId = normalizeContentId(String(r.content_id ?? ""));
    const isInline = Boolean(r.is_inline);
    const isImage = /^image\//i.test(mime);
    let url: string | null = null;

    if (path) {
      // Inline/immagini piccole → data URL (affidabile in iframe sandbox)
      const useDataUrl =
        (isInline || isImage || Boolean(contentId)) &&
        sizeBytes > 0 &&
        sizeBytes <= WEBMAIL_INLINE_DATA_URL_MAX_BYTES;

      if (useDataUrl) {
        const { data: blob, error: dlErr } = await service.storage
          .from(bucket)
          .download(path);
        if (!dlErr && blob) {
          const ab = await blob.arrayBuffer();
          const buf = Buffer.from(ab);
          if (buf.length > 0) {
            url = bufferToDataUrl(mime, buf);
          }
        }
      }

      if (!url) {
        const { data: signed } = await service.storage
          .from(bucket)
          .createSignedUrl(path, 3600);
        url = signed?.signedUrl ?? null;
      }
    }

    if (contentId && url) {
      cidMap[contentId] = url;
      cidMap[contentId.toLowerCase()] = url;
    }
    allegati.push({
      id: String(r.id),
      filename: String(r.filename ?? ""),
      mimeType: mime,
      sizeBytes,
      contentId,
      isInline,
      url,
    });
  }

  const rawHtml = String(msg.body_html ?? "");
  const hasHtml = Boolean(rawHtml.trim());
  const htmlRewritten = hasHtml
    ? rewriteWebmailHtml({ html: rawHtml, cidMap })
    : "";

  return { success: true, hasHtml, htmlRewritten, allegati };
}

/**
 * Ricarica corpo HTML/testo e allegati CID dal server IMAP.
 */
export async function reloadWebmailMessaggioBodyAction(
  messaggioId: string
): Promise<
  | {
      success: true;
      messaggio: WebmailMessaggio;
      allegatiSaved: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireWebmailAccess();
  const parsedId = messaggioIdSchema.safeParse(messaggioId);
  if (!parsedId.success) {
    return { success: false, error: "Messaggio non valido." };
  }

  const supabase = await createClient();
  const { data: msg, error } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, message_uid, folder, deleted_at"
    )
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!msg || msg.deleted_at) {
    return { success: false, error: "Messaggio non trovato." };
  }

  const service = createServiceClient();
  const { data: account, error: accErr } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .eq("id", msg.account_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (accErr || !account) {
    return {
      success: false,
      error: accErr?.message ?? "Casella non trovata.",
    };
  }

  const reload = await reloadMessaggioBodyAndAttachments({
    supabase: service,
    account: account as {
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
    },
    messaggioId: parsedId.data,
    folder: String(msg.folder || "INBOX"),
    messageUid: String(msg.message_uid || ""),
    userId: auth.userId,
  });
  if (!reload.success) return reload;

  const { data: refreshed, error: refErr } = await supabase
    .from("webmail_messaggi")
    .select(MESSAGGIO_SELECT)
    .eq("id", parsedId.data)
    .maybeSingle();
  if (refErr || !refreshed) {
    return {
      success: false,
      error: refErr?.message ?? "Messaggio aggiornato ma non ricaricabile.",
    };
  }

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: parsedId.data,
    action: "update",
    actor_id: auth.userId,
    summary: "Ricarica corpo HTML e allegati IMAP",
    payload: {
      allegati_saved: reload.allegatiSaved,
      has_html: Boolean(reload.bodyHtml.trim()),
    },
  });

  return {
    success: true,
    messaggio: mapMessaggio(refreshed as Record<string, unknown>),
    allegatiSaved: reload.allegatiSaved,
  };
}
