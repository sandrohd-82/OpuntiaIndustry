"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { formatOperatorShortName } from "@/lib/auth/operator-short-name";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { loadTicketAddettoUserId } from "@/lib/strumenti/ticket-notify";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type TicketOperatoreOption = {
  id: string;
  label: string;
  email: string;
};

export type TicketImpostazioni = {
  addettoUserId: string | null;
  addettoLabel: string | null;
};

const addettoSchema = z.object({
  addettoUserId: z.string().uuid().nullable(),
});

export async function getTicketImpostazioniAction(): Promise<
  | {
      success: true;
      canEdit: boolean;
      settings: TicketImpostazioni;
      operatori: TicketOperatoreOption[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "amministrazione"]);
  const canEdit = isUnrestrictedSuperadmin(auth);
  const db = createServiceClient();
  const addettoId = await loadTicketAddettoUserId();
  let addettoLabel: string | null = null;
  const operatori: TicketOperatoreOption[] = [];

  if (canEdit) {
    const { data, error } = await db
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    if (error) return { success: false, error: error.message };
    for (const p of data ?? []) {
      const id = String(p.id);
      const label = formatOperatorShortName(p);
      operatori.push({
        id,
        label,
        email: String(p.email ?? ""),
      });
      if (addettoId && id === addettoId) addettoLabel = label;
    }
  } else if (addettoId) {
    const { data } = await db
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("id", addettoId)
      .maybeSingle();
    if (data) addettoLabel = formatOperatorShortName(data);
  }

  return {
    success: true,
    canEdit,
    settings: { addettoUserId: addettoId, addettoLabel },
    operatori,
  };
}

export async function salvaTicketAddettoAction(input: {
  addettoUserId: string | null;
}): Promise<
  | { success: true; settings: TicketImpostazioni }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "amministrazione"]);
  if (!isUnrestrictedSuperadmin(auth)) {
    return {
      success: false,
      error: "Solo il Super Admin può modificare le impostazioni ticket.",
    };
  }
  const parsed = addettoSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Operatore non valido." };
  }
  const db = await createClient();
  const addettoUserId = parsed.data.addettoUserId;
  const { data: existing, error: readErr } = await db
    .from("strumenti_ticket_impostazioni")
    .select("id")
    .eq("chiave", "default")
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };

  if (existing?.id) {
    const { error } = await db
      .from("strumenti_ticket_impostazioni")
      .update({
        addetto_user_id: addettoUserId,
        updated_by: auth.userId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await db.from("strumenti_ticket_impostazioni").insert({
      chiave: "default",
      addetto_user_id: addettoUserId,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "strumenti_ticket_impostazioni",
    entity_id: existing?.id ?? "default",
    action: "update",
    actor_id: auth.userId,
    summary: addettoUserId
      ? `Impostato addetto ticket ${addettoUserId}`
      : "Rimosso addetto ticket",
    payload: { addetto_user_id: addettoUserId },
  });

  const refreshed = await getTicketImpostazioniAction();
  if (!refreshed.success) return refreshed;
  return { success: true, settings: refreshed.settings };
}

export async function getTicketNavBadgeAction(): Promise<
  | { success: true; tickets: number; messaggi: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess(["strumenti", "amministrazione"]);
  const addetto = await loadTicketAddettoUserId();
  const db = createServiceClient();
  let tickets = 0;
  if (addetto && addetto === auth.userId) {
    const { count, error } = await db
      .from("strumenti_ticket")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("archiviato_at", null)
      .in("documento_stato", ["bozza", "in_carico"]);
    if (error) return { success: false, error: error.message };
    tickets = count ?? 0;
  }
  const { count: msgCount, error: msgErr } = await db
    .from("app_notifiche")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", auth.userId)
    .eq("tipo", "sistema")
    .eq("entity_type", "strumenti_ticket_messaggio")
    .is("deleted_at", null)
    .is("read_at", null);
  if (msgErr) return { success: false, error: msgErr.message };
  return {
    success: true,
    tickets,
    messaggi: msgCount ?? 0,
  };
}
