import { isTestImpersonation } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import type { AuthContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export type WebmailAccountVisibility =
  | { mode: "all" }
  | { mode: "granted"; ids: string[] };

/** In test, il Super Admin assegna le caselle con On/Off. */
export function isWebmailGrantAssignMode(auth: AuthContext): boolean {
  return isSuperadminProfile(auth.actorProfile) && isTestImpersonation(auth);
}

/** Super Admin sul proprio profilo: vede e gestisce tutte le caselle. */
export function seesAllWebmailAccounts(auth: AuthContext): boolean {
  return isSuperadminProfile(auth.profile) && !auth.impersonating;
}

export async function loadWebmailGrantedAccountIds(
  userId: string
): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_account_grants")
    .select("account_id")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) return [];
  return (data ?? []).map((g) => String(g.account_id));
}

/**
 * Catalogo (test) e Super Admin reale: tutte.
 * Operatore / pre-operativo / operativo: solo grant On.
 */
export async function resolveWebmailAccountVisibility(
  auth: AuthContext
): Promise<WebmailAccountVisibility> {
  if (seesAllWebmailAccounts(auth) || isWebmailGrantAssignMode(auth)) {
    return { mode: "all" };
  }
  return {
    mode: "granted",
    ids: await loadWebmailGrantedAccountIds(auth.userId),
  };
}

export async function canUseWebmailAccount(
  auth: AuthContext,
  accountId: string
): Promise<boolean> {
  const vis = await resolveWebmailAccountVisibility(auth);
  if (vis.mode === "all") return true;
  return vis.ids.includes(accountId);
}

export async function assertWebmailAccountAccess(
  auth: AuthContext,
  accountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await canUseWebmailAccount(auth, accountId)) return { ok: true };
  return {
    ok: false,
    error: "Casella non autorizzata per questo operatore.",
  };
}
