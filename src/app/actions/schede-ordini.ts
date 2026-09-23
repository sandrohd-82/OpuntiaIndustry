"use server";

import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import {
  backfillSchedeDaScaletta,
  listSchedeByStato,
  loadSchedaDettaglio,
  trasferisciSchedeCompleteScadute,
} from "@/lib/produzione/schede-ordini-store";
import type { SchedaDettaglio, SchedaOrdine } from "@/lib/produzione/schede-ordini";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function listSchedeOrdiniAction(
  vista: "aperte" | "complete" | "archivio"
): Promise<
  | { success: true; schede: SchedaOrdine[] }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = z.enum(["aperte", "complete", "archivio"]).safeParse(vista);
  if (!parsed.success) {
    return { success: false, error: "Vista schede non valida." };
  }
  const supabase = await createClient();
  try {
    await backfillSchedeDaScaletta(supabase, auth.userId);
    if (parsed.data !== "archivio") {
      await trasferisciSchedeCompleteScadute(supabase, auth.userId);
    }
    const stato =
      parsed.data === "aperte"
        ? "aperta"
        : parsed.data === "complete"
          ? "completa"
          : "archiviata";
    const schede = await listSchedeByStato(supabase, stato);
    return { success: true, schede };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Elenco schede non disponibile.",
    };
  }
}

export async function getSchedaOrdineDettaglioAction(
  schedaId: string
): Promise<
  | { success: true; dettaglio: SchedaDettaglio }
  | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  if (!z.string().uuid().safeParse(schedaId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const supabase = await createClient();
  const det = await loadSchedaDettaglio(supabase, schedaId);
  if (!det) return { success: false, error: "Scheda non trovata." };
  return { success: true, dettaglio: det };
}
