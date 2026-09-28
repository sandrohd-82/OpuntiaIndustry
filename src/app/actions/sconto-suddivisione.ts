"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  requireOrdineCreateAccess,
  requireOrdineReadAccess,
} from "@/lib/auth/ordini-access";
import { loadCommercialLineageUserIds } from "@/lib/auth/commerciale-lineage";
import { loadOrdineWithRighe } from "@/app/actions/ordini";
import { createClient } from "@/lib/supabase/server";
import type { Ordine } from "@/lib/amministrazione/ordini";
import {
  gradoInseritoreSuddivisione,
  registraFirmaSuddivisione,
} from "@/lib/amministrazione/sconto-suddivisione-server";
import { loadClienteCommercialeId } from "@/lib/amministrazione/sconto-fuori-listino-server";
import { parseSuddivisioneStato } from "@/lib/amministrazione/sconto-suddivisione";
import type { OrdineRow } from "@/types/database";

async function puoFirmare(input: {
  userId: string;
  approvatore: string;
  clienteId: string | null;
}): Promise<boolean> {
  const grado = await gradoInseritoreSuddivisione(input.userId);
  if (grado === "azienda") return true;
  if (input.approvatore !== "senior" || grado !== "senior") return false;
  const commercialeId = await loadClienteCommercialeId(input.clienteId);
  if (!commercialeId) return true;
  const tree = await loadCommercialLineageUserIds(input.userId);
  return tree.includes(commercialeId) || commercialeId === input.userId;
}

export async function approveScontoSuddivisioneOrdineAction(
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
  const typed = row as OrdineRow & {
    sconto_suddivisione_stato?: string;
    sconto_suddivisione_approvatore?: string;
  };
  if (parseSuddivisioneStato(typed.sconto_suddivisione_stato) !== "in_attesa") {
    return { success: false, error: "Nessuna suddivisione in attesa." };
  }
  const ok = await puoFirmare({
    userId: auth.userId,
    approvatore: String(typed.sconto_suddivisione_approvatore ?? ""),
    clienteId: typed.cliente_id,
  });
  if (!ok) {
    return {
      success: false,
      error:
        typed.sconto_suddivisione_approvatore === "azienda"
          ? "Serve la firma di un Amministratore o Super Admin."
          : "Serve la firma del Senior della linea.",
    };
  }
  const ruolo =
    typed.sconto_suddivisione_approvatore === "azienda"
      ? "azienda"
      : "commerciale_senior";
  const firmaErr = await registraFirmaSuddivisione({
    entityType: "ordine",
    entityId: ordineId,
    ruolo,
    esito: "approvato",
    actorId: auth.userId,
    summary: `Suddivisione sconto approvata (${ruolo})`,
  });
  if (firmaErr) return { success: false, error: firmaErr };
  const { error: updErr } = await supabase
    .from("ordini")
    .update({
      sconto_suddivisione_stato: "approvata",
      updated_by: auth.userId,
    })
    .eq("id", ordineId)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };
  const ordine = await loadOrdineWithRighe(ordineId);
  if (!ordine) return { success: false, error: "Ordine non rileggibile." };
  return { success: true, ordine };
}

export async function approveScontoSuddivisionePreventivoRigaAction(
  rigaIdRaw: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireOrdineCreateAccess();
  const rigaId = String(rigaIdRaw ?? "").trim();
  if (!rigaId) return { success: false, error: "Riga non indicata." };
  const supabase = await createClient();
  const { data: riga, error } = await supabase
    .from("preventivi_righe")
    .select(
      "id, preventivo_id, sconto_suddivisione_stato, sconto_suddivisione_approvatore, prodotto_codice"
    )
    .eq("id", rigaId)
    .maybeSingle();
  if (error || !riga) {
    return { success: false, error: error?.message ?? "Riga non trovata." };
  }
  const stato = parseSuddivisioneStato(
    (riga as { sconto_suddivisione_stato?: string }).sconto_suddivisione_stato
  );
  if (stato !== "in_attesa") {
    return { success: false, error: "Nessuna suddivisione in attesa." };
  }
  const preventivoId = String(
    (riga as { preventivo_id?: string }).preventivo_id ?? ""
  );
  const { data: prev } = await supabase
    .from("preventivi")
    .select("cliente_id, numero_interno")
    .eq("id", preventivoId)
    .maybeSingle();
  const clienteId =
    (prev as { cliente_id?: string | null } | null)?.cliente_id ?? null;
  const approvatore = String(
    (riga as { sconto_suddivisione_approvatore?: string })
      .sconto_suddivisione_approvatore ?? ""
  );
  const ok = await puoFirmare({
    userId: auth.userId,
    approvatore,
    clienteId,
  });
  if (!ok) {
    return {
      success: false,
      error:
        approvatore === "azienda"
          ? "Serve la firma di un Amministratore o Super Admin."
          : "Serve la firma del Senior della linea.",
    };
  }
  const ruolo = approvatore === "azienda" ? "azienda" : "commerciale_senior";
  const firmaErr = await registraFirmaSuddivisione({
    entityType: "preventivo_riga",
    entityId: rigaId,
    ruolo,
    esito: "approvato",
    actorId: auth.userId,
    summary: `Suddivisione sconto preventivo approvata (${ruolo})`,
  });
  if (firmaErr) return { success: false, error: firmaErr };
  const { error: updErr } = await supabase
    .from("preventivi_righe")
    .update({
      sconto_suddivisione_stato: "approvata",
      updated_by: auth.userId,
    })
    .eq("id", rigaId);
  if (updErr) return { success: false, error: updErr.message };
  await writeAuditLog({
    entity_type: "preventivi",
    entity_id: preventivoId,
    action: "update",
    actor_id: auth.userId,
    summary: `Suddivisione sconto approvata su ${String((riga as { prodotto_codice?: string }).prodotto_codice ?? "riga")}`,
    payload: { riga_id: rigaId, ruolo },
  });
  return { success: true };
}
