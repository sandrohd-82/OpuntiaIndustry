"use server";

import { z } from "zod";
import { getAuthContext, getAuthUser } from "@/lib/auth/session";
import { NOTIFICA_TIPI } from "@/lib/notifiche/types";
import { createClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(8).max(500),
    auth: z.string().min(4).max(200),
  }),
  userAgent: z.string().max(400).optional(),
});

export async function countUnreadNotificheAction(tipo?: string): Promise<{
  success: true;
  totale: number;
  perTipo: Record<string, number>;
} | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const supabase = await createClient();
  let q = supabase
    .from("app_notifiche")
    .select("tipo")
    .eq("recipient_id", auth.userId)
    .is("deleted_at", null)
    .is("read_at", null);
  if (tipo && (NOTIFICA_TIPI as readonly string[]).includes(tipo)) {
    q = q.eq("tipo", tipo);
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const perTipo: Record<string, number> = {};
  for (const row of data ?? []) {
    const t = String(row.tipo);
    perTipo[t] = (perTipo[t] ?? 0) + 1;
  }
  return {
    success: true,
    totale: (data ?? []).length,
    perTipo,
  };
}

export async function markNotificheReadAction(input: {
  tipo?: string;
  entityId?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  let q = supabase
    .from("app_notifiche")
    .update({
      read_at: now,
      read_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("recipient_id", auth.userId)
    .is("deleted_at", null)
    .is("read_at", null);
  if (input.tipo && (NOTIFICA_TIPI as readonly string[]).includes(input.tipo)) {
    q = q.eq("tipo", input.tipo);
  }
  if (input.entityId) {
    q = q.eq("entity_id", input.entityId);
  }
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function savePushSubscriptionAction(input: unknown): Promise<
  { success: true } | { success: false; error: string }
> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: "Non autenticato" };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Sottoscrizione non valida" };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("app_push_subscriptions")
    .select("id, deleted_at")
    .eq("endpoint", parsed.data.endpoint)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from("app_push_subscriptions")
      .update({
        user_id: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: parsed.data.userAgent ?? null,
        deleted_at: null,
        deleted_by: null,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
  const { error } = await supabase.from("app_push_subscriptions").insert({
    user_id: user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: parsed.data.userAgent ?? null,
    platform: "web",
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function vapidPublicKeyAction(): Promise<string | null> {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}
