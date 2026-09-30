"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type PnCalendarioEvento = {
  id: string;
  title: string;
  when: string;
  luogo?: string;
  stato?: string;
  body?: string;
  avvisi?: string;
};

type Kind = "promemoria" | "attivita";

type Props = {
  kind: Kind;
  month: string;
  onMonthChange: (month: string) => void;
  events: PnCalendarioEvento[];
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dayKeyLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return monthKeyFromDate(new Date(y, (m || 1) - 1 + delta, 1));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function etichettaConteggio(kind: Kind, n: number) {
  if (kind === "attivita") return `${n} attività`;
  return `${n} promemoria`;
}

export function PnVistaToggle({
  kind,
  mode,
}: {
  kind: Kind;
  mode: "elenco" | "calendario";
}) {
  const base = `/app/promemorie-e-note/${kind}`;
  const voci = [
    { mode: "elenco" as const, label: "Elenco", href: `${base}/elenco` },
    { mode: "calendario" as const, label: "Calendario", href: `${base}/calendario` },
  ];
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
      {voci.map((voce) => {
        const attiva = voce.mode === mode;
        return (
          <Link
            key={voce.mode}
            href={voce.href}
            className={
              attiva
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
            aria-current={attiva ? "page" : undefined}
          >
            {voce.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PnCalendarioMese({
  kind,
  month,
  onMonthChange,
  events,
}: Props) {
  const [giornoAperto, setGiornoAperto] = useState<string | null>(null);
  const [eventoAperto, setEventoAperto] = useState<string | null>(null);

  const [year, monthNum] = month.split("-").map(Number);
  const first = new Date(year, (monthNum || 1) - 1, 1);
  const daysInMonth = new Date(year, monthNum || 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: startPad + daysInMonth }, (_, i) => {
    const day = i - startPad + 1;
    return day > 0 ? day : null;
  });
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = useMemo(() => {
    const map = new Map<string, PnCalendarioEvento[]>();
    for (const event of events) {
      const key = dayKeyLocal(event.when);
      if (!key.startsWith(month)) continue;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.when.localeCompare(b.when));
    }
    return map;
  }, [events, month]);

  const aperti = giornoAperto ? (byDay.get(giornoAperto) ?? []) : [];
  const dettaglio =
    eventoAperto != null
      ? (aperti.find((item) => item.id === eventoAperto) ?? null)
      : null;
  const inModale = dettaglio ? [dettaglio] : aperti;

  useEffect(() => {
    if (!giornoAperto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setGiornoAperto(null);
        setEventoAperto(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [giornoAperto]);

  const titoloMese = first.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
  const oggi = dayKeyLocal(new Date().toISOString());

  function apriGiorno(dayKey: string, soloId?: string) {
    setGiornoAperto(dayKey);
    setEventoAperto(soloId ?? null);
  }

  function chiudi() {
    setGiornoAperto(null);
    setEventoAperto(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold capitalize">{titoloMese}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm"
          >
            Mese precedente
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(monthKeyFromDate(new Date()))}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm"
          >
            Mese successivo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="grid min-w-[720px] grid-cols-7">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="border-b border-[var(--border)] bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase text-[var(--muted)]"
            >
              {label}
            </div>
          ))}
          {cells.map((day, index) => {
            const dayKey = day
              ? `${year}-${pad(monthNum)}-${pad(day)}`
              : "";
            const items = day ? (byDay.get(dayKey) ?? []) : [];
            const troppi = items.length > 2;
            const oggiQui = dayKey === oggi;
            return (
              <div
                key={`${dayKey || "vuoto"}-${index}`}
                className="min-h-28 border-b border-r border-[var(--border)] p-1.5 last:border-r-0"
              >
                {day ? (
                  <>
                    <p
                      className={
                        oggiQui
                          ? "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
                          : "mb-1 text-xs font-semibold text-slate-700"
                      }
                    >
                      {day}
                    </p>
                    {troppi ? (
                      <button
                        type="button"
                        onClick={() => apriGiorno(dayKey)}
                        className="w-full rounded bg-slate-100 px-1.5 py-1 text-left text-[11px] font-medium text-slate-800 hover:bg-slate-200"
                      >
                        {etichettaConteggio(kind, items.length)}
                      </button>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => apriGiorno(dayKey, item.id)}
                              className="w-full truncate rounded bg-emerald-50 px-1.5 py-1 text-left text-[11px] text-emerald-950 hover:bg-emerald-100"
                              title={item.title}
                            >
                              <span className="font-mono text-[10px] text-emerald-800">
                                {formatTime(item.when)}
                              </span>{" "}
                              {item.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {giornoAperto ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-10"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) chiudi();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              dettaglio
                ? dettaglio.title
                : etichettaConteggio(kind, inModale.length)
            }
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold capitalize">
                {new Date(`${giornoAperto}T12:00:00`).toLocaleDateString(
                  "it-IT",
                  { weekday: "long", day: "numeric", month: "long" }
                )}
              </h3>
              <button
                type="button"
                onClick={chiudi}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm"
              >
                Chiudi
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {inModale.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 px-3 py-3"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatWhen(item.when)}
                    {item.luogo ? ` · ${item.luogo}` : ""}
                    {item.stato ? ` · ${item.stato}` : ""}
                    {item.avvisi ? ` · Avvisi: ${item.avvisi}` : ""}
                  </p>
                  {item.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                      {item.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
