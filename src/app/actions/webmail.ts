"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
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

function mapAccount(row: Record<string, unknown>): WebmailAccountPublic {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    emailAddress: String(row.email_address ?? ""),
    provider: row.provider as WebmailProvider,
    imapHost: String(row.imap_host ?? ""),
    imapPort: Number(row.imap_port) || 993,
    smtpHost: String(row.smtp_host ?? ""),
    smtpPort: Number(row.smtp_port) || 465,
    username: String(row.username ?? ""),
    syncEnabled: Boolean(row.sync_enabled),
    lastSyncAt: (row.last_sync_at as string | null) ?? null,
    lastSyncError: (row.last_sync_error as string | null) ?? null,
  };
}

export async function listWebmailCategorieAction(): Promise<
  | { success: true; items: WebmailCategoria[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("commerciale");
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
  | { success: true; accounts: WebmailAccountPublic[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("commerciale");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select(
      "id, label, email_address, provider, imap_host, imap_port, smtp_host, smtp_port, username, sync_enabled, last_sync_at, last_sync_error"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: (data ?? []).map((r) => mapAccount(r as Record<string, unknown>)),
  };
}

export async function upsertWebmailAccountAction(
  raw: unknown
): Promise<
  | { success: true; account: WebmailAccountPublic }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
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
  const encrypted = encryptWebmailSecret(input.password);

  const { data, error } = await supabase
    .from("webmail_accounts")
    .insert({
      label: input.label,
      email_address: input.emailAddress.toLowerCase(),
      provider: input.provider,
      imap_host: input.imapHost || preset.imapHost,
      imap_port: input.imapPort,
      imap_secure: input.imapSecure,
      smtp_host: input.smtpHost || preset.smtpHost,
      smtp_port: input.smtpPort,
      smtp_secure: input.smtpSecure,
      username: input.username,
      password_encrypted: encrypted,
      sync_enabled: input.syncEnabled ?? true,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, label, email_address, provider, imap_host, imap_port, smtp_host, smtp_port, username, sync_enabled, last_sync_at, last_sync_error"
    )
    .single();
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "webmail_accounts",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Casella webmail collegata: ${input.emailAddress} (${input.provider})`,
    payload: { provider: input.provider, email: input.emailAddress },
  });

  return { success: true, account: mapAccount(data as Record<string, unknown>) };
}

export async function listWebmailMessaggiAction(input?: {
  accountId?: string | null;
  categoriaId?: string | null;
  onlyAiDraft?: boolean;
}): Promise<
  | { success: true; messaggi: WebmailMessaggio[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("commerciale");
  const supabase = await createClient();
  let q = supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, categoria_id, direction, from_address, from_name, to_addresses, subject, body_text, body_html, received_at, is_seen, ai_intent, ai_confidence, has_ai_draft"
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
    messaggi: (data ?? []).map((r) => ({
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
      aiConfidence:
        r.ai_confidence == null ? null : Number(r.ai_confidence),
      hasAiDraft: Boolean(r.has_ai_draft),
    })),
  };
}

export async function getWebmailBozzaForMessaggioAction(
  messaggioId: string
): Promise<
  | { success: true; bozza: WebmailBozzaAi | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("commerciale");
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
  const { auth } = await requireAreaAccess("commerciale");
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
  const { auth } = await requireAreaAccess("commerciale");
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
  await requireAreaAccess("commerciale");
  const service = createServiceClient();
  if (accountId) {
    const { data: account, error } = await service
      .from("webmail_accounts")
      .select(
        "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
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

export function getWebmailProviderPresetsAction() {
  return WEBMAIL_PROVIDER_PRESETS;
}
