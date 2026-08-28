"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  sendWebmailNuovaMailAction,
  translateWebmailTextAction,
} from "@/app/actions/webmail";
import { WEBMAIL_TRANSLATE_LANGS } from "@/lib/webmail/translate-langs";

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
  const [outboundLang, setOutboundLang] = useState("en");
  const [translation, setTranslation] = useState<{
    subject: string | null;
    bodyText: string;
    targetLangLabel: string;
  } | null>(null);
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
      setTranslation(null);
      router.push(`/app/webmail/caselle/${accountId}/in-arrivo`);
      router.refresh();
    });
  }

  function translateOutbound() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await translateWebmailTextAction({
        subject,
        bodyText,
        targetLang: outboundLang,
        direction: "outbound",
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTranslation({
        subject: res.subject,
        bodyText: res.bodyText,
        targetLangLabel: res.targetLangLabel,
      });
      setInfo(`Traduzione → ${res.targetLangLabel} (${res.model}).`);
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

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Traduci in
          </span>
          <select
            value={outboundLang}
            onChange={(e) => setOutboundLang(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm"
          >
            {WEBMAIL_TRANSLATE_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !bodyText.trim()}
          onClick={translateOutbound}
          className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 disabled:opacity-50"
        >
          Traduci
        </button>
        {translation ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (translation.subject) setSubject(translation.subject);
              setBodyText(translation.bodyText);
              setInfo(
                `Traduzione applicata (${translation.targetLangLabel}). Puoi rivedere e inviare.`
              );
            }}
            className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Applica al messaggio
          </button>
        ) : null}
      </div>
      {translation ? (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-slate-800">
          {[
            translation.subject ? `Oggetto: ${translation.subject}` : null,
            translation.bodyText,
          ]
            .filter(Boolean)
            .join("\n\n")}
        </pre>
      ) : null}

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
