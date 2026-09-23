"use client";

import { useEffect, useState } from "react";
import { FaGear, FaSpinner } from "react-icons/fa6";
import {
  getTicketImpostazioniAction,
  salvaTicketAddettoAction,
  type TicketOperatoreOption,
} from "@/app/actions/strumenti-ticket-impostazioni";
import { notifyTicketNav } from "@/lib/strumenti/ticket-nav";

export function TicketImpostazioniPanel() {
  const [open, setOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const [addettoUserId, setAddettoUserId] = useState("");
  const [operatori, setOperatori] = useState<TicketOperatoreOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getTicketImpostazioniAction();
      if (cancelled) return;
      if (!res.success) {
        setReady(true);
        return;
      }
      setCanEdit(res.canEdit);
      setAddettoUserId(res.settings.addettoUserId ?? "");
      setOperatori(res.operatori);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !canEdit) return null;

  async function salva() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await salvaTicketAddettoAction({
      addettoUserId: addettoUserId || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setAddettoUserId(res.settings.addettoUserId ?? "");
    setMsg(
      res.settings.addettoLabel
        ? `Addetto impostato: ${res.settings.addettoLabel}`
        : "Nessun addetto: notifiche e pallini disattivati."
    );
    notifyTicketNav();
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-50 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900"
      >
        <FaGear size={14} />
        Impostazioni
        <span className="text-xs font-normal text-slate-500">
          (solo Super Admin)
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-700">
            Operatore addetto alla risoluzione dei ticket. Solo a questa persona
            arriva la notifica di un nuovo ticket (pallino azzurro su Strumenti).
            I messaggi in chat notificano la controparte e mostrano il numero
            verde sulla riga Ticket.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Addetto risoluzione
            </span>
            <select
              value={addettoUserId}
              onChange={(e) => setAddettoUserId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Nessuno —</option>
              {operatori.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.email ? ` · ${o.email}` : ""}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : null}
          {msg ? (
            <p className="text-sm text-emerald-800">{msg}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void salva()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? <FaSpinner className="animate-spin" /> : null}
            {busy ? "Salvo…" : "Salva impostazioni"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
