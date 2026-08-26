"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  generateOutreachDraftWithGemini,
  scoutProducersWithGemini,
} from "@/lib/ai-scout/gemini";
import { mapAiScoutLead } from "@/lib/ai-scout/map";
import {
  checkSendRateLimit,
  recordSend,
} from "@/lib/ai-scout/rate-limit";
import {
  generateDraftsSchema,
  rejectLeadSchema,
  scoutProducersSchema,
  sendLeadEmailSchema,
  updateLeadDraftSchema,
  type AiScoutLead,
} from "@/lib/ai-scout/types";
import { requireAreaAccess } from "@/lib/areas/guard";
import { sendSmtpMail } from "@/lib/email/smtp";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendMailViaAccount } from "@/lib/webmail/sync";

export async function listAiScoutLeadsAction(): Promise<
  | { success: true; items: AiScoutLead[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_scout_leads")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: (data ?? []).map((r) => mapAiScoutLead(r as Record<string, unknown>)),
  };
}

export async function scoutProducersAction(
  raw: unknown
): Promise<
  | {
      success: true;
      created: number;
      items: AiScoutLead[];
      groundingUsed: boolean;
      warning?: string;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = scoutProducersSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }

  let scoutResult: Awaited<ReturnType<typeof scoutProducersWithGemini>>;
  try {
    scoutResult = await scoutProducersWithGemini({
      category: parsed.data.category,
      region: parsed.data.region,
      maxResults: parsed.data.maxResults,
    });
  } catch (e) {
    console.error("[ai-scout] scout", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore Gemini nello scouting.",
    };
  }

  if (scoutResult.producers.length === 0) {
    return {
      success: false,
      error:
        "Nessun produttore trovato. Prova un'altra categoria/regione o verifica GEMINI_API_KEY.",
    };
  }

  const supabase = await createClient();
  const rows = scoutResult.producers.map((p) => ({
    company_name: p.company_name,
    product_category: p.product_category || parsed.data.category,
    location: p.location || parsed.data.region,
    email: p.email || "",
    website_or_social: p.website_or_social || "",
    context_notes: p.context_notes || "",
    email_subject: "",
    email_draft: "",
    status: "DRAFT",
    scout_category: parsed.data.category,
    scout_region: parsed.data.region,
    gemini_model: scoutResult.model,
    grounding_used: scoutResult.groundingUsed,
    created_by: auth.userId,
    updated_by: auth.userId,
  }));

  const { data, error } = await supabase
    .from("ai_scout_leads")
    .insert(rows)
    .select("*");
  if (error) return { success: false, error: error.message };

  const items = (data ?? []).map((r) =>
    mapAiScoutLead(r as Record<string, unknown>)
  );

  await writeAuditLog({
    entity_type: "ai_scout_leads",
    entity_id: items[0]?.id ?? "batch",
    action: "scout",
    actor_id: auth.userId,
    summary: `Scouting AI: ${items.length} lead (${parsed.data.category} / ${parsed.data.region})`,
    payload: {
      category: parsed.data.category,
      region: parsed.data.region,
      count: items.length,
      groundingUsed: scoutResult.groundingUsed,
      model: scoutResult.model,
    },
  });

  return {
    success: true,
    created: items.length,
    items,
    groundingUsed: scoutResult.groundingUsed,
    warning: scoutResult.warning,
  };
}

export async function generateEmailDraftsAction(
  raw: unknown
): Promise<
  | { success: true; updated: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = generateDraftsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return { success: false, error: "Parametri non validi." };
  }

  const supabase = await createClient();
  let query = supabase
    .from("ai_scout_leads")
    .select("*")
    .is("deleted_at", null)
    .eq("status", "DRAFT");

  if (parsed.data.leadIds?.length) {
    query = query.in("id", parsed.data.leadIds);
  }

  const { data: rawLeads, error } = await query
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { success: false, error: error.message };

  const leads = (rawLeads ?? []).filter((row) => {
    if (!parsed.data.onlyMissing) return true;
    return !String(row.email_draft ?? "").trim();
  });

  if (!leads.length) {
    return { success: false, error: "Nessun lead DRAFT senza bozza da elaborare." };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const row of leads) {
    try {
      const draft = await generateOutreachDraftWithGemini({
        companyName: String(row.company_name),
        productCategory: String(row.product_category ?? ""),
        location: String(row.location ?? ""),
        contextNotes: String(row.context_notes ?? ""),
        websiteOrSocial: String(row.website_or_social ?? ""),
      });
      const { error: upErr } = await supabase
        .from("ai_scout_leads")
        .update({
          email_subject: draft.subject,
          email_draft: draft.body,
          gemini_model: draft.model,
          updated_by: auth.userId,
          documento_versione: Number(row.documento_versione || 1) + 1,
        })
        .eq("id", row.id);
      if (upErr) {
        errors.push(`${row.company_name}: ${upErr.message}`);
        continue;
      }
      updated += 1;
      await writeAuditLog({
        entity_type: "ai_scout_leads",
        entity_id: String(row.id),
        action: "generate_draft",
        actor_id: auth.userId,
        summary: `Bozza email generata per ${row.company_name}`,
        payload: { subject: draft.subject },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "errore";
      errors.push(`${row.company_name}: ${msg}`);
      console.error("[ai-scout] draft", row.id, e);
    }
  }

  if (updated === 0) {
    return {
      success: false,
      error: errors[0] ?? "Nessuna bozza generata.",
    };
  }

  return { success: true, updated };
}

export async function updateLeadDraftAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = updateLeadDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Bozza non valida.",
    };
  }

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("ai_scout_leads")
    .select("id, status, documento_versione, company_name")
    .eq("id", parsed.data.leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!lead) return { success: false, error: "Lead non trovato." };
  if (lead.status === "SENT") {
    return { success: false, error: "Lead già inviato: bozza non modificabile." };
  }

  const patch: Record<string, unknown> = {
    email_draft: parsed.data.emailDraft,
    updated_by: auth.userId,
    documento_versione: Number(lead.documento_versione || 1) + 1,
  };
  if (parsed.data.emailSubject) {
    patch.email_subject = parsed.data.emailSubject;
  }
  if (lead.status === "REJECTED") {
    patch.status = "DRAFT";
    patch.rejected_at = null;
    patch.rejected_by = null;
  }

  const { error: upErr } = await supabase
    .from("ai_scout_leads")
    .update(patch)
    .eq("id", lead.id);
  if (upErr) return { success: false, error: upErr.message };

  await writeAuditLog({
    entity_type: "ai_scout_leads",
    entity_id: String(lead.id),
    action: "update_draft",
    actor_id: auth.userId,
    summary: `Bozza modificata: ${lead.company_name}`,
  });

  return { success: true };
}

