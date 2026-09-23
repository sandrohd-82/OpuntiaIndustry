"use server";

import {
  requireOrdineProcessAccess,
  requireOrdineReadAccess,
} from "@/lib/auth/ordini-access";
import {
  backfillSchedeDaScaletta,
  ensureSchedaOrdine,
  listSchedeByStato,
  loadSchedaDettaglio,
  loadSchedaSpedizione,
  trasferisciSchedeCompleteScadute,
} from "@/lib/produzione/schede-ordini-store";
import type { SchedaDettaglio, SchedaOrdine } from "@/lib/produzione/schede-ordini";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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
  await requireOrdineReadAccess();
  if (!z.string().uuid().safeParse(schedaId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const supabase = await createClient();
  const det = await loadSchedaDettaglio(supabase, schedaId);
  if (!det) return { success: false, error: "Scheda non trovata." };
  const spedizione = await loadSchedaSpedizione(supabase, det.scheda);
  return { success: true, dettaglio: { ...det, spedizione } };
}

export async function openSchedaFromTimelineAction(input: {
  schedaId?: string | null;
  ordineId?: string | null;
  campionaturaId?: string | null;
}): Promise<{ success: true; schedaId: string } | { success: false; error: string }> {
  const { auth } = await requireOrdineReadAccess();
  if (input.schedaId && z.string().uuid().safeParse(input.schedaId).success) {
    return { success: true, schedaId: input.schedaId };
  }
  const ordineId = input.ordineId || null;
  const campionaturaId = input.campionaturaId || null;
  if (!ordineId && !campionaturaId) {
    return { success: false, error: "Scheda ordine non collegata." };
  }
  const service = createServiceClient();
  let numero = "SO";
  let cliente = "";
  let prodotto = "";
  if (ordineId) {
    const { data } = await service
      .from("ordini")
      .select("numero_interno, cliente_ragione_sociale")
      .eq("id", ordineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Ordine non trovato." };
    numero = String(data.numero_interno ?? "SO");
    cliente = String(data.cliente_ragione_sociale ?? "");
  } else if (campionaturaId) {
    const { data } = await service
      .from("campionature")
      .select("numero_interno, cliente_ragione_sociale")
      .eq("id", campionaturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Campionatura non trovata." };
    numero = String(data.numero_interno ?? "SO");
    cliente = String(data.cliente_ragione_sociale ?? "");
  }
  const scheda = await ensureSchedaOrdine(service, {
    ordineId,
    campionaturaId,
    numero,
    cliente,
    prodotto,
    userId: auth.userId,
  });
  if (!scheda) return { success: false, error: "Scheda ordine non creata." };
  return { success: true, schedaId: scheda.id };
}
