import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { TICKET_URGENZA_META, type TicketUrgenza } from "@/lib/strumenti/ticket";
import { createServiceClient } from "@/lib/supabase/server";

export async function loadTicketAddettoUserId(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("strumenti_ticket_impostazioni")
    .select("addetto_user_id")
    .eq("chiave", "default")
    .is("deleted_at", null)
    .maybeSingle();
  const id = data?.addetto_user_id ? String(data.addetto_user_id) : "";
  return id || null;
}

export async function notifyTicketNuovo(input: {
  actorId: string;
  ticketId: string;
  codice: string;
  titolo: string;
  urgenza: TicketUrgenza;
}): Promise<void> {
  try {
    const addetto = await loadTicketAddettoUserId();
    if (!addetto) return;
    const urg = TICKET_URGENZA_META[input.urgenza]?.label ?? input.urgenza;
    await dispatchNotifiche({
      actorId: input.actorId,
      recipientIds: [addetto],
      tipo: "sistema",
      title: `Nuovo ticket ${urg.toLowerCase()}`,
      body: `${input.codice}: ${input.titolo}`,
      href: `/app/strumenti/ticket/${input.ticketId}`,
      entityType: "strumenti_ticket",
      entityId: input.ticketId,
      payload: {
        urgenza: input.urgenza,
        codice: input.codice,
      },
    });
  } catch (err) {
    console.error("[notifyTicketNuovo]", err);
  }
}
