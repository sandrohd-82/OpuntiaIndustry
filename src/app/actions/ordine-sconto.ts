"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrdineCreateAccess, requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import { loadCommercialLineageUserIds } from "@/lib/auth/commerciale-lineage";
import { createClient } from "@/lib/supabase/server";
import { mapOrdineRow, type Ordine } from "@/lib/amministrazione/ordini";
import { isScontoFascia } from "@/lib/amministrazione/sconto-fuori-listino";
import {
  loadClienteCommercialeId,
  loadScontoOperatoreCtx,
  notifyScontoDaApprovare,
  recomputeScontoApprovazione,
  ruoloApprovazionePossibile,
  insertApprovazioneSconto,
} from "@/lib/amministrazione/sconto-fuori-listino-server";
import type { OrdineRigaRow, OrdineRow } from "@/types/database";

export async function getScontoFuoriListinoContextAction(): Promise<
  | { success: true; isSuperadmin: boolean; isSenior: boolean; canOltre30: boolean }
  | { success: false; error: string }
> {
  try {
    const { auth } = await requireOrdineCreateAccess();
    const ctx = await loadScontoOperatoreCtx(auth.userId);
    return { success: true, ...ctx };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Contesto sconto non disponibile.",
    };
  }
}

export async function approveOrdineScontoAction(
  ordineIdRaw: string
): Promise<{ success: true; ordine: Ordine } | { success: false; error: string }> {
  const { auth } = await requireOrdineReadAccess();
  const ordineId = String(ordineIdRaw ?? "").trim();
  if (!ordineId) return { success: false, error: "Ordine non indicato." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Ordine non trovato." };
  }
  const typed = row as OrdineRow;
  const fascia = isScontoFascia(typed.sconto_fascia)
    ? typed.sconto_fascia
    : "nessuno";
  if (typed.sconto_approvazione_stato !== "in_attesa") {
    return {
      success: false,
      error: "Questo ordine non è in attesa di approvazione sconto.",
    };
  }

  const ctx = await loadScontoOperatoreCtx(auth.userId);
  const commercialeId = await loadClienteCommercialeId(typed.cliente_id);
  let isSeniorLinea = false;
  if (ctx.isSenior && commercialeId) {
    const tree = await loadCommercialLineageUserIds(auth.userId);
    isSeniorLinea = tree.includes(commercialeId);
  }
  const ruolo = ruoloApprovazionePossibile({
    isSuperadmin: ctx.isSuperadmin,
    isSeniorLinea,
  });
  if (!ruolo) {
    return {
      success: false,
      error:
        "Non sei autorizzato ad approvare questo sconto. Serve un commerciale Senior della linea o un Super Admin.",
    };
  }

  const insErr = await insertApprovazioneSconto({
    ordineId,
    ruolo,
    actorId: auth.userId,
  });
  if (insErr) return { success: false, error: insErr };

  const recomputed = await recomputeScontoApprovazione({
    ordineId,
    fascia,
    clienteId: typed.cliente_id,
    actorId: auth.userId,
  });
  if (recomputed.error) return { success: false, error: recomputed.error };

  if (recomputed.stato === "in_attesa") {
    await notifyScontoDaApprovare({
      ordineId,
      numeroInterno: typed.numero_interno,
      cliente: typed.cliente_ragione_sociale,
      pct: Number(typed.sconto_extra_pct ?? 0),
      fascia,
      clienteId: typed.cliente_id,
      actorId: auth.userId,
    });
  }

  await writeAuditLog({
    entity_type: "ordini",
    entity_id: ordineId,
    action: "update",
    actor_id: auth.userId,
    summary:
      recomputed.stato === "approvata"
        ? `Sconto extra ${typed.sconto_extra_pct}% approvato (firma ${ruolo})`
        : `Firma sconto extra ${typed.sconto_extra_pct}% registrata (${ruolo})`,
    payload: { ruolo, fascia, stato: recomputed.stato },
  });

  const { data: righe } = await supabase
    .from("ordini_righe")
    .select("*")
    .eq("ordine_id", ordineId)
    .order("sort_order", { ascending: true });
  const { data: fresh } = await supabase
    .from("ordini")
    .select("*")
    .eq("id", ordineId)
    .maybeSingle();
  if (!fresh) return { success: false, error: "Approvazione salvata ma ordine non leggibile." };
  return {
    success: true,
    ordine: mapOrdineRow(fresh as OrdineRow, (righe ?? []) as OrdineRigaRow[]),
  };
}