export async function rejectLeadAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = rejectLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Parametri non validi." };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: lead, error } = await supabase
    .from("ai_scout_leads")
    .update({
      status: "REJECTED",
      rejected_by: auth.userId,
      rejected_at: now,
      reject_reason: parsed.data.reason ?? "",
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.leadId)
    .is("deleted_at", null)
    .neq("status", "SENT")
    .select("id, company_name")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!lead) {
    return { success: false, error: "Lead non trovato o già inviato." };
  }

  await writeAuditLog({
    entity_type: "ai_scout_leads",
    entity_id: String(lead.id),
    action: "reject",
    actor_id: auth.userId,
    summary: `Lead scartato: ${lead.company_name}`,
    payload: { reason: parsed.data.reason ?? "" },
  });

  return { success: true };
}

export async function sendLeadEmailAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = sendLeadEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Parametri non validi." };
  }

  const rate = checkSendRateLimit(auth.userId);
  if (!rate.ok) {
    return { success: false, error: rate.error };
  }

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("ai_scout_leads")
    .select("*")
    .eq("id", parsed.data.leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!lead) return { success: false, error: "Lead non trovato." };
  if (lead.status === "SENT") {
    return { success: false, error: "Email già inviata per questo lead." };
  }
  if (lead.status === "REJECTED") {
    return { success: false, error: "Lead scartato." };
  }

  const to = String(lead.email ?? "").trim();
  const draft = String(lead.email_draft ?? "").trim();
  const subject =
    String(lead.email_subject ?? "").trim() ||
    `Collaborazione — ${lead.company_name}`;

  if (!to || !to.includes("@")) {
    return {
      success: false,
      error: "Email destinatario mancante o non valida. Completala prima dell'invio.",
    };
  }
  if (draft.length < 10) {
    return {
      success: false,
      error: "Bozza email assente. Genera o scrivi la bozza prima di inviare.",
    };
  }

  const useSystemSmtp =
    parsed.data.useSystemSmtp === true || !parsed.data.webmailAccountId;

  try {
    if (useSystemSmtp) {
      await sendSmtpMail({
        to,
        subject,
        text: draft,
        html: draft.replace(/\n/g, "<br/>"),
      });
    } else {
      const service = createServiceClient();
      const { data: account, error: accErr } = await service
        .from("webmail_accounts")
        .select(
          "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
        )
        .eq("id", parsed.data.webmailAccountId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (accErr || !account) {
        return {
          success: false,
          error: accErr?.message ?? "Casella webmail non trovata.",
        };
      }
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
        to,
        subject,
        text: draft,
      });
    }
  } catch (e) {
    console.error("[ai-scout] send", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Invio email fallito.",
    };
  }

  recordSend(auth.userId);
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("ai_scout_leads")
    .update({
      status: "SENT",
      approved_by: auth.userId,
      approved_at: now,
      sent_by: auth.userId,
      sent_at: now,
      webmail_account_id: useSystemSmtp
        ? null
        : parsed.data.webmailAccountId ?? null,
      updated_by: auth.userId,
      documento_versione: Number(lead.documento_versione || 1) + 1,
    })
    .eq("id", lead.id);

  if (upErr) {
    return {
      success: false,
      error: `Email inviata ma aggiornamento stato fallito: ${upErr.message}`,
    };
  }

  await writeAuditLog({
    entity_type: "ai_scout_leads",
    entity_id: String(lead.id),
    action: "send",
    actor_id: auth.userId,
    summary: `Email inviata a ${to} (${lead.company_name})`,
    payload: {
      to,
      subject,
      via: useSystemSmtp ? "system_smtp" : "webmail",
      webmailAccountId: parsed.data.webmailAccountId ?? null,
    },
  });

  return { success: true };
}

export async function listScoutWebmailAccountsAction(): Promise<
  | { success: true; accounts: Array<{ id: string; label: string; email: string }> }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_accounts")
    .select("id, label, email_address")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    accounts: (data ?? []).map((r) => ({
      id: String(r.id),
      label: String(r.label ?? ""),
      email: String(r.email_address ?? ""),
    })),
  };
}
