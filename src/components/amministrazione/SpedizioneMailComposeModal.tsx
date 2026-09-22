"use client";

import { useEffect, useId, useState } from "react";
import {
  inviaMailSpedizioneAction,
  listCaselleSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";

type Props = {
  prenotazione: SpedizioneMailPrenotazione;
  subject: string;
  bodyText: string;
  to: string;
  onClose: () => void;
  onInviata: () => void;
};

export function SpedizioneMailComposeModal({
  prenotazione,
  subject,
  bodyText,
  to,
  onClose,
  onInviata,
}: Props) {
  const titleId = useId();
  const [oggetto, setOggetto] = useState(subject);
  const [corpo, setCorpo] = useState(bodyText);
  const [dest, setDest] = useState(to);
  const [accountId, setAccountId] = useState(prenotazione.accountId ?? "");
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void listCaselleSpedizioneMailAction().then((res) => {
      if (!res.success) return;
      setAccounts(res.accounts);
      setAccountId((prev) => prev || res.accounts[0]?.id || "");
    });
  }, []);

  async function invia() {
    setError(null);
    setSending(true);
    try {
      const res = await inviaMailSpedizioneAction({
        prenotazioneId: prenotazione.id,
        accountId,
        to: dest,
        subject: oggetto,
        bodyText: corpo,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onInviata();
    } finally {
      setSending(false);
    }
  }

  const allegati: string[] = [];
  if (prenotazione.allegaTracking && prenotazione.trackingUrl) {
    allegati.push("Tracking");
  }
  if (prenotazione.allegaLettera && prenotazione.letteraViaName) {
    allegati.push(`Lettera di via (${prenotazione.letteraViaName})`);
  }
  if (prenotazione.allegaFile) {
    for (const a of prenotazione.allegati) allegati.push(a.name);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          Invio mail spedizione
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Testo generato in bozza: controlla e invia.
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Casella mittente</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Seleziona casella…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.email}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">A</span>
          <input
            type="email"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Oggetto</span>
          <input
            value={oggetto}
            onChange={(e) => setOggetto(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Testo</span>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        {allegati.length ? (
          <p className="mt-2 text-xs text-slate-600">
            Allegati: {allegati.join(" · ")}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
          <button
            type="button"
            disabled={sending || !accountId || !dest}
            onClick={() => void invia()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {sending ? "Invio…" : "Invio"}
          </button>
        </div>
      </div>
    </div>
  );
}
