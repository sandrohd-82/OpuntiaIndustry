import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { TICKET_URGENZA_META, type TicketUrgenza } from "@/lib/strumenti/ticket";
import { createServiceClient } from "@/lib/supabase/server";

export const TICKET_NOTIFICA_KIND_NUOVO = "ticket_nuovo";
export const TICKET_NOTIFICA_KIND_MSG = "ticket_messaggio";

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

function hrefTicket(ticketId: string): string {
  return `/app/strumenti/ticket?apri=${ticketId}`;
}

async function destinatariControparte(input: {
  actorId: string;
  ticketId: string;
  createdBy: string | null;
}): Promise<string[]> {
  const db = createServiceClient();
  const addetto = await loadTicketAddettoUserId();
  const { data: ticket } = await db
    .from("strumenti_ticket")
    .select("created_by")
    .eq("id", input.ticketId)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: msgs } = await db
    .from("strumenti_ticket_messaggi")
    .select("created_by")
    .eq("ticket_id", input.ticketId)
    .is("deleted_at", null);
  const ids = new Set<string>();
  const creator = ticket?.created_by
    ? String(ticket.created_by)
    : input.createdBy
      ? String(input.createdBy)
      : "";
  if (creator) ids.add(creator);
  if (addetto) ids.add(addetto);
  for (const m of msgs ?? []) {
    if (m.created_by) ids.add(String(m.created_by));
  }
  ids.delete(input.actorId);
  return [...ids];
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
    if (!addetto || addetto === input.actorId) return;
    const urg = TICKET_URGENZA_META[input.urgenza]?.label ?? input.urgenza;
    await dispatchNotifiche({
      actorId: input.actorId,
      recipientIds: [addetto],
      tipo: "sistema",
      title: `Nuovo ticket ${urg.toLowerCase()}`,
      body: `${input.codice}: ${input.titolo}`,
      href: hrefTicket(input.ticketId),
      entityType: "strumenti_ticket",
      entityId: input.ticketId,
      payload: {
        kind: TICKET_NOTIFICA_KIND_NUOVO,
        urgenza: input.urgenza,
        codice: input.codice,
        ticketId: input.ticketId,
      },
    });
  } catch (err) {
    console.error("[notifyTicketNuovo]", err);
  }
}

export async function notifyTicketMessaggio(input: {
  actorId: string;
  ticketId: string;
  messaggioId: string;
  codice: string;
  titolo: string;
  createdBy: string | null;
  anteprima: string;
}): Promise<void> {
  try {
    const recipientIds = await destinatariControparte({
      actorId: input.actorId,
      ticketId: input.ticketId,
      createdBy: input.createdBy,
    });
    if (!recipientIds.length) return;
    const anteprima = input.anteprima.replace(/\s+/g, " ").trim();
    await dispatchNotifiche({
      actorId: input.actorId,
      recipientIds,
      tipo: "sistema",
      title: `Messaggio su ${input.codice}`,
      body: anteprima
        ? `${input.titolo}: ${anteprima.slice(0, 160)}`
        : input.titolo,
      href: hrefTicket(input.ticketId),
      entityType: "strumenti_ticket_messaggio",
      entityId: input.messaggioId,
      payload: {
        kind: TICKET_NOTIFICA_KIND_MSG,
        codice: input.codice,
        ticketId: input.ticketId,
        messaggioId: input.messaggioId,
      },
    });
  } catch (err) {
    console.error("[notifyTicketMessaggio]", err);
  }
}
