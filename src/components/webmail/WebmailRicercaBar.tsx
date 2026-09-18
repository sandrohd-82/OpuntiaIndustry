"use client";

import { useEffect, useState } from "react";
import { searchWebmailAziendeAction, type WebmailAziendaOption } from "@/app/actions/webmail";

export type WebmailRicercaAzienda = WebmailAziendaOption | null;

export function WebmailRicercaBar({
  azienda,
  onAziendaChange,
  q,
  onQChange,
  subject,
  onSubjectChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onSubmit,
  onClear,
}: {
  azienda: WebmailRicercaAzienda;
  onAziendaChange: (next: WebmailRicercaAzienda) => void;
  q: string;
  onQChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const [aziendaQuery, setAziendaQuery] = useState(azienda?.label ?? "");
  const [hits, setHits] = useState<WebmailAziendaOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (azienda) setAziendaQuery(azienda.label);
  }, [azienda]);

  useEffect(() => {
    const qz = aziendaQuery.trim();
    if (azienda && qz === azienda.label) {
      setHits([]);
      return;
    }
    if (qz.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchWebmailAziendeAction(qz).then((res) => {
        if (res.success) setHits(res.items);
      });
    }, 220);
    return () => window.clearTimeout(t);
  }, [azienda, aziendaQuery]);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="relative min-w-[12rem] flex-1 text-xs font-medium text-slate-700">
        Azienda
        <input
          value={aziendaQuery}
          onChange={(e) => {
            setAziendaQuery(e.target.value);
            setOpen(true);
            if (azienda) onAziendaChange(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tutte · cerca cliente / lead"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal"
        />
        {open && hits.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {hits.map((h) => (
              <li key={`${h.tipo}-${h.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onAziendaChange(h);
                    setAziendaQuery(h.label);
                    setOpen(false);
                    setHits([]);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {h.label}
                  <span className="ml-1 text-[11px] text-slate-500">
                    {h.tipo === "cliente"
                      ? "cliente"
                      : h.tipo === "fornitore"
                        ? "fornitore"
                        : "possibile"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>
      <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-700">
        Testo
        <input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Mittente, destinatario, corpo…"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="min-w-[8rem] flex-1 text-xs font-medium text-slate-700">
        Oggetto
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Oggetto"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        Dal
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="text-xs font-medium text-slate-700">
        Al
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-normal"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
      >
        Cerca
      </button>
      {azienda || q || subject || dateFrom || dateTo ? (
        <button
          type="button"
          onClick={() => {
            setAziendaQuery("");
            setHits([]);
            setOpen(false);
            onClear();
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-white"
        >
          Pulisci
        </button>
      ) : null}
    </form>
  );
}
