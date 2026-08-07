type Props = {
  code: string;
  /** Prefisso fisso (es. Mp). Se omesso, usa la prima lettera uppercased (F/C). */
  fixedPrefix?: string;
  size?: "md" | "lg";
  loading?: boolean;
};

/**
 * Targa / codice con prefisso più bombato e colore leggermente diverso.
 */
export function CodiceTargaBadge({
  code,
  fixedPrefix,
  size = "md",
  loading = false,
}: Props) {
  const trimmed = code.trim();
  const prefix = fixedPrefix
    ? fixedPrefix
    : trimmed.charAt(0).toUpperCase() || "F";
  const rawBody = fixedPrefix
    ? trimmed.startsWith(fixedPrefix)
      ? trimmed.slice(fixedPrefix.length)
      : trimmed
    : trimmed.slice(1).toUpperCase();
  const body = rawBody || (loading ? "…" : "–––");
  const ariaCode = fixedPrefix
    ? `${prefix}${rawBody}`
    : `${prefix}${rawBody}`.toUpperCase();

  const prefixColor =
    prefix === "C"
      ? "text-sky-700"
      : prefix === "Mp"
        ? "text-emerald-800"
        : prefix === "Pp"
          ? "text-violet-800"
          : "text-[color-mix(in_srgb,var(--primary)_88%,#0f172a)]";

  const sizeClasses =
    size === "lg"
      ? {
          wrap: "gap-0.5 text-3xl leading-none",
          prefix: "text-[1.35em] font-black",
          body: "text-[0.95em] font-semibold",
        }
      : {
          wrap: "gap-0.5 text-sm leading-none",
          prefix: "text-[1.25em] font-black",
          body: "text-[0.95em] font-semibold",
        };

  return (
    <span
      className={`inline-flex items-baseline font-mono tracking-[0.18em] ${sizeClasses.wrap}`}
      aria-label={`Codice ${ariaCode || "in caricamento"}`}
    >
      <span
        className={`${sizeClasses.prefix} ${prefixColor} scale-110`}
        style={{
          textShadow: "0 1px 0 rgba(15,23,42,0.12)",
          WebkitTextStroke: "0.35px currentColor",
        }}
      >
        {loading ? "·" : prefix}
      </span>
      <span className={`${sizeClasses.body} text-slate-800`}>{body}</span>
    </span>
  );
}
