"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getProfile } from "@/lib/auth/session";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpUri,
  verifyTotpCode,
} from "@/lib/auth/totp";
import type { UserSecondFactorUpdate } from "@/types/database";

export type TotpActionResult = {
  success: boolean;
  error?: string;
  /** Secret in chiaro solo durante l'enrollment (mai persistito in client storage) */
  secret?: string;
  otpauthUrl?: string;
  enabled?: boolean;
};

async function requireSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Sessione non valida." as const, user: null, profile: null };
  }

  const profile = await getProfile(user.id);
  if (!profile || !isSuperadminProfile(profile)) {
    return {
      error: "Solo il superadmin può configurare Google Authenticator." as const,
      user: null,
      profile: null,
    };
  }

  return { error: null, user, profile };
}

export async function getTotpStatus(): Promise<TotpActionResult> {
  const gate = await requireSuperadmin();
  if (gate.error || !gate.user) {
    return { success: false, error: gate.error ?? "Accesso negato." };
  }

  const service = createServiceClient();
  const { data } = await service
    .from("user_second_factor")
    .select("method, totp_secret_encrypted, verified_at")
    .eq("user_id", gate.user.id)
    .maybeSingle();

  return {
    success: true,
    enabled: data?.method === "app" && Boolean(data?.totp_secret_encrypted),
  };
}

/** Avvia enrollment: genera secret e lo salva cifrato (metodo resta email fino a conferma) */
export async function startTotpEnrollment(): Promise<TotpActionResult> {
  try {
    const gate = await requireSuperadmin();
    if (gate.error || !gate.user?.email) {
      return { success: false, error: gate.error ?? "Accesso negato." };
    }

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const service = createServiceClient();

    const update: UserSecondFactorUpdate = {
      totp_secret_encrypted: encrypted,
      // Resta email finché non conferma il primo codice
      method: "email",
      updated_at: new Date().toISOString(),
    };

    const { error } = await service
      .from("user_second_factor")
      .upsert(
        {
          user_id: gate.user.id,
          ...update,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      return {
        success: false,
        error: `Impossibile avviare la configurazione. (${error.message})`,
      };
    }

    return {
      success: true,
      secret,
      otpauthUrl: totpUri(secret, gate.user.email),
      enabled: false,
    };
  } catch (error) {
    console.error("startTotpEnrollment failed:", error);
    return {
      success: false,
      error: "Errore durante la generazione del secret Authenticator.",
    };
  }
}

/** Conferma con un codice dall'app → attiva method = app */
export async function confirmTotpEnrollment(
  formData: FormData
): Promise<TotpActionResult> {
  try {
    const gate = await requireSuperadmin();
    if (gate.error || !gate.user) {
      return { success: false, error: gate.error ?? "Accesso negato." };
    }

    const code = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return { success: false, error: "Inserisci il codice a 6 cifre dall'app." };
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("user_second_factor")
      .select("totp_secret_encrypted")
      .eq("user_id", gate.user.id)
      .single();

    if (error || !data?.totp_secret_encrypted) {
      return {
        success: false,
        error: "Nessuna configurazione in corso. Avvia di nuovo l'enrollment.",
      };
    }

    const secret = decryptTotpSecret(data.totp_secret_encrypted);
    if (!verifyTotpCode(secret, code)) {
      return { success: false, error: "Codice non corretto. Riprova." };
    }

    const update: UserSecondFactorUpdate = {
      method: "app",
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await service
      .from("user_second_factor")
      .update(update)
      .eq("user_id", gate.user.id);

    if (updateError) {
      return {
        success: false,
        error: `Attivazione fallita. (${updateError.message})`,
      };
    }

    return { success: true, enabled: true };
  } catch (error) {
    console.error("confirmTotpEnrollment failed:", error);
    return { success: false, error: "Errore durante la conferma Authenticator." };
  }
}

/** Disattiva Google Authenticator e torna a OTP email */
export async function disableTotp(): Promise<TotpActionResult> {
  try {
    const gate = await requireSuperadmin();
    if (gate.error || !gate.user) {
      return { success: false, error: gate.error ?? "Accesso negato." };
    }

    const service = createServiceClient();
    const update: UserSecondFactorUpdate = {
      method: "email",
      totp_secret_encrypted: null,
      verified_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await service
      .from("user_second_factor")
      .update(update)
      .eq("user_id", gate.user.id);

    if (error) {
      return {
        success: false,
        error: `Disattivazione fallita. (${error.message})`,
      };
    }

    return { success: true, enabled: false };
  } catch (error) {
    console.error("disableTotp failed:", error);
    return { success: false, error: "Errore durante la disattivazione." };
  }
}
