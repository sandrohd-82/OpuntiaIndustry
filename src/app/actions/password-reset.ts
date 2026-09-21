"use server";

import { z } from "zod";
import {
  createPasswordResetRequest,
  decidePasswordResetById,
  decidePasswordResetByToken,
  loadRichiestaByApprovazioneToken,
  loadRichiesteByIds,
  nuovaPasswordSchema,
  previewResetPasswordToken,
  setPasswordFromResetToken,
  type PasswordResetRichiesta,
} from "@/lib/auth/password-reset";
import { getAuthContext, getAuthUser } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";

const GENERIC_OK =
  "Se l’email è associata a un profilo, la richiesta è stata inoltrata.";

export async function requestPasswordResetAction(
  formData: FormData
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const email = String(formData.get("email") ?? "");
  const parsed = z.string().trim().email("Inserisci un’email valida.").safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Email non valida." };
  }
  await createPasswordResetRequest(parsed.data);
  return { success: true, message: GENERIC_OK };
}

export async function previewPasswordResetDecisioneAction(
  token: string
): Promise<
  | { success: true; richiesta: PasswordResetRichiesta }
  | { success: false; error: string }
> {
  const row = await loadRichiestaByApprovazioneToken(token);
  if (!row) return { success: false, error: "Link non valido o già usato." };
  if (row.stato !== "in_attesa") {
    return { success: false, error: "Questa richiesta è già stata decisa." };
  }
  const exp = row.approvazioneExpiresAt
    ? new Date(row.approvazioneExpiresAt)
    : null;
  if (exp && exp < new Date()) {
    return { success: false, error: "Link scaduto." };
  }
  return { success: true, richiesta: row };
}

export async function decidePasswordResetTokenAction(input: {
  token: string;
  approva: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const token = String(input.token ?? "").trim();
  if (!token) return { success: false, error: "Link non valido." };
  const user = await getAuthUser();
  return decidePasswordResetByToken({
    token,
    approva: input.approva,
    actorId: user?.id ?? null,
  });
}

export async function listPasswordResetRichiesteAction(
  ids: string[]
): Promise<Record<string, PasswordResetRichiesta>> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified || !isSuperadminProfile(auth.profile)) {
    return {};
  }
  return loadRichiesteByIds(ids);
}

export async function decidePasswordResetInboxAction(input: {
  richiestaId: string;
  approva: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato." };
  }
  if (!isSuperadminProfile(auth.profile)) {
    return { success: false, error: "Solo un Super Admin può decidere." };
  }
  const id = z.string().uuid().safeParse(input.richiestaId);
  if (!id.success) return { success: false, error: "Richiesta non valida." };
  return decidePasswordResetById({
    richiestaId: id.data,
    approva: input.approva,
    actorId: auth.userId,
  });
}

export async function previewPasswordResetImpostaAction(token: string): Promise<
  | { success: true; email: string; name: string }
  | { success: false; error: string }
> {
  return previewResetPasswordToken(token);
}

export async function setPasswordResetAction(
  formData: FormData
): Promise<{ success: true; redirectTo: string } | { success: false; error: string }> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { success: false, error: "Link non valido." };
  if (password !== confirm) {
    return { success: false, error: "Le password non coincidono." };
  }
  const pw = nuovaPasswordSchema.safeParse(password);
  if (!pw.success) {
    return { success: false, error: pw.error.issues[0]?.message ?? "Password non valida." };
  }
  const result = await setPasswordFromResetToken({ token, password: pw.data });
  if (!result.success) return result;
  return { success: true, redirectTo: "/login" };
}
