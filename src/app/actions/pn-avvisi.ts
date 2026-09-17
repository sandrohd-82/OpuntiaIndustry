"use server";

import { getAuthContext } from "@/lib/auth/session";
import {
  fireDuePnAvvisi,
  listPendingAvvisiForUser,
  type DueAvvisoRow,
} from "@/lib/promemorie-e-note/avvisi-fire";
import { z } from "zod";

export type { DueAvvisoRow };

export async function listMieiAvvisiPendentiAction(): Promise<
  | { success: true; items: DueAvvisoRow[] }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const items = await listPendingAvvisiForUser({ userId: auth.userId });
  return { success: true, items };
}

const ackSchema = z.object({
  avvisoId: z.string().uuid(),
});

export async function ackAvvisoAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const parsed = ackSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  await fireDuePnAvvisi({ actorId: auth.userId, limit: 40 });
  return { success: true };
}

export async function pollDueAvvisiAction(): Promise<
  | { success: true; fired: number }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Non autenticato" };
  }
  const res = await fireDuePnAvvisi({ actorId: auth.userId, limit: 20 });
  return { success: true, fired: res.fired };
}
