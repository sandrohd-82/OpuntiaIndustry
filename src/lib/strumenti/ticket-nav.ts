import type { TicketUrgenza } from "@/lib/strumenti/ticket";

export const TICKET_NAV_EVENT = "opuntia-ticket-nav";

export function notifyTicketNav() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TICKET_NAV_EVENT));
}

export type TicketUrgenzaStack = {
  urgenza: TicketUrgenza;
  count: number;
};

export const TICKET_URGENZA_DOT: Record<
  TicketUrgenza,
  { bg: string; ring: string; label: string }
> = {
  urgente: {
    bg: "bg-red-500",
    ring: "ring-slate-900",
    label: "Urgente",
  },
  poco_urgente: {
    bg: "bg-amber-400",
    ring: "ring-slate-900",
    label: "Poco urgente",
  },
  non_urgente: {
    bg: "bg-sky-400",
    ring: "ring-slate-900",
    label: "Non urgente",
  },
};

export const TICKET_URGENZA_STACK_ORDER: TicketUrgenza[] = [
  "urgente",
  "poco_urgente",
  "non_urgente",
];

export function stacksFromCounts(counts: Record<TicketUrgenza, number>): TicketUrgenzaStack[] {
  return TICKET_URGENZA_STACK_ORDER.filter((u) => (counts[u] ?? 0) > 0).map(
    (urgenza) => ({ urgenza, count: counts[urgenza] })
  );
}
