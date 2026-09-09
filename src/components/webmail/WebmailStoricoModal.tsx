"use client";

import { useEffect, useState } from "react";
import {
  listWebmailStoricoAction,
  type WebmailStoricoGroup,
} from "@/app/actions/webmail";
import { BusyBanner } from "@/components/ui/BusyIndicator";
import type { WebmailMessaggio } from "@/lib/webmail/types";

type Mode = "domain" | "email";

type Props = {
  open: boolean;
  accountId: string;
  fromAddress: string;
  fromName: string;
  domain: string;
  email: string;
  onClose: () => void;
  onOpenMessaggio: (m: WebmailMessaggio) => void;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

export function WebmailStoricoModal({
  open,
  accountId,
  fromAddress,
  fromName,
  domain,
  email,
  onClose,
  onOpenMessaggio,
}: Props) {
  const [mode, setMode] = useState<Mode>("domain");
  const [phase, setPhase] = useState<"choose" | "results">("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<WebmailStoricoGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [resultMode, setResultMode] = useState<Mode>("domain");

  useEffect(() => {
    if (!open) {
      setPhase("choose");
      setError(null);
      setGroups([]);
      setLoading(false);
      setMode("domain");
    }
  }, [open]);

  if (!open) return null;

  function resetAndClose() {
    setPhase("choose");
    setError(null);
    setGroups([]);
    setLoading(false);
    onClose();
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    setPhase("results");
    const res = await listWebmailStoricoAction({
      accountId,
      fromAddress,
      mode,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setResultMode(res.mode);
    setGroups(res.groups);
    setTotal(res.total);
    setTruncated(res.truncated);
  }

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={loading ? undefined : resetAndClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Storico mail mittente"
        className="flex max-h-[min(88vh,44rem)] w-full max-w-2xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Storico</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {fromName ? `${fromName} · ` : ""}
              {fromAddress}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={resetAndClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
          >
            Chiudi
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === "choose" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Cosa vuoi vedere nello storico di questa mail?
              </p>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                <input
                  type="radio"
                  name="storico-mode"
                  className="mt-1"
                  checked={mode === "domain"}
                  onChange={() => setMode("domain")}
                />
                <span>
                  <span className="font-medium">
                    Seleziona tutte le mail di questa estensione
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-slate-600">
                    {domain || "—"}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                <input
                  type="radio"
                  name="storico-mode"
                  className="mt-1"
                  checked={mode === "email"}
                  onChange={() => setMode("email")}
                />
                <span>
                  <span className="font-medium">
                    Seleziona le mail uguali a questa
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-slate-600">
                    {email || fromAddress}
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              {loading ? (
                <BusyBanner
                  label={
                    mode === "domain"
                      ? `Caricamento storico @${domain}…`
                      : `Caricamento storico ${email}…`
                  }
                />
              ) : null}
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}
              {!loading && !error ? (
                <>
                  <p className="text-sm text-slate-700">
                    {resultMode === "domain"
                      ? `${total} mail dal dominio ${domain}, raggruppate per indirizzo.`
                      : `${total} mail da ${email}.`}
                    {truncated
                      ? " Mostrate le più recenti (limite di consultazione)."
                      : ""}
                  </p>
                  {groups.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nessuna mail trovata.
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {groups.map((g) => (
                        <li key={g.fromAddress}>
                          {resultMode === "domain" ? (
                            <p className="mb-1.5 text-sm font-semibold text-slate-900">
                              {g.fromAddress}
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                {g.messaggi.length} mail
                                {g.unread > 0 ? ` · ${g.unread} da leggere` : ""}
                              </span>
                            </p>
                          ) : null}
                          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                            {g.messaggi.map((m) => (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenMessaggio(m)}
                                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                                    m.isSeen ? "" : "bg-amber-50"
                                  }`}
                                >
                                  <span
                                    className={
                                      m.isSeen
                                        ? "font-medium text-slate-800"
                                        : "font-semibold text-slate-950"
                                    }
                                  >
                                    {m.subject || "(senza oggetto)"}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {formatWhen(m.receivedAt)}
                                    {m.aziendaLabel
                                      ? ` · ${m.aziendaLabel}`
                                      : ""}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {phase === "results" ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setPhase("choose");
                setError(null);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              Indietro
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={resetAndClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              Annulla
            </button>
          )}
          {phase === "choose" ? (
            <button
              type="button"
              disabled={loading || !domain}
              onClick={() => void confirm()}
              className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Sì
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
