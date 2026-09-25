"use client";

import { useEffect, useState } from "react";
import {
  listAttivitaMentionCaselleAction,
  listAttivitaMentionMailsByCasellaAction,
  searchAttivitaMentionAziendeAction,
  searchAttivitaMentionMailsAction,
  type MentionCasella,
} from "@/app/actions/attivita-mentions";
import type { AttivitaMentionHit } from "@/lib/promemorie-e-note/mention-tokens";

type Step =
  | "scelta"
  | "cerca-mail"
  | "azienda-tipo"
  | "azienda-elenco"
  | "caselle"
  | "mail-casella";

type Props = {
  onClose: () => void;
  onPick: (hit: AttivitaMentionHit) => void | Promise<void>;
};

export function MentionMailModal({ onClose, onPick }: Props) {
  const [step, setStep] = useState<Step>("scelta");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mails, setMails] = useState<AttivitaMentionHit[]>([]);
  const [aziende, setAziende] = useState<AttivitaMentionHit[]>([]);
  const [caselle, setCaselle] = useState<MentionCasella[]>([]);
  const [aziendaTipo, setAziendaTipo] = useState<
    "cliente" | "cliente_possibile"
  >("cliente");
  const [azienda, setAzienda] = useState<AttivitaMentionHit | null>(null);
  const [casella, setCasella] = useState<MentionCasella | null>(null);
  const [picking, setPicking] = useState(false);

  async function pick(hit: AttivitaMentionHit) {
    if (picking) return;
    setPicking(true);
    setError(null);
    try {
      await onPick(hit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caricamento mail non riuscito.");
      setPicking(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runSearchMails() {
    setLoading(true);
    setError(null);
    const res = await searchAttivitaMentionMailsAction({ q });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMails(res.items);
  }

  async function runSearchAziende() {
    setLoading(true);
    setError(null);
    const res = await searchAttivitaMentionAziendeAction({
      kind: aziendaTipo,
      q,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setAziende(res.items);
  }

  async function openCaselle(az: AttivitaMentionHit) {
    setAzienda(az);
    setLoading(true);
    setError(null);
    const res = await listAttivitaMentionCaselleAction({
      aziendaTipo,
      aziendaId: az.entityId,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setCaselle(res.items);
    setStep("caselle");
  }

  async function openMails(c: MentionCasella) {
    setCasella(c);
    setLoading(true);
    setError(null);
    const res = await listAttivitaMentionMailsByCasellaAction({
      email: c.email,
      accountId: c.accountId,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMails(res.items);
    setStep("mail-casella");
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/50 px-4 py-10"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Collega mail</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {step === "scelta"
                ? "Cerca per oggetto/mittente oppure parti dall’azienda."
                : step === "cerca-mail"
                  ? "Cerca tra le mail visibili."
                  : step === "azienda-tipo" || step === "azienda-elenco"
                    ? "Scegli cliente o possibile cliente."
                    : step === "caselle"
                      ? `Caselle di ${azienda?.label ?? "azienda"} e referenti.`
                      : `Mail di ${casella?.email ?? "casella"}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
          >
            Chiudi
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {picking ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Carico la mail e gli allegati…
          </p>
        ) : null}

        {step === "scelta" ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("cerca-mail");
                setQ("");
                setMails([]);
              }}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm font-medium hover:bg-sky-100"
            >
              Cerca la mail
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("azienda-tipo");
                setQ("");
                setAziende([]);
              }}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium hover:bg-amber-100"
            >
              Cerca tramite azienda
            </button>
          </div>
        ) : null}

        {step === "cerca-mail" ? (
          <div className="mt-4 space-y-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearchMails();
              }}
              placeholder="Oggetto o mittente…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void runSearchMails()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {loading ? "Ricerca…" : "Cerca"}
            </button>
            <HitList items={mails} empty="Nessuna mail." onPick={pick} disabled={picking} />
          </div>
        ) : null}

        {step === "azienda-tipo" ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setAziendaTipo("cliente");
                setStep("azienda-elenco");
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              Clienti
            </button>
            <button
              type="button"
              onClick={() => {
                setAziendaTipo("cliente_possibile");
                setStep("azienda-elenco");
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              Possibili clienti
            </button>
          </div>
        ) : null}

        {step === "azienda-elenco" ? (
          <div className="mt-4 space-y-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearchAziende();
              }}
              placeholder={
                aziendaTipo === "cliente"
                  ? "Cerca cliente…"
                  : "Cerca possibile cliente…"
              }
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void runSearchAziende()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {loading ? "Ricerca…" : "Cerca"}
            </button>
            <HitList
              items={aziende}
              empty="Nessuna azienda."
              onPick={(hit) => void openCaselle(hit)}
            />
          </div>
        ) : null}

        {step === "caselle" ? (
          <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
            {loading ? (
              <li className="text-sm text-[var(--muted)]">Caricamento…</li>
            ) : caselle.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">
                Nessuna casella/email collegata.
              </li>
            ) : (
              caselle.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => void openMails(c)}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {c.email}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {step === "mail-casella" ? (
          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Caricamento mail…</p>
            ) : (
              <HitList
                items={mails}
                empty="Nessuna mail in questa casella."
                onPick={pick}
                disabled={picking}
              />
            )}
          </div>
        ) : null}

        {step !== "scelta" ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (step === "mail-casella") setStep("caselle");
                else if (step === "caselle") setStep("azienda-elenco");
                else if (step === "azienda-elenco") setStep("azienda-tipo");
                else setStep("scelta");
              }}
              className="text-xs text-[var(--muted)] underline"
            >
              Indietro
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HitList({
  items,
  empty,
  onPick,
  disabled = false,
}: {
  items: AttivitaMentionHit[];
  empty: string;
  onPick: (hit: AttivitaMentionHit) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto">
      {items.map((it) => (
        <li key={it.entityId}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(it)}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="font-medium">{it.label}</span>
            {it.hint ? (
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {it.hint}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
