"use client";

import { useEffect, useId, useState } from "react";
import { generaCorpoMailFatturaAction } from "@/app/actions/fattura-mail";
import { listCaselleSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import { CanaleAttenzioneBanners } from "@/components/amministrazione/CanaleAttenzioneControls";
import { buildFatturaA4PdfBlob } from "@/lib/amministrazione/fattura-a4-pdf";
import { totalsFromFatturaRighe } from "@/lib/amministrazione/fattura-a4-documento";
import type { FatturaInvioMailDraft } from "@/lib/amministrazione/fattura-invio-mail";
import { ORDINI_PERSISTENZA_DEFINITIVA } from "@/lib/amministrazione/ordine-sessione";

type Props = {
  draft: FatturaInvioMailDraft;
  onClose: () => void;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function FatturaWebmailComposeModal({ draft, onClose }: Props) {
  const titleId = useId();
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("Fattura.pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      setLoading(true);
      setError(null);
      const caselle = await listCaselleSpedizioneMailAction();
      if (cancelled) return;
      if (caselle.success) {
        setAccounts(caselle.accounts);
        setAccountId(caselle.accounts[0]?.id ?? "");
      }
      const totals = totalsFromFatturaRighe(draft.righe);
      const prodotti = draft.righe
        .map((r) => `${r.codice} ${r.descrizione}`.trim())
        .filter(Boolean)
        .join(", ");
      const ai = await generaCorpoMailFatturaAction({
        cliente: draft.clienteNome,
        numeroFattura: draft.numeroFattura,
        dataDocumento: draft.dataDocumento,
        ordineNumero: draft.ordineNumero,
        prodotti,
        totaleEuro: `${euro(totals.totale)} €`,
      });
      if (cancelled) return;
      if (ai.success) {
        setSubject(ai.subject);
        setBodyText(ai.bodyText);
        setAiModel(ai.model);
      } else {
        setError(ai.error);
      }
      try {
        const pdf = buildFatturaA4PdfBlob({
          numeroFattura: draft.numeroFattura,
          dataDocumento: draft.dataDocumento,
          destinatario: draft.destinatario,
          righe: draft.righe,
          noteDocumento: draft.noteDocumento,
        });
        objectUrl = URL.createObjectURL(pdf.blob);
        setPdfUrl(objectUrl);
        setPdfName(pdf.fileName);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "PDF fattura non generato."
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draft]);

  function confermaSessione() {
    setMsg(
      "Bozza Webmail pronta in sessione. Nessuna email è partita: quando riattiveremo l’invio definitivo, partirà da questa scheda con lo stesso allegato."
    );
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          Invio mail fattura · Webmail
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Scheda collegata alle caselle Webmail. Testo precompilato dall’AI;
          allegato PDF della fattura già pronto.
        </p>
        {!ORDINI_PERSISTENZA_DEFINITIVA ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Sessione di prova: nessuna email reale e nessuno SDI. L’invio vero
            userà questa stessa scheda.
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Preparazione bozza AI e PDF…
          </p>
        ) : (
          <>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Casella mittente</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Seleziona casella Webmail…</option>
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
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <CanaleAttenzioneBanners emails={[to]} />
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Oggetto</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Testo</span>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            {aiModel ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Bozza AI · modello {aiModel}
              </p>
            ) : null}
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium">Allegato</p>
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  download={pdfName}
                  className="mt-1 inline-block text-[var(--primary)] underline"
                >
                  {pdfName}
                </a>
              ) : (
                <p className="text-xs text-amber-800">PDF non disponibile.</p>
              )}
            </div>
          </>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {msg ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {msg}
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
            disabled={loading || !subject.trim() || !bodyText.trim()}
            onClick={confermaSessione}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {ORDINI_PERSISTENZA_DEFINITIVA
              ? "Invia da Webmail"
              : "Conferma bozza (sessione)"}
          </button>
        </div>
      </div>
    </div>
  );
}
