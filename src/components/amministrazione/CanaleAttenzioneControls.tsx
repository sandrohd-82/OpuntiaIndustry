"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPhone, FaEnvelope } from "react-icons/fa6";
import {
  clearContattoCanaleAttenzioneAction,
  lookupContattoCanaleAttenzioneAction,
  lookupManyContattoCanaleAttenzioniAction,
  upsertContattoCanaleAttenzioneAction,
} from "@/app/actions/contatto-canale-attenzione";
import { listWebmailMenuAccountsAction } from "@/app/actions/webmail";
import {
  parseCanaleEmailList,
  telHref,
  type ContattoCanaleAttenzione,
  type ContattoCanaleKind,
} from "@/lib/amministrazione/contatto-canale-attenzione";

function InfoEditLabel({ hasNota }: { hasNota: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold ${
        hasNota
          ? "border-amber-400 bg-amber-100 text-amber-950"
          : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      Info
    </span>
  );
}

function AvvisoBang() {
  return (
    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-amber-400 bg-amber-100 text-sm font-extrabold text-amber-950">
      !
    </span>
  );
}

export function CanaleAttenzioneButton({
  canale,
  valore,
  mode = "edit",
}: {
  canale: ContattoCanaleKind;
  valore: string;
  /** edit = bottone Info in scheda. view = ! solo se c'è una nota. */
  mode?: "edit" | "view";
}) {
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [item, setItem] = useState<ContattoCanaleAttenzione | null>(null);
  const [clausola, setClausola] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = valore.trim().length > 0;

  useEffect(() => {
    if (!ready) {
      setItem(null);
      return;
    }
    let cancelled = false;
    void lookupContattoCanaleAttenzioneAction({ canale, valore }).then(
      (res) => {
        if (cancelled || !res.success) return;
        setItem(res.item);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [canale, valore, ready]);

  function openEdit() {
    if (!ready) return;
    setError(null);
    setClausola(item?.clausola ?? "");
    setOpen(true);
  }

  if (mode === "view") {
    if (!ready || !item) return null;
    return (
      <>
        <button
          type="button"
          title="Nota di avviso"
          aria-label={`Nota di avviso su ${valore}`}
          onClick={() => setViewOpen(true)}
          className="shrink-0"
        >
          <AvvisoBang />
        </button>
        {viewOpen ? (
          <div
            className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/50 p-4 py-16"
            onClick={() => setViewOpen(false)}
          >
            <div
              role="dialog"
              className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Avviso · {canale === "email" ? "Mail" : "Telefono"}
              </p>
              <p className="mt-1 font-mono text-sm text-slate-800">{valore}</p>
              <p className="mt-3 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {item.clausola}
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={() => setViewOpen(false)}
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!ready}
        title={
          ready
            ? item
              ? "Modifica la nota di avviso"
              : "Inserisci una nota di avviso"
            : "Inserisci prima il valore"
        }
        onClick={openEdit}
        className="shrink-0 disabled:opacity-40"
      >
        <InfoEditLabel hasNota={Boolean(item)} />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/50 p-4 py-16"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Nota di avviso · {canale === "email" ? "Mail" : "Telefono"}
            </p>
            <p className="mt-1 font-mono text-sm text-slate-800">{valore}</p>
            <textarea
              value={clausola}
              onChange={(e) => setClausola(e.target.value)}
              rows={5}
              placeholder="Nota di avviso visibile in compose e prima della chiamata…"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {error ? (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                Chiudi
              </button>
              {item ? (
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  onClick={() => {
                    startTransition(async () => {
                      const res = await clearContattoCanaleAttenzioneAction({
                        canale,
                        valore,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setItem(null);
                      setClausola("");
                      setOpen(false);
                    });
                  }}
                >
                  Rimuovi
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending || !clausola.trim()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  startTransition(async () => {
                    const res = await upsertContattoCanaleAttenzioneAction({
                      canale,
                      valore,
                      clausola,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setItem(res.item);
                    setOpen(false);
                  });
                }}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CallConfirm({
  valore,
  clausola,
  onClose,
}: {
  valore: string;
  clausola: string | null;
  onClose: () => void;
}) {
  const href = telHref(valore);
  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/50 p-4 py-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Chiamata
        </p>
        <p className="mt-1 font-mono text-sm text-slate-800">{valore}</p>
        {clausola ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {clausola}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            Annulla
          </button>
          {href ? (
            <a
              href={href}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"
              onClick={onClose}
            >
              Chiama
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CanaleCallButton({ valore }: { valore: string }) {
  const [open, setOpen] = useState(false);
  const [clausola, setClausola] = useState<string | null>(null);
  const ready = valore.trim().length > 0;

  return (
    <>
      <button
        type="button"
        disabled={!ready}
        title="Chiama"
        aria-label={`Chiama ${valore}`}
        onClick={() => {
          if (!ready) return;
          void lookupContattoCanaleAttenzioneAction({
            canale: "telefono",
            valore,
          }).then((res) => {
            setClausola(res.success ? (res.item?.clausola ?? null) : null);
            setOpen(true);
          });
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
      >
        <FaPhone size={12} />
      </button>
      {open ? (
        <CallConfirm
          valore={valore}
          clausola={clausola}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function CanaleMailButton({ valore }: { valore: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = valore.trim().includes("@");

  return (
    <>
      <button
        type="button"
        disabled={!ready || pending}
        title="Scrivi mail"
        aria-label={`Scrivi mail a ${valore}`}
        onClick={() => {
          if (!ready) return;
          startTransition(async () => {
            const res = await listWebmailMenuAccountsAction();
            if (!res.success || res.accounts.length === 0) {
              setError("Nessuna casella webmail disponibile.");
              return;
            }
            const granted = new Set(res.grantedIds);
            const acc =
              res.accounts.find((a) => granted.has(a.id)) ?? res.accounts[0];
            router.push(
              `/app/webmail/caselle/${acc.id}/nuova?to=${encodeURIComponent(valore.trim())}`
            );
          });
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-sky-700 hover:bg-sky-50 disabled:opacity-40"
      >
        <FaEnvelope size={12} />
      </button>
      {error ? (
        <span className="sr-only">{error}</span>
      ) : null}
    </>
  );
}

export function CanaleInputRow({
  label,
  canale,
  value,
  onChange,
  type,
  inputMode,
  placeholder,
}: {
  label?: string;
  canale: ContattoCanaleKind;
  value: string;
  onChange: (v: string) => void;
  type?: "email" | "text";
  inputMode?: "tel" | "email";
  placeholder?: string;
}) {
  return (
    <div className="block text-sm">
      {label ? (
        <span className="mb-1 block font-medium">{label}</span>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type={type ?? "text"}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
        <CanaleAttenzioneButton canale={canale} valore={value} />
        {canale === "telefono" ? <CanaleCallButton valore={value} /> : null}
        {canale === "email" ? <CanaleMailButton valore={value} /> : null}
      </div>
    </div>
  );
}

export function CanaleAttenzioneBanners({
  emails,
  telefoni,
}: {
  emails?: string[];
  telefoni?: string[];
}) {
  const [items, setItems] = useState<ContattoCanaleAttenzione[]>([]);
  const emailKey = (emails ?? []).join("|");
  const telKey = (telefoni ?? []).join("|");

  useEffect(() => {
    const parsedEmails = emailKey
      .split("|")
      .flatMap((e) => parseCanaleEmailList(e));
    const tels = telKey.split("|").filter((t) => t.trim());
    if (parsedEmails.length === 0 && tels.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void lookupManyContattoCanaleAttenzioniAction({
      emails: parsedEmails,
      telefoni: tels,
    }).then((res) => {
      if (cancelled || !res.success) return;
      setItems(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, [emailKey, telKey]);

  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          <p className="text-[10px] font-bold uppercase tracking-wide">
            ! · {item.valoreDisplay || item.valoreNormalizzato}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{item.clausola}</p>
        </div>
      ))}
    </div>
  );
}

export function CanaleReadonlyActions({
  email,
  telefono,
}: {
  email?: string;
  telefono?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {telefono ? (
        <>
          <CanaleAttenzioneButton
            mode="view"
            canale="telefono"
            valore={telefono}
          />
          <CanaleCallButton valore={telefono} />
        </>
      ) : null}
      {email ? (
        <>
          <CanaleAttenzioneButton mode="view" canale="email" valore={email} />
          <CanaleMailButton valore={email} />
        </>
      ) : null}
    </span>
  );
}
