"use client";

import { useEffect, useRef, useState } from "react";
import { FaCalendarPlus, FaXmark } from "react-icons/fa6";
import {
  listAttivitaPnAction,
  listPromemoriaAction,
} from "@/app/actions/promemorie-e-note";
import type { PnAttivita, PnPromemoria } from "@/lib/promemorie-e-note/types";

export type NotaExtrasValue = {
  dueAt: string | null;
  createPromemoria: boolean;
  createAttivita: boolean;
  linkedPromemoriaId: string | null;
  linkedAttivitaId: string | null;
};

type Props = {
  value: NotaExtrasValue;
  onChange: (next: NotaExtrasValue) => void;
};

export const EMPTY_NOTA_EXTRAS: NotaExtrasValue = {
  dueAt: null,
  createPromemoria: false,
  createAttivita: false,
  linkedPromemoriaId: null,
  linkedAttivitaId: null,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayLocalDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowLocalTime(d = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Combina data + ora locali in ISO. Ora vuota = adesso. */
export function combineDateAndTime(
  dateStr: string,
  timeStr: string
): string | null {
  if (!dateStr.trim() && !timeStr.trim()) return null;
  const d = dateStr.trim() || todayLocalDate();
  const t = timeStr.trim() || nowLocalTime();
  const iso = new Date(`${d}T${t}:00`);
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
}

type TimeAdessoInputProps = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
};

/** Ora vuota = «adesso» (il campo nativo mostra --:--). */
export function TimeAdessoInput({
  value,
  onChange,
  className,
}: TimeAdessoInputProps) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label={value ? "Ora" : "Ora adesso"}
    />
  );
}

export function NotaFormExtras({ value, onChange }: Props) {
  const [showDateTime, setShowDateTime] = useState(true);
  const [datePart, setDatePart] = useState(() => todayLocalDate());
  const [timePart, setTimePart] = useState("");
  const timeIsAdesso = useRef(!value.dueAt);
  const [promemoria, setPromemoria] = useState<PnPromemoria[]>([]);
  const [attivita, setAttivita] = useState<PnAttivita[]>([]);
  const [pickPromemoria, setPickPromemoria] = useState(false);
  const [pickAttivita, setPickAttivita] = useState(false);

  useEffect(() => {
    if (!value.dueAt) {
      setDatePart(todayLocalDate());
      setTimePart("");
      timeIsAdesso.current = true;
      return;
    }
    try {
      const d = new Date(value.dueAt);
      setDatePart(todayLocalDate(d));
      if (timeIsAdesso.current) {
        setTimePart("");
      } else {
        const t = nowLocalTime(d);
        setTimePart(t === "00:00" ? "" : t);
      }
      setShowDateTime(true);
    } catch {
      /* ignore */
    }
  }, [value.dueAt]);

  useEffect(() => {
    if (value.dueAt) return;
    onChange({
      ...value,
      dueAt: combineDateAndTime(todayLocalDate(), ""),
    });
    // solo al primo montaggio: data odierna + ora adesso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pickPromemoria && !value.linkedPromemoriaId) return;
    void listPromemoriaAction().then((res) => {
      if (res.success) setPromemoria(res.items);
    });
  }, [pickPromemoria, value.linkedPromemoriaId]);

  useEffect(() => {
    if (!pickAttivita && !value.linkedAttivitaId) return;
    void listAttivitaPnAction().then((res) => {
      if (res.success) setAttivita(res.items);
    });
  }, [pickAttivita, value.linkedAttivitaId]);

  function pushDue(date: string, time: string) {
    onChange({
      ...value,
      dueAt: combineDateAndTime(date, time),
    });
  }

  return (
    <div className="mt-3 space-y-3">
      {!showDateTime ? (
        <button
          type="button"
          onClick={() => {
            const today = todayLocalDate();
            setShowDateTime(true);
            setDatePart(today);
            setTimePart("");
            pushDue(today, "");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <FaCalendarPlus size={12} />
          Aggiungi data e/o ora
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Data e ora</p>
            <button
              type="button"
              aria-label="Rimuovi data/ora"
              onClick={() => {
                setShowDateTime(false);
                setDatePart(todayLocalDate());
                setTimePart("");
                onChange({ ...value, dueAt: null });
              }}
              className="text-[var(--muted)] hover:text-slate-900"
            >
              <FaXmark size={12} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted)]">Data</span>
              <input
                type="date"
                value={datePart}
                onChange={(e) => {
                  const next = e.target.value;
                  timeIsAdesso.current = true;
                  setDatePart(next);
                  setTimePart("");
                  pushDue(next, "");
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted)]">
                Ora {timePart ? "" : "· adesso"}
              </span>
              <TimeAdessoInput
                value={timePart}
                onChange={(next) => {
                  timeIsAdesso.current = !next;
                  setTimePart(next);
                  pushDue(datePart, next);
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            La data parte da oggi. L’ora è «adesso» (--:--) finché non la
            imposti; se cambi la data, l’ora torna adesso.
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
        <p className="text-sm font-medium">Collega promemoria o evento</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.createPromemoria}
            onChange={(e) =>
              onChange({
                ...value,
                createPromemoria: e.target.checked,
                linkedPromemoriaId: e.target.checked
                  ? null
                  : value.linkedPromemoriaId,
              })
            }
          />
          Crea nuovo promemoria dalla nota
        </label>
        {!value.createPromemoria ? (
          <div className="pl-6">
            {!pickPromemoria && !value.linkedPromemoriaId ? (
              <button
                type="button"
                onClick={() => setPickPromemoria(true)}
                className="text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Oppure scegli promemoria esistente…
              </button>
            ) : (
              <select
                value={value.linkedPromemoriaId ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    linkedPromemoriaId: e.target.value || null,
                    createPromemoria: false,
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              >
                <option value="">— nessuno —</option>
                {promemoria.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titolo}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.createAttivita}
            onChange={(e) =>
              onChange({
                ...value,
                createAttivita: e.target.checked,
                linkedAttivitaId: e.target.checked
                  ? null
                  : value.linkedAttivitaId,
              })
            }
          />
          Crea nuovo evento (attività) dalla nota
        </label>
        {!value.createAttivita ? (
          <div className="pl-6">
            {!pickAttivita && !value.linkedAttivitaId ? (
              <button
                type="button"
                onClick={() => setPickAttivita(true)}
                className="text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Oppure scegli evento esistente…
              </button>
            ) : (
              <select
                value={value.linkedAttivitaId ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    linkedAttivitaId: e.target.value || null,
                    createAttivita: false,
                  })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              >
                <option value="">— nessuno —</option>
                {attivita.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.titolo}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
