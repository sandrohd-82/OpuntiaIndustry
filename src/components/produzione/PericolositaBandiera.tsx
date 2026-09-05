import {
  pericolositaLabel,
  type PostoPericolosita,
} from "@/lib/produzione/aree-posti";

const DOT: Record<PostoPericolosita, string> = {
  alta: "bg-red-600",
  media: "bg-amber-400",
  bassa: "bg-emerald-500",
};

const PILL: Record<PostoPericolosita, string> = {
  alta: "border-red-200 bg-red-50 text-red-800",
  media: "border-amber-200 bg-amber-50 text-amber-900",
  bassa: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

type Props = {
  level: PostoPericolosita;
  compact?: boolean;
};

export function PericolositaBandiera({ level, compact = false }: Props) {
  return (
    <span
      title={pericolositaLabel(level)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${PILL[level]}`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
      {compact
        ? level === "alta"
          ? "Alto"
          : level === "media"
            ? "Media"
            : "Bassa"
        : pericolositaLabel(level)}
    </span>
  );
}
