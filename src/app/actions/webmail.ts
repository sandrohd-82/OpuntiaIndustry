"use server";

import { isAdminLikeProfile } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { requireSuperadmin, requireWebmailAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptWebmailSecret } from "@/lib/webmail/crypto";
import {
  deleteImapMessageBestEffort,
  sendMailViaAccount,
  syncAllWebmailAccounts,
  syncWebmailAccount,
} from "@/lib/webmail/sync";
import {
  sendBozzaSchema,
  updateBozzaSchema,
  webmailAccountInputSchema,
  WEBMAIL_PROVIDER_PRESETS,
  type WebmailAccountPublic,
  type WebmailBozzaAi,
  type WebmailCategoria,
  type WebmailMessaggio,
  type WebmailProvider,
} from "@/lib/webmail/types";
import { z } from "zod";

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

export async function listWebmailMessaggiAction(input?: {
  accountId?: string | null;
  categoriaId?: string | null;
  onlyAiDraft?: boolean;
}): Promise<
  | { success: true; messaggi: WebmailMessaggio[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const supabase = await createClient();
  let q = supabase
    .from("webmail_messaggi")
    .select(MESSAGGIO_SELECT)
    .is("deleted_at", null)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(100);
  if (input?.accountId) q = q.eq("account_id", input.accountId);
  if (input?.categoriaId) q = q.eq("categoria_id", input.categoriaId);
  if (input?.onlyAiDraft) q = q.eq("has_ai_draft", true);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    messaggi: (data ?? []).map((r) =>
      mapMessaggio(r as Record<string, unknown>)
    ),
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

export async function runWebmailSyncAction(accountId?: string): Promise<
  | {
      success: true;
      imported: number;
      drafted: number;
      pending: number;
      errors: string[];
    }
  | { success: false; error: string }
> {
  try {
    await requireWebmailAccess();
    const service = createServiceClient();
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
        account as Parameters<typeof syncWebmailAccount>[1]
      );
      return {
        success: true,
        imported: res.imported,
        drafted: res.drafted,
        pending: res.pending,
        errors: res.error ? [res.error] : [],
      };
    }
    const res = await syncAllWebmailAccounts(service);
    return {
      success: true,
      imported: res.imported,
      drafted: res.drafted,
      pending: res.pending,
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
  const { slugifyCategoriaCodice } = await import(
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

  const { data, error } = await supabase
    .from("webmail_categorie")
    .insert({
      codice,
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione,
      colore: parsed.data.colore,
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

/**
 * Aggiunge mittente in blacklist, soft-delete tutte le mail da quell'indirizzo
 * (best-effort IMAP) e blocca futuri import.
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

  const supabase = await createClient();
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

  const now = new Date().toISOString();

  // Soft-delete tutte le mail con quel mittente (scope casella o globale)
  let msgQuery = service
    .from("webmail_messaggi")
    .select("id, account_id, folder, message_uid")
    .ilike("from_address", email)
    .is("deleted_at", null);
  if (accountId) {
    msgQuery = msgQuery.eq("account_id", accountId);
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
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in("id", ids);

    await service
      .from("webmail_bozze_ai")
      .update({
        deleted_at: now,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .in("messaggio_id", ids)
      .is("deleted_at", null);
  }

  // Best-effort IMAP (max 30 per non timeout)
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
      account = acc as Parameters<typeof deleteImapMessageBestEffort>[0]["account"];
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

  await writeAuditLog({
    entity_type: "webmail_blacklist",
    entity_id: String(itemRow.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Blacklist mittente ${email} (purgate ${ids.length} mail)`,
    payload: {
      email,
      accountId,
      applyToAll: parsed.data.applyToAllAccounts,
      purged: ids.length,
      imapTried,
    },
  });

  return {
    success: true,
    purged: ids.length,
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
