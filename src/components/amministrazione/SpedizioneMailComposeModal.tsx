"use client";

import { useEffect, useId, useState } from "react";
import {
  inviaMailSpedizioneAction,
  listCaselleSpedizioneMailAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { SpedizioneDestinatarioMailField } from "@/components/amministrazione/SpedizioneDestinatarioMailField";
import type { SpedizioneAnagraficaMail } from "@/components/amministrazione/SpedizioneDestinatarioMailField";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import {
  AGRINSICILIA_LETTERHEAD,
  AGRINSICILIA_MAIL_FIRMA,
} from "@/lib/amministrazione/preventivo-letterhead";

type Props = {
  prenotazione: SpedizioneMailPrenotazione;
  subject: string;
  bodyText: string;
  to: string;
  anagrafica?: SpedizioneAnagraficaMail | null;
  emailAzienda?: string;
  emailPec?: string;
  emailGeneriche?: string[];
  onClose: () => void;
  onInviata: () => void;
  onSalvata?: (item: SpedizioneMailPrenotazione) => void;
  solaLettura?: boolean;
  /** salva: tiene la bozza, l’invio è al passaggio in scaletta. */
  intenzione?: "invia" | "salva";
};

export function SpedizioneMailComposeModal({
  prenotazione,
  subject,
  bodyText,
  to,
  anagrafica = null,
  emailAzienda = "",
  emailPec = "",
  emailGeneriche = [],
  onClose,
  onInviata,
  onSalvata,
  solaLettura = false,
  intenzione = "invia",
}: Props) {
  const soloBozza = intenzione === "salva";
  const campiBloccati = solaLettura && !soloBozza;
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
    });
  }, []);

  async function salvaBozza() {
    setError(null);
    setSending(true);
    try {
      const res = await upsertPrenotazioneSpedizioneMailAction({
        entityType: prenotazione.entityType,
        entityId: prenotazione.entityId,
        trackingUrl: prenotazione.trackingUrl,
        letteraViaPath: prenotazione.letteraViaPath,
        letteraViaName: prenotazione.letteraViaName,
        allegati: prenotazione.allegati,
        allegaTracking: prenotazione.allegaTracking,
        allegaLettera: prenotazione.allegaLettera,
        allegaFile: prenotazione.allegaFile,
        destinatarioEmail: dest,
        oggetto,
        corpo,
        accountId: accountId || null,
        modo: "salva",
        soloTracking: false,
        modificaMail: true,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSalvata?.(res.item);
    } finally {
      setSending(false);
    }
  }

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
    allegati.push("Visualizza tracking");
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
          {soloBozza ? "Modifica mail" : "Invio mail spedizione"}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {soloBozza
            ? "Salva le modifiche. La mail non parte adesso: l’invio resta alla conferma dell’operatore, dopo il tracking."
            : (solaLettura
                ? "Testo deciso in fase di ordine. Si invia così com’è."
                : "Testo generato in bozza: controlla e invia.")}
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Casella mittente</span>
          <select
            value={accountId}
            disabled={campiBloccati}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="">Seleziona casella…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.email}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3">
          {campiBloccati ? (
            <p className="text-sm">
              <span className="mb-1 block font-medium">Destinatario</span>
              {dest.trim() || "—"}
            </p>
          ) : (
            <SpedizioneDestinatarioMailField
              value={dest}
              onChange={setDest}
              anagrafica={anagrafica}
              emailAzienda={emailAzienda || to}
              emailPec={emailPec}
              emailGeneriche={emailGeneriche}
            />
          )}
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Oggetto</span>
          <input
            value={oggetto}
            readOnly={campiBloccati}
            onChange={(e) => setOggetto(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm read-only:bg-slate-50"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Testo</span>
            <textarea
            value={corpo}
            readOnly={campiBloccati}
            onChange={(e) => setCorpo(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm read-only:bg-slate-50"
          />
        </label>
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-xs text-[var(--muted)]">
            In calce alla mail partono il logo e i dati Agrinsicilia.
          </p>
          <img
            src={AGRINSICILIA_LETTERHEAD.logoSrc}
            alt={AGRINSICILIA_LETTERHEAD.logoAlt}
            className="h-14 w-auto"
          />
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-800">
            {AGRINSICILIA_MAIL_FIRMA}
          </p>
        </div>
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
            {soloBozza ? "Annulla" : "Chiudi"}
          </button>
          <button
            type="button"
            disabled={sending || !accountId || !dest}
            onClick={() => void (soloBozza ? salvaBozza() : invia())}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {sending
              ? (soloBozza ? "Salvataggio…" : "Invio…")
              : (soloBozza ? "Salva" : "Invio")}
          </button>
        </div>
      </div>
    </div>
  );
}
