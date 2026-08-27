"use server";

import { isAdminLikeProfile } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/audit";
import { requireSuperadmin, requireWebmailAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encryptWebmailSecret } from "@/lib/webmail/crypto";
import {
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
    subject: String(r.subject ?? ""),
    bodyText: String(r.body_text ?? ""),
    bodyHtml: String(r.body_html ?? ""),
    receivedAt: (r.received_at as string | null) ?? null,
    isSeen: Boolean(r.is_seen),
    aiIntent: (r.ai_intent as WebmailMessaggio["aiIntent"]) ?? null,
    aiConfidence: r.ai_confidence == null ? null : Number(r.ai_confidence),
    hasAiDraft: Boolean(r.has_ai_draft),
    aziendaTipo: (r.azienda_tipo as WebmailMessaggio["aziendaTipo"]) ?? null,
    aziendaId: (r.azienda_id as string | null) ?? null,
    aziendaLabel: String(r.azienda_label ?? ""),
    contattoId: (r.contatto_id as string | null) ?? null,
    linkStato: (r.link_stato as WebmailMessaggio["linkStato"]) ?? "bozza",
  };
}

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
      "id, label, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, sync_enabled, last_sync_at, last_sync_error, owner_user_id"
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
    "id, label, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, sync_enabled, last_sync_at, last_sync_error, owner_user_id";

  const forcedUsername =
    input.provider === "generic"
      ? input.username.trim()
      : input.emailAddress.trim().toLowerCase();

  // Se non specificato, collega al profilo con stessa email
  let ownerUserId = input.ownerUserId ?? null;
  if (!ownerUserId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", input.emailAddress.trim())
      .maybeSingle();
    ownerUserId = prof?.id ? String(prof.id) : null;
  }

  const basePayload = {
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

    if (ownerUserId) {
      const { data: existingGrant } = await supabase
        .from("webmail_account_grants")
        .select("id")
        .eq("account_id", data.id)
        .eq("user_id", ownerUserId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existingGrant) {
        await supabase.from("webmail_account_grants").insert({
          account_id: data.id,
          user_id: ownerUserId,
          can_send: true,
          created_by: auth.userId,
          updated_by: auth.userId,
        });
      }
    }

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

  // Grant al proprietario profilo (e al superadmin se diverso)
  const grantUsers = new Set<string>([auth.userId]);
  if (ownerUserId) grantUsers.add(ownerUserId);
  for (const uid of grantUsers) {
    await supabase.from("webmail_account_grants").insert({
      account_id: data.id,
      user_id: uid,
      can_send: true,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
  }

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
    .select(
      "id, account_id, categoria_id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, received_at, is_seen, ai_intent, ai_confidence, has_ai_draft, azienda_tipo, azienda_id, azienda_label, contatto_id, link_stato"
    )
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
  | { success: true; imported: number; drafted: number; errors: string[] }
  | { success: false; error: string }
> {
  await requireWebmailAccess();
  const service = createServiceClient();
  if (accountId) {
    const { data: account, error } = await service
      .from("webmail_accounts")
      .select(
        "id, email_address, provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
      )
      .eq("id", accountId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !account) {
      return { success: false, error: error?.message ?? "Casella non trovata." };
    }
    const res = await syncWebmailAccount(
      service,
      account as Parameters<typeof syncWebmailAccount>[1]
    );
    return {
      success: true,
      imported: res.imported,
      drafted: res.drafted,
      errors: res.error ? [res.error] : [],
    };
  }
  const res = await syncAllWebmailAccounts(service);
  return {
    success: true,
    imported: res.imported,
    drafted: res.drafted,
    errors: res.errors,
  };
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
      "id, account_id, from_address, categoria_id, direction, from_name, to_addresses, subject, body_text, body_html, received_at, is_seen, ai_intent, ai_confidence, has_ai_draft, azienda_tipo, azienda_id, azienda_label, contatto_id, link_stato"
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
    .select(
      "id, account_id, categoria_id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, received_at, is_seen, ai_intent, ai_confidence, has_ai_draft, azienda_tipo, azienda_id, azienda_label, contatto_id, link_stato"
    )
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
