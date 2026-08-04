"use client";

import { useEffect, useId, useState } from "react";
import type { Essiccatore, EssiccatoreStatus } from "@/lib/produzione/essiccatori";

type Props = {
  items: Essiccatore[];
};

function formatNumber(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("it-IT")}${suffix}`;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function OnAirBadge({ status }: { status: EssiccatoreStatus }) {
  const on = status === "acceso";
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

function EssiccatoreCard({
  item,
  onOpenPhoto,
}: {
  item: Essiccatore;
  onOpenPhoto: (item: Essiccatore) => void;
}) {
  const e = item.esercizio;

  return (
    <article className="flex min-h-[280px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
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
        <OnAirBadge status={item.status} />
      </div>

      <dl className="mt-5 grid flex-1 grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Temperatura
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(e.temperaturaCameraC, " °C")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Umidità
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(e.umiditaPercent, " %")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Set-point
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(e.setPointC, " °C")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Ore ciclo
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(e.oreCiclo, " h")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Carico
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(e.caricoKg, " kg")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Ciclo
          </dt>
          <dd className="mt-1 text-base font-medium">
            {e.cicloCorrente ?? "Nessun ciclo"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="text-xs text-[var(--muted)]">
          Ultimo aggiornamento: {formatDateTime(e.ultimoAggiornamento)}
        </p>
        {e.note && (
          <p className="mt-2 text-sm text-[var(--foreground)]">{e.note}</p>
        )}
      </div>
    </article>
  );
}

export function EssiccatoriBoard({ items }: Props) {
  const [photoItem, setPhotoItem] = useState<Essiccatore | null>(null);

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-3 md:grid-cols-2">
        {items.map((item) => (
          <EssiccatoreCard
            key={item.id}
            item={item}
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
