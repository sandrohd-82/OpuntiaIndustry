"use server";

import { getAuthContext } from "@/lib/auth/session";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";

export async function misuraContestoAction(): Promise<
  | { success: true; contestoMs: number; origine: "locale" | "produzione" }
  | { success: false }
> {
  const inizio = performance.now();
  const auth = await getAuthContext();
  const contestoMs = Math.round(performance.now() - inizio);
  if (!auth || !isUnrestrictedSuperadmin(auth)) return { success: false };
  return {
    success: true,
    contestoMs,
    origine: process.env.VERCEL ? "produzione" : "locale",
  };
}
