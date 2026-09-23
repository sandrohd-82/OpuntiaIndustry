function pill(
  n: number,
  cls: string,
  title: string
) {
  return (
    <span
      key={title}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-slate-900 ${cls}`}
      title={title}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function TicketNavDots({
  tickets,
  messaggi,
}: {
  tickets: number;
  messaggi: number;
}) {
  const showTickets = tickets > 0;
  const showMsg = messaggi > 0;
  if (!showTickets && !showMsg) return null;
  const title = [
    showTickets ? `${tickets} ticket` : "",
    showMsg ? `${messaggi} messaggi` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="ml-auto inline-flex shrink-0 items-center gap-0.5"
      title={title}
      aria-label={title}
    >
      {showTickets ? pill(tickets, "bg-sky-400", `${tickets} ticket`) : null}
      {showMsg ? pill(messaggi, "bg-emerald-500", `${messaggi} messaggi ticket`) : null}
    </span>
  );
}
