type Props = {
  code: string;
  /** Prefisso fisso (es. Mp, Sz, Pr). Se omesso, prova i prefissi noti a 2 lettere, altrimenti 1 (F/C). */
  fixedPrefix?: string;
  size?: "md" | "lg";
  loading?: boolean;
};

/** Prefissi catalogo/operativi a 2 caratteri (non modificabili). */
const KNOWN_TWO_CHAR_PREFIXES = ["Sz", "Pr", "Mp", "At", "Pp"] as const;

function resolvePrefix(
  trimmed: string,
  fixedPrefix?: string
): { prefix: string; body: string } {
  if (fixedPrefix) {
    const p = fixedPrefix;
    const body =
      trimmed.length >= p.length &&
      trimmed.slice(0, p.length).toLowerCase() === p.toLowerCase()
        ? trimmed.slice(p.length)
        : trimmed;
    return { prefix: p, body };
  }

  for (const p of KNOWN_TWO_CHAR_PREFIXES) {
    if (
      trimmed.length >= 2 &&
      trimmed.slice(0, 2).toLowerCase() === p.toLowerCase()
    ) {
      return { prefix: p, body: trimmed.slice(2) };
    }
  }

  const prefix = trimmed.charAt(0).toUpperCase() || "F";
  return { prefix, body: trimmed.slice(1).toUpperCase() };
}

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
  const { prefix, body: rawBody } = resolvePrefix(trimmed, fixedPrefix);
  const body = rawBody || (loading ? "…" : "–––");
  const ariaCode = `${prefix}${rawBody}`;

  const prefixColor =
    prefix === "C"
      ? "text-sky-700"
      : prefix === "Sz" || prefix === "Pr"
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
