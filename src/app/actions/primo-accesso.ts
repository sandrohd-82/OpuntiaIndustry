"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendEmailOtp } from "@/app/actions/auth";
import { hashSessionToken } from "@/lib/auth/two-factor";
import { getAuthUser } from "@/lib/auth/session";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const passwordSchema = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri.");

export async function previewPrimoAccessoAction(token: string): Promise<
  | { success: true; email: string; name: string }
  | { success: false; error: string }
> {
  const hash = hashSessionToken(token.trim());
  if (!hash) return { success: false, error: "Link non valido o scaduto." };

  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("email, full_name, primo_accesso_expires_at, stato_operativo")
    .eq("primo_accesso_token_hash", hash)
    .maybeSingle();

  if (!data) {
    return { success: false, error: "Link non valido o scaduto." };
  }
  const stato = parseProfileStatoOperativo(data.stato_operativo);
  if (stato !== "operativo") {
    return { success: false, error: "Profilo non ancora operativo." };
  }
  const exp = data.primo_accesso_expires_at
    ? new Date(String(data.primo_accesso_expires_at))
    : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Contatta il Super Admin." };
  }

  return {
    success: true,
    email: String(data.email ?? ""),
    name: String(data.full_name ?? "").trim() || "Operatore",
  };
}

export async function setPrimoAccessoPasswordAction(
  formData: FormData
): Promise<
  { success: true; redirectTo: string } | { success: false; error: string }
> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { success: false, error: "Link non valido." };
  if (password !== confirm) {
    return { success: false, error: "Le password non coincidono." };
  }
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) {
    return { success: false, error: pw.error.issues[0]?.message ?? "Password non valida." };
  }

  const hash = hashSessionToken(token);
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, email, stato_operativo, primo_accesso_expires_at")
    .eq("primo_accesso_token_hash", hash)
    .maybeSingle();

  if (!profile?.id || !profile.email) {
    return { success: false, error: "Link non valido o scaduto." };
  }
  if (parseProfileStatoOperativo(profile.stato_operativo) !== "operativo") {
    return { success: false, error: "Profilo non operativo." };
  }
  const exp = profile.primo_accesso_expires_at
    ? new Date(String(profile.primo_accesso_expires_at))
    : null;
  if (!exp || exp < new Date()) {
    return { success: false, error: "Link scaduto. Contatta il Super Admin." };
  }

  const { error: updAuth } = await service.auth.admin.updateUserById(
    String(profile.id),
    { password: pw.data }
  );
  if (updAuth) return { success: false, error: updAuth.message };

  const now = new Date().toISOString();
  const { error: updProf } = await service
    .from("profiles")
    .update({
      password_impostata_at: now,
      primo_accesso_token_hash: null,
      primo_accesso_expires_at: null,
    })
    .eq("id", profile.id);
  if (updProf) return { success: false, error: updProf.message };

  await service.from("audit_log").insert({
    entity_type: "profiles",
    entity_id: String(profile.id),
    action: "primo_accesso_password",
    actor_id: String(profile.id),
    summary: "Password impostata al primo accesso",
    payload: { email: profile.email },
  });

  await service.from("user_second_factor").upsert(
    {
      user_id: String(profile.id),
      method: "email",
      totp_secret_encrypted: null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: String(profile.email),
    password: pw.data,
  });
  if (signErr) {
    return {
      success: false,
      error:
        "Password salvata. Accedi dal login: riceverai un codice OTP via email.",
    };
  }

  const otpResult = await sendEmailOtp("accesso");
  if (!otpResult.success) {
    return {
      success: false,
      error:
        otpResult.error ??
        "Password salvata. Accedi dal login per ricevere l'OTP via email.",
    };
  }

  return { success: true, redirectTo: "/verify-email" };
}

export async function markWelcomeSeenAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: "Non autenticato." };

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ welcome_visto_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("welcome_visto_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
