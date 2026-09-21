import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import { parseProfilePotere } from "@/lib/auth/gerarchia";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/auth/two-factor";
import {
  sendPasswordResetApprovedEmail,
  sendPasswordResetSaDecisionEmail,
} from "@/lib/email/password-reset";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { createServiceClient } from "@/lib/supabase/server";

export const PASSWORD_RESET_STATI = [
  "in_attesa",
  "approvata",
  "rifiutata",
  "scaduta",
  "usata",
] as const;

export type PasswordResetStato = (typeof PASSWORD_RESET_STATI)[number];

export const RICHIESTA_TTL_HOURS = 24;
export const RESET_TTL_HOURS = 2;

export const passwordResetEmailSchema = z
  .string()
  .trim()
  .email("Email non valida.")
  .max(200);

export const nuovaPasswordSchema = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri.");

export type PasswordResetRichiesta = {
  id: string;
  richiedenteId: string;
  richiedenteEmail: string;
  richiedenteNome: string;
  richiedenteTipo: "operatore" | "superadmin";
  stato: PasswordResetStato;
  decisaDa: string | null;
  decisaAt: string | null;
  approvazioneExpiresAt: string | null;
  resetExpiresAt: string | null;
  createdAt: string;
};

export type SuperAdminLite = {
  id: string;
  email: string;
  fullName: string;
};

