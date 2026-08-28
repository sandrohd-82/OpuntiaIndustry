"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendWebmailNuovaMailAction } from "@/app/actions/webmail";

type Props = {
  accountId: string;
  accountLabel: string;
  fromAddress: string;
};

export function WebmailComposeForm({
  accountId,
  accountLabel,
  fromAddress,
}: Props) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await sendWebmailNuovaMailAction({
        accountId,
        to,
        cc: cc.trim() || undefined,
        subject,
        bodyText,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Mail inviata.");
      setTo("");
      setCc("");
      setSubject("");
      setBodyText("");
      router.push(`/app/webmail/caselle/${accountId}/in-arrivo`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Da <strong>{accountLabel}</strong> ({fromAddress})
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">A *</span>
        <input
          type="text"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="destinatario@esempio.it"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Cc</span>
        <input
          type="text"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="opzionale"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Oggetto *</span>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Messaggio *</span>
        <textarea
          required
          rows={14}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Invio…" : "Invia"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            router.push(`/app/webmail/caselle/${accountId}/in-arrivo`)
          }
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
