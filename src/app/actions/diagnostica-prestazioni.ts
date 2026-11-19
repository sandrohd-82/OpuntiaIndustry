"use server";

import { getAuthContext } from "@/lib/auth/session";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";

export async function misuraContestoAction(): Promise<
  | {
      success: true;
      contestoMs: number;
      azioneMs: number;
      istanzaMs: number;
      origine: "locale" | "produzione";
    }
  | { success: false }
> {
  const inizioAzione = performance.now();
  const istanzaMs = Math.round(process.uptime() * 1000);
  const inizioContesto = performance.now();
  const auth = await getAuthContext();
  const contestoMs = Math.round(performance.now() - inizioContesto);
  if (!auth || !isUnrestrictedSuperadmin(auth)) return { success: false };
  return {
    success: true,
    contestoMs,
    azioneMs: Math.round(performance.now() - inizioAzione),
    istanzaMs,
    origine: process.env.VERCEL ? "produzione" : "locale",
  };
}
