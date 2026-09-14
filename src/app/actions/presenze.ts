"use server";

import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { todayRomeDate } from "@/lib/auth/data-scope";
import { peekDicEnv } from "@/lib/hr/dipendenti-in-cloud";
import {
  listPresenzeSchema,
  summarizePresenze,
  type PresenzaGiorno,
} from "@/lib/hr/presenze";
import {
  listPresenzeGiorno,
  syncPresenzeGiorno,
} from "@/lib/hr/presenze-sync";

export async function getPresenzeEnvAction(): Promise<{
  configured: boolean;
  companyIdPreview: string;
}> {
  await requireAnyAreaAccess(["amministrazione", "hr"]);
  const env = peekDicEnv();
  return {
    configured: env.hasKey && env.hasCompanyId,
    companyIdPreview: env.companyIdPreview,
  };
}

export async function listPresenzeOggiAction(
  raw?: unknown
): Promise<
  | {
      success: true;
      giorno: string;
      items: PresenzaGiorno[];
      summary: ReturnType<typeof summarizePresenze>;
      lastSyncedAt: string | null;
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "hr"]);
  const parsed = listPresenzeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Filtro non valido." };
  }
  const giorno = parsed.data.giorno || todayRomeDate();
  const listed = await listPresenzeGiorno(giorno);
  if (!listed.success) return listed;
  const lastSyncedAt = listed.items.reduce<string | null>((acc, row) => {
    if (!acc || row.lastSyncedAt > acc) return row.lastSyncedAt;
    return acc;
  }, null);
  return {
    success: true,
    giorno,
    items: listed.items,
    summary: summarizePresenze(listed.items),
    lastSyncedAt,
  };
}

export async function syncPresenzeAction(
  raw?: unknown
): Promise<
  | { success: true; giorno: string; fetched: number; upserted: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "hr"]);
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      success: false,
      error: "Solo amministratore o Super Admin può sincronizzare le presenze.",
    };
  }
  const parsed = listPresenzeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Data non valida." };
  }
  return syncPresenzeGiorno({
    giorno: parsed.data.giorno || todayRomeDate(),
    actorId: auth.userId,
  });
}
