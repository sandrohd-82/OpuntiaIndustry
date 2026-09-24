import type { ReactNode } from "react";
import type { AnagraficaSedeTipo } from "@/lib/amministrazione/anagrafica-extra";

export const ANAGRAFICA_SECTION_TONE = {
  identita: "border-slate-200 bg-slate-50",
  contatti: "border-emerald-200 bg-emerald-50/70",
  sedi: "border-sky-200 bg-sky-50/70",
  brand: "border-violet-200 bg-violet-50/70",
  consegne: "border-amber-200 bg-amber-50/70",
  referenti: "border-cyan-200 bg-cyan-50/70",
  prodotti: "border-orange-200 bg-orange-50/70",
  schede: "border-lime-200 bg-lime-50/70",
  note: "border-stone-200 bg-stone-50",
} as const;

export const ANAGRAFICA_SECTION_HEAD = {
  identita: "bg-slate-200/80 text-slate-900",
  contatti: "bg-emerald-200/80 text-emerald-950",
  sedi: "bg-sky-200/80 text-sky-950",
  brand: "bg-violet-200/80 text-violet-950",
  consegne: "bg-amber-200/80 text-amber-950",
  referenti: "bg-cyan-200/80 text-cyan-950",
  prodotti: "bg-orange-200/80 text-orange-950",
  schede: "bg-lime-200/80 text-lime-950",
  note: "bg-stone-200/80 text-stone-900",
} as const;

export type AnagraficaSectionTone = keyof typeof ANAGRAFICA_SECTION_TONE;

export const ANAGRAFICA_SEDE_TONE: Record<AnagraficaSedeTipo, string> = {
  legale: "bg-slate-200 text-slate-900",
  amministrativa: "bg-indigo-100 text-indigo-950",
  produttiva: "bg-amber-100 text-amber-950",
  magazzino: "bg-sky-100 text-sky-950",
};

export function AnagraficaSchedaSection({
  title,
  tone,
  children,
  className = "",
}: {
  title: string;
  tone: AnagraficaSectionTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border ${ANAGRAFICA_SECTION_TONE[tone]} ${className}`}
    >
      <header
        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${ANAGRAFICA_SECTION_HEAD[tone]}`}
      >
        {title}
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}
