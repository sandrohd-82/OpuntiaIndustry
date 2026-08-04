"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  CONDIZIONE_LABELS,
  FASE_LABELS,
  temperaturaTone,
  type Essiccatore,
  type EssiccatoreCondizione,
  type EssiccatorePower,
} from "@/lib/produzione/essiccatori";

type Props = {
  items: Essiccatore[];
};

function toneClasses(tone: EssiccatoreCondizione | null) {
  switch (tone) {
    case "regolare":
      return "text-emerald-600";
    case "hot":
      return "text-red-600";
    case "cold":
      return "text-sky-500";
    default:
      return "text-[var(--foreground)]";
  }
}

function toneBadgeClasses(tone: EssiccatoreCondizione) {
  switch (tone) {
    case "regolare":
      return "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/35";
    case "hot":
      return "bg-red-500/15 text-red-700 ring-1 ring-red-500/35";
    case "cold":
      return "bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/35";
  }
}

function formatKg(value: number) {
  return `${value.toLocaleString("it-IT")}kg`;
}

function formatDuration(accesoDal: string | null, now: number) {
  if (!accesoDal) return "—";
  const start = new Date(accesoDal).getTime();
  if (Number.isNaN(start) || start > now) return "—";

  const totalMinutes = Math.floor((now - start) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}g ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function OnAirBadge({ power }: { power: EssiccatorePower }) {
  const on = power === "acceso";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        on
          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40"
          : "bg-slate-500/10 text-slate-500 ring-1 ring-slate-400/30"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {on && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            on ? "bg-emerald-500" : "bg-slate-400"
          }`}
        />
      </span>
      {on ? "Acceso" : "Spento"}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function PhotoModal({
  item,
  onClose,
}: {
  item: Essiccatore;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {item.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        <div className="bg-slate-100 p-3">
          <img
            src={item.imageSrc}
            alt={`Foto ${item.name}`}
            className="max-h-[70vh] w-full rounded-lg object-cover"
          />
        </div>
      </div>
    </div>
  );
}

function ParamRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function EssiccatoreCard({
  item,
  now,
  onOpenPhoto,
}: {
  item: Essiccatore;
  now: number;
  onOpenPhoto: (item: Essiccatore) => void;
}) {
  const tempTone = temperaturaTone(
    item.temperaturaImpostataC,
    item.temperaturaRilevataC
  );

  const impostata =
    item.temperaturaImpostataC === null
      ? "—"
      : `${item.temperaturaImpostataC.toLocaleString("it-IT")}°`;
  const rilevata =
    item.temperaturaRilevataC === null
      ? "—"
      : `${item.temperaturaRilevataC.toLocaleString("it-IT")}°`;

  return (
    <article className="flex min-h-[300px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{item.name}</h2>
          <button
            type="button"
            onClick={() => onOpenPhoto(item)}
            className="inline-flex shrink-0 rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-slate-100 hover:text-[var(--foreground)]"
            title={`Vedi foto ${item.name}`}
            aria-label={`Vedi foto ${item.name}`}
          >
            <EyeIcon />
          </button>
        </div>
        <OnAirBadge power={item.power} />
      </div>

      <div className="mt-5 grid flex-1 gap-3">
        <ParamRow label="Stato">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">
              {FASE_LABELS[item.fase]}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${toneBadgeClasses(item.condizione)}`}
            >
              {CONDIZIONE_LABELS[item.condizione]}
            </span>
          </div>
        </ParamRow>

        <ParamRow label="Temperatura">
          <p className={`text-lg font-semibold tabular-nums ${toneClasses(tempTone)}`}>
            <span className="text-[var(--muted)]">[{impostata}]</span>
            <span className="mx-2 text-[var(--muted)]">:</span>
            <span>[{rilevata}]</span>
          </p>
        </ParamRow>

        <ParamRow label="Tempo">
          <p className="text-lg font-semibold tabular-nums">
            {formatDuration(item.accesoDal, now)}
          </p>
        </ParamRow>

        <ParamRow label="Prodotto caricato">
          <p className="text-lg font-semibold tabular-nums">
            {formatKg(item.prodottoCaricatoKg)}
          </p>
        </ParamRow>
      </div>
    </article>
  );
}

export function EssiccatoriBoard({ items }: Props) {
  const [photoItem, setPhotoItem] = useState<Essiccatore | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const list = useMemo(() => items, [items]);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => (
          <EssiccatoreCard
            key={item.id}
            item={item}
            now={now}
            onOpenPhoto={setPhotoItem}
          />
        ))}
      </div>
      {photoItem && (
        <PhotoModal item={photoItem} onClose={() => setPhotoItem(null)} />
      )}
    </>
  );
}
