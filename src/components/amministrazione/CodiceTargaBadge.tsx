type Props = {
  code: string;
  size?: "md" | "lg";
  loading?: boolean;
};

/**
 * Targa non modificabile: lettera prefisso più bombata e colore leggermente diverso.
 */
export function CodiceTargaBadge({ code, size = "md", loading = false }: Props) {
  const normalized = code.trim().toUpperCase();
  const prefix = normalized.charAt(0) || "F";
  const body = normalized.slice(1) || (loading ? "…" : "–––");

  const prefixColor =
    prefix === "C"
      ? "text-sky-700"
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
      aria-label={`Targa ${normalized || "in caricamento"}`}
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
