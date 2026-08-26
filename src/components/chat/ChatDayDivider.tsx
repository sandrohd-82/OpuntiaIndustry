"use client";

import { chatDayLabel } from "@/lib/chat/day-headers";

type Props = {
  createdAt: string;
};

/** Separatore giorno: strisce HR + data al centro, stile matita leggera. */
export function ChatDayDivider({ createdAt }: Props) {
  const label = chatDayLabel(createdAt);
  if (!label) return null;

  return (
    <div
      className="flex items-center gap-3 py-2"
      role="separator"
      aria-label={label}
    >
      <span
        aria-hidden
        className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300/80 to-slate-300/80"
      />
      <span
        className="shrink-0 px-1 font-serif text-[11px] italic tracking-wide text-slate-400"
        style={{
          fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
          fontWeight: 400,
          opacity: 0.85,
        }}
      >
        {label}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-300/80 to-slate-300/80"
      />
    </div>
  );
}
