"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthUser, getProfile, getUserAreas } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { firstAreaPath } from "@/lib/areas/config";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/two-factor";
import { primoAccessoUrl } from "@/lib/auth/app-url";
import { sendPrimoAccessoEmail } from "@/lib/email/primo-accesso";
import {
  parseProfileStatoOperativo,
  type ProfileStatoOperativo,
} from "@/lib/auth/stato-operativo";

export type ImpersonationTarget = {
  id: string;
  email: string;
  label: string;
  roleName: string;
  stato: ProfileStatoOperativo;
};

function profileLabel(p: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const composed = [p.first_name, p.last_name]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return (p.full_name || composed || p.email || "Operatore").trim();
}

async function requireRealSuperadmin() {
  const user = await getAuthUser();
  if (!user) {
    return { ok: false as const, error: "Non autenticato." };
  }
  const actor = await getProfile(user.id);
  if (!actor || !isSuperadminProfile(actor)) {
    return { ok: false as const, error: "Solo il Super Admin può cambiare profilo." };
  }
  return { ok: true as const, actorUserId: user.id, actor };
}

export async function listImpersonationTargetsAction(): Promise<
  | { success: true; targets: ImpersonationTarget[] }
  | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, stato_operativo, app_roles(code, name)")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return { success: false, error: error.message };

  const targets: ImpersonationTarget[] = [];
  for (const row of data ?? []) {
    const role = row.app_roles as
      | { code?: string; name?: string }
      | { code?: string; name?: string }[]
      | null;
    const roleObj = Array.isArray(role) ? role[0] : role;
    if (roleObj?.code === "superadmin") continue;
    if (String(row.id) === gate.actorUserId) continue;
    targets.push({
      id: String(row.id),
      email: String(row.email ?? ""),
      label: profileLabel(row),
      roleName: String(roleObj?.name ?? "Operatore"),
      stato: parseProfileStatoOperativo(row.stato_operativo),
    });
  }
  targets.sort((a, b) => a.label.localeCompare(b.label, "it"));
  return { success: true, targets };
}

