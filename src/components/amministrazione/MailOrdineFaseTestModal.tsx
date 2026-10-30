"use client";

import { useEffect, useId, useState } from "react";
import { inviaCopiaControlloOrdineAction } from "@/app/actions/prova-ordine";
import { listPreventivoCommercialiRiferimentoAction } from "@/app/actions/preventivi";
import { listCaselleSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import { fatturaA4PdfComeBozza } from "@/lib/amministrazione/fattura-a4-pdf";
import type { FatturaAnteprimaSessione } from "@/lib/amministrazione/ordine-sessione";
import { EMAIL_CONTROLLO_DEFAULT } from "@/lib/amministrazione/prova-ordine";

type Documento = "informativa" | "proforma" | "fattura";

type Props = {
  ordineId: string;
  numeroOrdine: string;
  accountId: string;
  documento: Documento;
  allegaPdf: boolean;
  allegaTracking: boolean;
  trackingUrl: string;
  oggetto: string;
  corpo: string;
  bozza?: Pick<
    FatturaAnteprimaSessione,
    | "numeroFattura"
    | "dataDocumento"
    | "destinatario"
    | "righe"
    | "noteDocumento"
    | "piano"
    | "commerciale"
  >;
  onClose: () => void;
  onInviata: (messaggio: string) => void;
};

function titolo(documento: Documento, allegaPdf: boolean): string {
  if (documento === "informativa") return "Mail informativa";
  if (documento === "proforma") {
    return allegaPdf
      ? "Mail con fattura proforma"
      : "Mail senza fattura proforma allegata";
  }
  return allegaPdf ? "Mail con fattura" : "Mail senza fattura allegata";
}

export function MailOrdineFaseTestModal({
  ordineId,
  numeroOrdine,
  accountId: accountIdScelto,
  documento,
  allegaPdf,
  allegaTracking,
  trackingUrl,
  oggetto,
  corpo,
  bozza,
  onClose,
  onInviata,
}: Props) {
  const titleId = useId();
  const [accountId, setAccountId] = useState(accountIdScelto);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [subject, setSubject] = useState(oggetto);
  const [body, setBody] = useState(corpo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conferma, setConferma] = useState(false);

  useEffect(() => {
    void listCaselleSpedizioneMailAction().then((res) => {
      if (res.success) setAccounts(res.accounts);
    });
  }, []);

  async function invia() {
    if (!accountId) {
      setError("Seleziona la casella mittente. La mail non parte da un'altra casella.");
      setConferma(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let pdfAllegato: { fileName: string; base64: string } | undefined;
      if (allegaPdf && documento !== "informativa" && bozza) {
        let commerciale = bozza.commerciale ?? null;
        if (!commerciale?.nome.trim()) {
          const elenco = await listPreventivoCommercialiRiferimentoAction({
            includiSenzaAccount: true,
          });
          if (elenco.success && elenco.defaultItem) {
            commerciale = {
              nome: elenco.defaultItem.nome,
              telefono: elenco.defaultItem.telefono,
              email: elenco.defaultItem.email,
            };
          }
        }
        pdfAllegato = await fatturaA4PdfComeBozza({
          numeroFattura: bozza.numeroFattura,
          dataDocumento: bozza.dataDocumento,
          destinatario: bozza.destinatario,
          righe: bozza.righe,
          noteDocumento: bozza.noteDocumento,
          piano: bozza.piano,
          proforma: documento === "proforma",
          commerciale,
        });
        if (pdfAllegato.base64.length > 2_500_000) pdfAllegato = undefined;
      }
      const res = await inviaCopiaControlloOrdineAction({
        ordineId,
        accountId,
        documento,
        allegaPdf,
        allegaTracking,
        trackingUrl,
        oggetto: subject,
        corpo: body,
        bozza: bozza
          ? {
              ...bozza,
              commerciale: bozza.commerciale ?? null,
            }
          : undefined,
        pdfAllegato,
      });
      setBusy(false);
      if (!res.success) {
        setError(res.error);
        setConferma(false);
        return;
      }
      onInviata(
        documento === "proforma"
          ? `Mail dell'ordine ${res.numeroOrdine} inviata solo a ${res.email}. In allegato c'è la fattura proforma. Lo SDI non è stato chiamato e il numero non è stato consumato.`
          : `Mail dell'ordine ${res.numeroOrdine} inviata solo a ${res.email}. In allegato c'è la fattura della bozza. Lo SDI non è stato chiamato e il numero non è stato consumato.`
      );
    } catch (e) {
      setBusy(false);
      setConferma(false);
      setError(e instanceof Error ? e.message : "La fattura della bozza non è stata allegata.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          {titolo(documento, allegaPdf)}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ordine {numeroOrdine}. Fase di prova: destinatario fisso{" "}
          {EMAIL_CONTROLLO_DEFAULT}. Nessun invio al cliente e nessuno SDI.
          {allegaTracking && trackingUrl.trim()
            ? " Il tracking entra nel testo."
            : " Il tracking non è allegato."}
        </p>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Casella mittente</span>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setConferma(false);
            }}
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
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium"
          >
            Chiudi
          </button>
          {conferma ? (
            <button
              type="button"
              disabled={busy || !accountId || !subject.trim() || !body.trim()}
              onClick={() => void invia()}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Invio…" : `Confermo: solo a ${EMAIL_CONTROLLO_DEFAULT}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={!accountId || !subject.trim() || !body.trim()}
              onClick={() => setConferma(true)}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Invia la mail
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
