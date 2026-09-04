import { iotDotClass, iotStatoLabel, type IotStato } from "@/lib/produzione/macchinari";

export function IotStatusDot({
  stato,
  size = "md",
}: {
  stato: IotStato;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-1.5" title={iotStatoLabel(stato)}>
      <span
        className={`${dim} shrink-0 rounded-full ring-1 ring-black/20 ${iotDotClass(stato)}`}
      />
      <span className="text-xs text-[var(--muted)]">{iotStatoLabel(stato)}</span>
    </span>
  );
}