async function endActiveSessions(
  actorUserId: string,
  endedBy: string
): Promise<number> {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await service
    .from("impersonation_sessions")
    .update({
      ended_at: now,
      ended_by: endedBy,
      updated_by: endedBy,
    })
    .eq("actor_user_id", actorUserId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .select("id");
  return data?.length ?? 0;
}

export async function startImpersonationAction(
  targetUserId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = z.string().uuid().safeParse(targetUserId);
  if (!parsed.success) {
    return { success: false, error: "Profilo non valido." };
  }
  if (parsed.data === gate.actorUserId) {
    return { success: false, error: "Sei già su questo profilo." };
  }

  const serviceLookup = createServiceClient();
  const { data: targetRow } = await serviceLookup
    .from("profiles")
    .select("*, app_roles(id, code, name, description)")
    .eq("id", parsed.data)
    .eq("is_active", true)
    .maybeSingle();
  if (!targetRow) {
    return { success: false, error: "Operatore non trovato o non attivo." };
  }
  const target = targetRow as Awaited<ReturnType<typeof getProfile>>;
  if (!target || isSuperadminProfile(target)) {
    return { success: false, error: "Non puoi entrare nel profilo di un altro Super Admin." };
  }

  await writeAuditLog({
    entity_type: "impersonation_sessions",
    entity_id: parsed.data,
    action: "impersonate_start",
    actor_id: gate.actorUserId,
    summary: `Super Admin opera come ${profileLabel(target)} (${target.email})`,
    payload: {
      actor_user_id: gate.actorUserId,
      target_user_id: parsed.data,
    },
  });

  const service = createServiceClient();
  await endActiveSessions(gate.actorUserId, gate.actorUserId);

  const { error } = await service.from("impersonation_sessions").insert({
    actor_user_id: gate.actorUserId,
    target_user_id: parsed.data,
    created_by: gate.actorUserId,
    updated_by: gate.actorUserId,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  const areas = await getUserAreas(parsed.data);
  const dest = firstAreaPath(areas) ?? "/app/dashboard";
  redirect(dest);
}

export async function stopImpersonationAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const closed = await endActiveSessions(gate.actorUserId, gate.actorUserId);
  if (closed === 0) {
    return { success: false, error: "Nessuno switch attivo." };
  }

  await writeAuditLog({
    entity_type: "impersonation_sessions",
    entity_id: gate.actorUserId,
    action: "impersonate_stop",
    actor_id: gate.actorUserId,
    summary: "Super Admin è tornato al proprio profilo",
    payload: { actor_user_id: gate.actorUserId },
  });

  revalidatePath("/", "layout");
  redirect("/app/dashboard");
}

export async function endImpersonationOnLogout(
  actorUserId: string
): Promise<void> {
  try {
    await endActiveSessions(actorUserId, actorUserId);
  } catch {
    // il logout non deve fallire
  }
}

export async function setProfileStatoOperativoAction(
  stato: string
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireRealSuperadmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = z
    .enum(["test", "operativo", "sospeso", "bloccato"])
    .safeParse(stato);
  if (!parsed.success) {
    return { success: false, error: "Stato non valido." };
  }

  const service = createServiceClient();
  const { data: session } = await service
    .from("impersonation_sessions")
    .select("target_user_id")
    .eq("actor_user_id", gate.actorUserId)
    .is("ended_at", null)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const targetId = session?.target_user_id
    ? String(session.target_user_id)
    : "";
  if (!targetId) {
    return {
      success: false,
      error: "Entra nel profilo con lo switch per cambiare lo stato.",
    };
  }

  const { data: target, error: tErr } = await service
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, stato_operativo, password_impostata_at, app_roles(code)"
    )
    .eq("id", targetId)
    .maybeSingle();
  if (tErr || !target) {
    return { success: false, error: tErr?.message ?? "Profilo non trovato." };
  }
  const role = target.app_roles as { code?: string } | { code?: string }[] | null;
  const roleCode = Array.isArray(role) ? role[0]?.code : role?.code;
  if (roleCode === "superadmin") {
    return { success: false, error: "Non puoi modificare lo stato di un Super Admin." };
  }

  const previous = parseProfileStatoOperativo(target.stato_operativo);
  const now = new Date().toISOString();

  if (parsed.data === "operativo" && previous === "test") {
    const alreadyHasPassword = Boolean(target.password_impostata_at);
    let link = "";
    if (!alreadyHasPassword) {
      const token = generateSessionToken();
      const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: tokErr } = await service
        .from("profiles")
        .update({
          primo_accesso_token_hash: hashSessionToken(token),
          primo_accesso_expires_at: expires,
        })
        .eq("id", targetId);
      if (tokErr) return { success: false, error: tokErr.message };
      link = primoAccessoUrl(token);
    }

    try {
      await sendPrimoAccessoEmail({
        to: String(target.email ?? ""),
        fullName: profileLabel(target),
        loginEmail: String(target.email ?? ""),
        link,
        alreadyHasPassword,
      });
    } catch (mailError) {
      console.error("sendPrimoAccessoEmail failed:", mailError);
      await service
        .from("profiles")
        .update({
          primo_accesso_token_hash: null,
          primo_accesso_expires_at: null,
        })
        .eq("id", targetId);
      return {
        success: false,
        error:
          "Impossibile inviare la mail di attivazione. Lo stato resta in Test. Verifica SMTP.",
      };
    }
  }

  const updatePayload: Record<string, unknown> = {
    stato_operativo: parsed.data,
    stato_operativo_at: now,
    stato_operativo_by: gate.actorUserId,
  };
  if (parsed.data === "operativo" && previous === "test") {
    updatePayload.attivato_at = now;
    updatePayload.attivato_by = gate.actorUserId;
  }

  const { error } = await service
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetId);
  if (error) return { success: false, error: error.message };

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: targetId,
    action: "stato_operativo",
    actor_id: gate.actorUserId,
    summary: `Stato profilo ${profileLabel(target)} impostato a ${parsed.data}`,
    payload: {
      target_user_id: targetId,
      stato_operativo: parsed.data,
      previous,
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}
