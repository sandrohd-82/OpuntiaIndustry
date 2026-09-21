import { TICKET_URGENZA_DOT } from "@/lib/strumenti/ticket-nav";
import type { TicketUrgenza } from "@/lib/strumenti/ticket";

function isUrgenza(v: string): v is TicketUrgenza {
  return v === "urgente" || v === "poco_urgente" || v === "non_urgente";
}

export function TicketUrgenzaDots({
  stacks,
}: {
  stacks: Array<{ urgenza: string; count: number }>;
}) {
  const visible = stacks.filter((s) => s.count > 0 && isUrgenza(s.urgenza));
  if (visible.length === 0) return null;
  const width = 20 + Math.max(0, visible.length - 1) * 11;
  const title = visible
    .map((s) => {
      const meta = TICKET_URGENZA_DOT[s.urgenza as TicketUrgenza];
      return `${s.count} ${meta.label.toLowerCase()}`;
    })
    .join(" · ");
  return (
    <span
      className="relative ml-auto inline-block h-5 shrink-0"
      style={{ width }}
      title={title}
      aria-label={title}
    >
      {visible.map((s, i) => {
        const meta = TICKET_URGENZA_DOT[s.urgenza as TicketUrgenza];
        return (
          <span
            key={s.urgenza}
            className={`absolute top-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ${meta.bg} ${meta.ring}`}
            style={{ left: i * 11, zIndex: 20 - i }}
          >
            {s.count > 99 ? "99+" : s.count}
          </span>
        );
      })}
    </span>
  );
}
