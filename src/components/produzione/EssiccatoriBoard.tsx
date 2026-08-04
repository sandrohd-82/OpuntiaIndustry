"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CONDIZIONE_LABELS,
  FASE_LABELS,
  PRODOTTO_STIMA_PERCENT,
  prodottoStimatoDeltaKg,
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
  return `${value.toLocaleString("it-IT", {
    maximumFractionDigits: 1,
  })}kg`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function formatDuration(accesoDal: string | null, now: number) {
  if (!accesoDal) return "—";
  const start = new Date(accesoDal).getTime();
  if (Number.isNaN(start) || start > now) return "—";

  const totalMinutes = Math.floor((now - start) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}g ${hours} h ${minutes}m`;
  if (hours > 0) return `${hours} h ${minutes}m`;
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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
      {children}
    </p>
  );
}

function EssiccatoreCard({
  item,
  now,
  onOpenPhoto,
  onIntervieni,
}: {
  item: Essiccatore;
  now: number;
  onOpenPhoto: (item: Essiccatore) => void;
  onIntervieni: (item: Essiccatore) => void;
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

  const stimaDelta = prodottoStimatoDeltaKg(item.prodottoCaricatoKg);
  const stimaPercentLabel = PRODOTTO_STIMA_PERCENT.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <article className="flex min-h-[340px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
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

      <div className="mt-5 flex flex-1 flex-col gap-4">
        {/* Stato */}
        <section>
          <SectionLabel>Stato</SectionLabel>
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-lg font-semibold">{FASE_LABELS[item.fase]}</p>
            <span
              className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${toneBadgeClasses(item.condizione)}`}
            >
              {CONDIZIONE_LABELS[item.condizione]}
            </span>
          </div>
        </section>

        {/* Temperatura */}
        <section>
          <SectionLabel>Temperatura</SectionLabel>
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-base font-medium tabular-nums text-[var(--foreground)]">
              Imp. {impostata}
            </p>
            <div className="text-right">
              <p
                className={`text-lg font-semibold tabular-nums leading-tight ${toneClasses(tempTone)}`}
              >
                {rilevata}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatDateTime(item.temperaturaAggiornataIl)}
              </p>
            </div>
          </div>
        </section>

        {/* Tempo di esercizio */}
        <section>
          <SectionLabel>Tempo di esercizio</SectionLabel>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">Inizio</p>
              <p className="text-base font-medium tabular-nums">
                {formatDateTime(item.accesoDal)}
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {formatDuration(item.accesoDal, now)}
            </p>
          </div>
        </section>

        {/* Prodotto caricato */}
        <section className="flex items-center justify-between gap-3">
          <SectionLabel>Prodotto caricato</SectionLabel>
          <p className="text-lg font-semibold tabular-nums">
            {formatKg(item.prodottoCaricatoKg)}
          </p>
        </section>

        {/* Prodotto stimato */}
        <section>
          <SectionLabel>Prodotto stimato</SectionLabel>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-base font-medium">± {stimaPercentLabel}%</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatKg(stimaDelta)}
            </p>
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => onIntervieni(item)}
        className="mt-5 w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        Intervieni
      </button>
    </article>
  );
}

export function EssiccatoriBoard({ items }: Props) {
  const [photoItem, setPhotoItem] = useState<Essiccatore | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [intervieniMsg, setIntervieniMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const list = useMemo(() => items, [items]);

  return (
    <>
      {intervieniMsg && (
        <p
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {intervieniMsg}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => (
          <EssiccatoreCard
            key={item.id}
            item={item}
            now={now}
            onOpenPhoto={setPhotoItem}
            onIntervieni={(ess) =>
              setIntervieniMsg(
                `Intervento richiesto su ${ess.name}. Funzione in fase di implementazione.`
              )
            }
          />
        ))}
      </div>
      {photoItem && (
        <PhotoModal item={photoItem} onClose={() => setPhotoItem(null)} />
      )}
    </>
  );
}
