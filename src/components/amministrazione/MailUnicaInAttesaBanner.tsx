"use client";

import { useEffect, useId, useState } from "react";
import {
  elencoMailUnicheInAttesaAction,
  inviaMailUnicaGruppoAction,
  type MailUnicaInAttesa,
} from "@/app/actions/gruppi-scaletta";
import { listCaselleSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import { SpedizioneDestinatarioMailField } from "@/components/amministrazione/SpedizioneDestinatarioMailField";

type Casella = { id: string; label: string; email: string };

export function CampiMailUnica({
  email,
  onEmail,
  clienteId,
  accountId,
  onAccount,
  accounts,
  oggetto,
  onOggetto,
  corpo,
  onCorpo,
  trackingUrl,
  onTracking,
}: {
  email: string;
  onEmail: (value: string) => void;
  clienteId: string;
  accountId: string;
  onAccount: (value: string) => void;
  accounts: Casella[];
  oggetto: string;
  onOggetto: (value: string) => void;
  corpo: string;
  onCorpo: (value: string) => void;
  trackingUrl?: string;
  onTracking?: (value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white px-3 py-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Casella mittente</span>
        <select
          value={accountId}
          onChange={(e) => onAccount(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Seleziona casella…</option>
          {accounts.map((casella) => (
            <option key={casella.id} value={casella.id}>
              {casella.label} · {casella.email}
            </option>
          ))}
        </select>
        {accounts.length === 0 ? (
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Nessuna casella webmail disponibile.
          </span>
        ) : null}
      </label>
      <SpedizioneDestinatarioMailField
        value={email}
        onChange={onEmail}
        anagrafica={clienteId ? { tipo: "cliente", id: clienteId } : null}
        emailAzienda={email}
      />
      {onTracking ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Link di tracking</span>
          <input
            type="url"
            value={trackingUrl ?? ""}
            onChange={(e) => onTracking(e.target.value)}
            placeholder="https://"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Oggetto</span>
        <input
          value={oggetto}
          onChange={(e) => onOggetto(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Testo</span>
        <textarea
          value={corpo}
          onChange={(e) => onCorpo(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Il link di tracking viene aggiunto in fondo alla mail, con logo e firma
        Agrinsicilia.
      </p>
    </div>
  );
}

function testoIniziale(gruppo: MailUnicaInAttesa) {
  const nome = gruppo.destinatario.trim() || "Cliente";
  const documenti = gruppo.documenti.length
    ? gruppo.documenti.join(", ")
    : gruppo.numero;
  return {
    oggetto: `Spedizione ${gruppo.numero}`,
    corpo: `Gentile ${nome},\n\nla spedizione ${gruppo.numero} è in partenza.\nDocumenti: ${documenti}.\n\nCordiali saluti,\nUfficio Commerciale`,
  };
}

export function MailUnicaInAttesaBanner() {
  const titleId = useId();
  const [gruppi, setGruppi] = useState<MailUnicaInAttesa[]>([]);
  const [aperto, setAperto] = useState<MailUnicaInAttesa | null>(null);
  const [accounts, setAccounts] = useState<Casella[]>([]);
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState("");
  const [saving, setSaving] = useState(false);

  function ricarica() {
    void elencoMailUnicheInAttesaAction().then((res) => {
      if (res.success) setGruppi(res.gruppi);
    });
  }

  useEffect(() => {
    ricarica();
  }, []);

  function apri(gruppo: MailUnicaInAttesa) {
    const testo = testoIniziale(gruppo);
    setAperto(gruppo);
    setEmail(gruppo.email);
    setAccountId(gruppo.accountId);
    setOggetto(testo.oggetto);
    setCorpo(testo.corpo);
    setTrackingUrl(gruppo.trackingUrl);
    setErrore("");
    void listCaselleSpedizioneMailAction().then((res) => {
      if (res.success) setAccounts(res.accounts);
    });
  }

  async function invia() {
    if (!aperto) return;
    setErrore("");
    if (!email.includes("@")) {
      setErrore("Indica l'indirizzo a cui inviare la mail.");
      return;
    }
    if (!accountId) {
      setErrore("Seleziona la casella da cui parte la mail.");
      return;
    }
    if (!trackingUrl.trim() || !oggetto.trim() || !corpo.trim()) {
      setErrore("Compila tracking, oggetto e testo.");
      return;
    }
    setSaving(true);
    try {
      const res = await inviaMailUnicaGruppoAction({
        gruppoId: aperto.id,
        destinatarioEmail: email,
        accountId,
        oggetto,
        corpo,
        trackingUrl,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setAperto(null);
      setAvviso(res.avviso);
      ricarica();
    } finally {
      setSaving(false);
    }
  }

  if (gruppi.length === 0 && !avviso) return null;

  return (
    <div className="space-y-2">
      {avviso ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {avviso}
        </p>
      ) : null}
      {gruppi.map((gruppo) => (
        <div
          key={gruppo.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          <p>
            La mail di {gruppo.numero} non è partita
            {gruppo.destinatario ? ` · ${gruppo.destinatario}` : ""}. Scegli
            destinatario e casella mittente, poi inviala.
          </p>
          <button
            type="button"
            onClick={() => apri(gruppo)}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Invia mail
          </button>
        </div>
      ))}
      {aperto ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
          >
            <h2 id={titleId} className="text-lg font-semibold">
              Mail di {aperto.numero}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Stessi dati della processazione singola: casella, destinatario,
              oggetto e testo. La mail parte solo da questo invio.
            </p>
            <div className="mt-4">
              <CampiMailUnica
                email={email}
                onEmail={setEmail}
                clienteId={aperto.clienteId}
                accountId={accountId}
                onAccount={setAccountId}
                accounts={accounts}
                oggetto={oggetto}
                onOggetto={setOggetto}
                corpo={corpo}
                onCorpo={setCorpo}
                trackingUrl={trackingUrl}
                onTracking={setTrackingUrl}
              />
            </div>
            {errore ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errore}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAperto(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void invia()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {saving ? "Invio…" : "Invia mail"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