function asRow(row: Record<string, unknown>): PasswordResetRichiesta {
  return {
    id: String(row.id),
    richiedenteId: String(row.richiedente_id),
    richiedenteEmail: String(row.richiedente_email ?? ""),
    richiedenteNome: String(row.richiedente_nome ?? ""),
    richiedenteTipo:
      row.richiedente_tipo === "superadmin" ? "superadmin" : "operatore",
    stato: (PASSWORD_RESET_STATI as readonly string[]).includes(
      String(row.stato)
    )
      ? (row.stato as PasswordResetStato)
      : "in_attesa",
    decisaDa: row.decisa_da ? String(row.decisa_da) : null,
    decisaAt: row.decisa_at ? String(row.decisa_at) : null,
    approvazioneExpiresAt: row.approvazione_expires_at
      ? String(row.approvazione_expires_at)
      : null,
    resetExpiresAt: row.reset_expires_at
      ? String(row.reset_expires_at)
      : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function recuperoPasswordImpostaUrl(token: string): string {
  return `${getPublicAppUrl()}/recupero-password/imposta?token=${encodeURIComponent(token)}`;
}

export function recuperoPasswordDecisioneUrl(token: string): string {
  return `${getPublicAppUrl()}/recupero-password/decisione?token=${encodeURIComponent(token)}`;
}

export async function listSuperAdminLites(): Promise<SuperAdminLite[]> {
  const service = createServiceClient();
  const { data: roles } = await service
    .from("app_roles")
    .select("id")
    .eq("code", "superadmin");
  const roleId = roles?.[0]?.id ? String(roles[0].id) : "";
  const { data } = await service
    .from("profiles")
    .select("id, email, full_name, potere, role_id, is_active, stato_operativo")
    .eq("is_active", true)
    .is("deleted_at", null);
  const out: SuperAdminLite[] = [];
  for (const raw of data ?? []) {
    const row = raw as {
      id: string;
      email: string | null;
      full_name: string | null;
      potere?: string | null;
      role_id?: string | null;
      stato_operativo?: string | null;
    };
    const isSa =
      parseProfilePotere(row.potere) === "superadmin" ||
      (roleId && String(row.role_id) === roleId);
    if (!isSa) continue;
    if (parseProfileStatoOperativo(row.stato_operativo) === "bloccato") {
      continue;
    }
    const email = String(row.email ?? "").trim();
    if (!email) continue;
    out.push({
      id: String(row.id),
      email,
      fullName: String(row.full_name ?? "").trim() || email,
    });
  }
  return out;
}

async function findProfileByEmail(email: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  tipo: "operatore" | "superadmin";
  operativo: boolean;
} | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select(
      "id, email, full_name, potere, role_id, is_active, stato_operativo, app_roles(code)"
    )
    .ilike("email", email)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const rawRoles = (
    data as { app_roles?: { code?: string } | { code?: string }[] | null }
  ).app_roles;
  const roleCode = Array.isArray(rawRoles)
    ? rawRoles[0]?.code
    : rawRoles?.code;
  const potere = parseProfilePotere(
    (data as { potere?: string | null }).potere
  );
  const tipo =
    potere === "superadmin" || roleCode === "superadmin"
      ? "superadmin"
      : "operatore";
  const row = data as {
    id: string;
    email: string | null;
    full_name: string | null;
    stato_operativo?: string | null;
  };
  const stato = parseProfileStatoOperativo(row.stato_operativo);
  return {
    id: String(row.id),
    email: String(row.email ?? email),
    fullName: String(row.full_name ?? "").trim() || email,
    tipo,
    operativo: stato === "operativo" || stato === "pre_operativo",
  };
}

async function auditService(input: {
  entityId: string;
  action: string;
  actorId: string | null;
  summary: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("audit_log").insert({
    entity_type: "password_reset_richieste",
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId,
    summary: input.summary,
    payload: input.payload,
  });
  if (error) {
    console.error("[password-reset audit]", error.message);
    try {
      await writeAuditLog({
        entity_type: "password_reset_richieste",
        entity_id: input.entityId,
        action: input.action,
        actor_id: input.actorId,
        summary: input.summary,
        payload: input.payload,
      });
    } catch {
      /* già loggato */
    }
  }
}

export async function createPasswordResetRequest(
  rawEmail: string
): Promise<{ ok: true }> {
  const parsed = passwordResetEmailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: true };
  const email = parsed.data.toLowerCase();
  const profile = await findProfileByEmail(email);
  if (!profile || !profile.operativo) return { ok: true };

  const service = createServiceClient();
  const { data: pending } = await service
    .from("password_reset_richieste")
    .select("id, approvazione_expires_at")
    .eq("richiedente_id", profile.id)
    .eq("stato", "in_attesa")
    .is("deleted_at", null)
    .maybeSingle();
  if (pending?.id) {
    const exp = pending.approvazione_expires_at
      ? new Date(String(pending.approvazione_expires_at))
      : null;
    if (exp && exp > new Date()) return { ok: true };
    await service
      .from("password_reset_richieste")
      .update({
        stato: "scaduta",
        updated_by: profile.id,
      })
      .eq("id", pending.id);
  }

  const approvazioneToken = generateSessionToken();
  const { data: row, error } = await service
    .from("password_reset_richieste")
    .insert({
      richiedente_id: profile.id,
      richiedente_email: profile.email,
      richiedente_nome: profile.fullName,
      richiedente_tipo: profile.tipo,
      stato: "in_attesa",
      approvazione_token_hash: hashSessionToken(approvazioneToken),
      approvazione_expires_at: hoursFromNow(RICHIESTA_TTL_HOURS),
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("*")
    .single();
  if (error || !row) {
    console.error("[password-reset create]", error?.message);
    return { ok: true };
  }

  const superAdmins = await listSuperAdminLites();
  const altri = superAdmins.filter((s) => s.id !== profile.id);

  await auditService({
    entityId: String(row.id),
    action: "create",
    actorId: profile.id,
    summary: `Richiesta recupero password di ${profile.email}`,
    payload: {
      richiedente_tipo: profile.tipo,
      altri_superadmin: altri.length,
    },
  });

  if (altri.length === 0) {
    return { ok: true };
  }

  try {
    await dispatchNotifiche({
      actorId: profile.id,
      recipientIds: altri.map((s) => s.id),
      tipo: "sicurezza",
      title: "Richiesta reimpostazione password",
      body: `${profile.fullName} (${profile.email}) chiede di reimpostare la password.`,
      href: `/app/notifiche?focus=${row.id}`,
      entityType: "password_reset_richieste",
      entityId: String(row.id),
      payload: {
        richiestaId: String(row.id),
        richiedenteNome: profile.fullName,
        richiedenteEmail: profile.email,
        richiedenteTipo: profile.tipo,
      },
    });
  } catch (e) {
    console.error("[password-reset notify]", e);
  }

  if (profile.tipo === "superadmin") {
    const decisioneUrl = recuperoPasswordDecisioneUrl(approvazioneToken);
    for (const sa of altri) {
      try {
        await sendPasswordResetSaDecisionEmail({
          to: sa.email,
          approverName: sa.fullName,
          requesterName: profile.fullName,
          requesterEmail: profile.email,
          decisioneUrl,
        });
      } catch (e) {
        console.error("[password-reset mail sa]", e);
      }
    }
  }

  return { ok: true };
}

export async function loadRichiestaById(
  id: string
): Promise<PasswordResetRichiesta | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("password_reset_richieste")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return asRow(data as Record<string, unknown>);
}

export async function loadRichiestaByApprovazioneToken(
  token: string
): Promise<PasswordResetRichiesta | null> {
  const hash = hashSessionToken(token.trim());
  if (!hash) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("password_reset_richieste")
    .select("*")
    .eq("approvazione_token_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return asRow(data as Record<string, unknown>);
}

export async function loadRichiesteByIds(
  ids: string[]
): Promise<Record<string, PasswordResetRichiesta>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const service = createServiceClient();
  const { data } = await service
    .from("password_reset_richieste")
    .select("*")
    .in("id", unique)
    .is("deleted_at", null);
  const out: Record<string, PasswordResetRichiesta> = {};
  for (const row of data ?? []) {
    const mapped = asRow(row as Record<string, unknown>);
    out[mapped.id] = mapped;
  }
  return out;
}

async function decideRichiesta(input: {
  row: PasswordResetRichiesta;
  approva: boolean;
  actorId: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  if (input.row.stato !== "in_attesa") {
    return { success: false, error: "Questa richiesta è già stata decisa." };
  }
  const exp = input.row.approvazioneExpiresAt
    ? new Date(input.row.approvazioneExpiresAt)
    : null;
  if (exp && exp < new Date()) {
    const service = createServiceClient();
    await service
      .from("password_reset_richieste")
      .update({
        stato: "scaduta",
        updated_by: input.actorId,
      })
      .eq("id", input.row.id);
    return { success: false, error: "Richiesta scaduta." };
  }
  if (input.actorId && input.actorId === input.row.richiedenteId) {
    return {
      success: false,
      error: "Non puoi approvare la tua stessa richiesta.",
    };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();

  if (!input.approva) {
    const { error } = await service
      .from("password_reset_richieste")
      .update({
        stato: "rifiutata",
        decisa_da: input.actorId,
        decisa_at: now,
        updated_by: input.actorId,
        approvazione_token_hash: null,
      })
      .eq("id", input.row.id)
      .eq("stato", "in_attesa");
    if (error) return { success: false, error: error.message };
    await auditService({
      entityId: input.row.id,
      action: "rifiuta",
      actorId: input.actorId,
      summary: `Reset password rifiutato per ${input.row.richiedenteEmail}`,
      payload: { richiedente_id: input.row.richiedenteId },
    });
    return { success: true };
  }

  const resetToken = generateSessionToken();
  const { error } = await service
    .from("password_reset_richieste")
    .update({
      stato: "approvata",
      decisa_da: input.actorId,
      decisa_at: now,
      updated_by: input.actorId,
      reset_token_hash: hashSessionToken(resetToken),
      reset_expires_at: hoursFromNow(RESET_TTL_HOURS),
      approvazione_token_hash: null,
    })
    .eq("id", input.row.id)
    .eq("stato", "in_attesa");
  if (error) return { success: false, error: error.message };

  await auditService({
    entityId: input.row.id,
    action: "approva",
    actorId: input.actorId,
    summary: `Reset password approvato per ${input.row.richiedenteEmail}`,
    payload: { richiedente_id: input.row.richiedenteId },
  });

  try {
    await sendPasswordResetApprovedEmail({
      to: input.row.richiedenteEmail,
      name: input.row.richiedenteNome,
      link: recuperoPasswordImpostaUrl(resetToken),
    });
  } catch (e) {
    console.error("[password-reset mail user]", e);
    return {
      success: false,
      error:
        "Approvata, ma l’invio email è fallito. Riprova o contatta l’assistenza.",
    };
  }
  return { success: true };
}

export async function decidePasswordResetById(input: {
  richiestaId: string;
  approva: boolean;
  actorId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const row = await loadRichiestaById(input.richiestaId);
  if (!row) return { success: false, error: "Richiesta non trovata." };
  return decideRichiesta({
    row,
    approva: input.approva,
    actorId: input.actorId,
  });
}

export async function decidePasswordResetByToken(input: {
  token: string;
  approva: boolean;
  actorId: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const row = await loadRichiestaByApprovazioneToken(input.token);
  if (!row) return { success: false, error: "Link non valido o già usato." };
  return decideRichiesta({
    row,
    approva: input.approva,
    actorId: input.actorId,
  });
}

export async function previewResetPasswordToken(token: string): Promise<
  | { success: true; email: string; name: string }
  | { success: false; error: string }
> {
  const hash = hashSessionToken(token.trim());
  if (!hash) return { success: false, error: "Link non valido o scaduto." };
  const service = createServiceClient();
  const { data } = await service
    .from("password_reset_richieste")
    .select("*")
    .eq("reset_token_hash", hash)
    .eq("stato", "approvata")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { success: false, error: "Link non valido o scaduto." };
  const row = asRow(data as Record<string, unknown>);
  const exp = row.resetExpiresAt ? new Date(row.resetExpiresAt) : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Invia una nuova richiesta." };
  }
  return {
    success: true,
    email: row.richiedenteEmail,
    name: row.richiedenteNome || "Operatore",
  };
}

export async function setPasswordFromResetToken(input: {
  token: string;
  password: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const hash = hashSessionToken(input.token.trim());
  if (!hash) return { success: false, error: "Link non valido o scaduto." };
  const pw = nuovaPasswordSchema.safeParse(input.password);
  if (!pw.success) {
    return { success: false, error: pw.error.issues[0]?.message ?? "Password non valida." };
  }
  const service = createServiceClient();
  const { data } = await service
    .from("password_reset_richieste")
    .select("*")
    .eq("reset_token_hash", hash)
    .eq("stato", "approvata")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { success: false, error: "Link non valido o scaduto." };
  const row = asRow(data as Record<string, unknown>);
  const exp = row.resetExpiresAt ? new Date(row.resetExpiresAt) : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Invia una nuova richiesta." };
  }

  const { error: updAuth } = await service.auth.admin.updateUserById(
    row.richiedenteId,
    { password: pw.data }
  );
  if (updAuth) return { success: false, error: updAuth.message };

  const now = new Date().toISOString();
  const { error: updReq } = await service
    .from("password_reset_richieste")
    .update({
      stato: "usata",
      reset_token_hash: null,
      updated_by: row.richiedenteId,
    })
    .eq("id", row.id);
  if (updReq) return { success: false, error: updReq.message };

  await service
    .from("profiles")
    .update({
      password_impostata_at: now,
    })
    .eq("id", row.richiedenteId);

  await auditService({
    entityId: row.id,
    action: "password_impostata",
    actorId: row.richiedenteId,
    summary: `Nuova password impostata da recupero (${row.richiedenteEmail})`,
    payload: { email: row.richiedenteEmail },
  });
  return { success: true };
}
