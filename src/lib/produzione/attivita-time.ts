/** Interpreta data+ora come orario di parete Europe/Rome. */
export function romeDateTimeToIso(dateYmd: string, hm: string): string {
  const time = hm.length === 5 ? `${hm}:00` : hm;
  const asUtc = new Date(`${dateYmd}T${time}Z`);
  const rome = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(asUtc)
    .replace(" ", "T");
  const delta = asUtc.getTime() - new Date(`${rome}Z`).getTime();
  return new Date(asUtc.getTime() + delta).toISOString();
}

export function romeMinutesOf(iso: string): number {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inRomeTimeWindow(
  iso: string,
  timeFrom?: string,
  timeTo?: string
): boolean {
  if (!timeFrom && !timeTo) return true;
  const mins = romeMinutesOf(iso);
  const from = timeFrom ? parseHmToMinutes(timeFrom) : 0;
  const to = timeTo ? parseHmToMinutes(timeTo) : 24 * 60 - 1;
  if (from <= to) return mins >= from && mins <= to;
  return mins >= from || mins <= to;
}
