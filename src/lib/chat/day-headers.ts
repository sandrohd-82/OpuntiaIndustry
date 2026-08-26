/** Chiave giorno locale YYYY-MM-DD per raggruppamento messaggi. */
export function chatDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Etichetta data stile conversazione (Oggi / Ieri / data lunga). */
export function chatDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);

  if (diffDays === 0) return "Oggi";
  if (diffDays === 1) return "Ieri";

  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function sameChatDay(aIso: string, bIso: string): boolean {
  const a = chatDayKey(aIso);
  const b = chatDayKey(bIso);
  return Boolean(a) && a === b;
}
