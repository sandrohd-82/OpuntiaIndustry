"use client";

import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import {
  formatDateIt,
  formatEuro,
  labelModalitaCollegamentoNc,
  labelNaturaDocumento,
  labelStatoPagamento,
  prezzoScontatoUnitario,
  type Fattura,
} from "@/lib/amministrazione/fatture";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import Link from "next/link";

type Props = {
  fattura: Fattura;
  /** full = 100% del contenitore (il parent usa tipicamente 94% viewport) */
  layoutWidth?: "boxed" | "full";
  variant?: "page" | "preview";
  previewTitle?: string;
  onEdit?: () => void;
};

export function FatturaDettaglioView({
  fattura,
  layoutWidth = "boxed",
  variant = "page",
  previewTitle,
  onEdit,
}: Props) {
  const isPreview = variant === "preview";
  const listHref =
    fattura.kind === "nota_credito"
      ? "/app/amministrazione/fatture/note-credito"
      : fattura.kind === "emessa"
        ? "/app/amministrazione/fatture/emesse"
        : "/app/amministrazione/fatture/ricevute";
  const entityLabel =
    fattura.kind === "ricevuta" ? "Fornitore" : "Cliente";
  const widthClass =
    layoutWidth === "full" ? "w-full max-w-none" : "mx-auto w-[94%] max-w-none";

  return (
    <div className={`${widthClass} space-y-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!isPreview ? (
            <Link
              href={listHref}
              className="text-sm text-[var(--muted)] hover:text-slate-800"
            >
              ← Torna all&apos;elenco
            </Link>
          ) : null}
          {isPreview && previewTitle ? (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {previewTitle}
            </p>
          ) : null}
          <h2
            className={`font-mono font-semibold ${isPreview ? "mt-1 text-lg" : "mt-2 text-xl"}`}
          >
            {fattura.numeroInterno}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDateIt(fattura.dataEmissione)}
            {fattura.numeroDocumentoEsterno
              ? ` · Doc. esterno ${fattura.numeroDocumentoEsterno}`
              : ""}
            {fattura.versione ? ` · v${fattura.versione}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onEdit && !isPreview ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Modifica
            </button>
          ) : null}
          {fattura.kind === "nota_credito" &&
          fattura.modalitaCollegamento === "sostituzione" ? (
            <span className="inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900">
              {labelModalitaCollegamentoNc(fattura.modalitaCollegamento)}
            </span>
          ) : null}
          {fattura.kind === "ricevuta" ? (
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                fattura.naturaDocumento === "acconto"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {labelNaturaDocumento(fattura.naturaDocumento)}
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
              fattura.statoPagamento === "annullata"
                ? "border-slate-300 bg-slate-100 text-slate-800"
                : fattura.statoPagamento === "pagato"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {labelStatoPagamento(fattura.statoPagamento, fattura.kind, {
              annullataDaNcNumeroInterno: fattura.annullataDaNcNumeroInterno,
            })}
          </span>
          {fattura.ficId ? (
            <ApriFatturaFicButton
              kind={fattura.kind}
              ficId={fattura.ficId}
              variant="button"
            />
          ) : null}
        </div>
      </div>

      {fattura.statoPagamento === "annullata" && !isPreview ? (
        <section className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Fattura annullata — non contabilizzata</p>
          <p className="mt-1 text-[var(--muted)]">
            Stornata con nota di credito{" "}
            {fattura.annullataDaNcId ? (
              <Link
                href={fatturaDetailPath("nota_credito", fattura.annullataDaNcId)}
                className="font-mono font-medium text-[var(--primary)] hover:underline"
              >
                {fattura.annullataDaNcNumeroInterno || "NC"}
              </Link>
            ) : (
              <span className="font-mono">
                {fattura.annullataDaNcNumeroInterno || "—"}
              </span>
            )}
            . Esclusa da incassi, IVA e scadenziario.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {entityLabel}
        </h3>
        <p className="mt-1 font-medium">
          <span className="font-mono text-sm">{fattura.anagraficaCodiceTarga}</span>{" "}
          {fattura.anagraficaRagioneSociale}
        </p>
      </section>

      {fattura.kind === "nota_credito" && !isPreview ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Collegamento
          </h3>
          <p className="mt-1">
            Modalità:{" "}
            <strong>
              {labelModalitaCollegamentoNc(fattura.modalitaCollegamento)}
            </strong>
          </p>
          {fattura.fatturaCollegataId ? (
            <p className="mt-1">
              Fattura stornata:{" "}
              <Link
                href={fatturaDetailPath("emessa", fattura.fatturaCollegataId)}
                className="font-mono font-medium text-[var(--primary)] hover:underline"
              >
                {fattura.fatturaCollegataNumeroInterno ||
                  fattura.riferimentoFatturaEsterno ||
                  "Fattura collegata"}
              </Link>
              <span className="text-[var(--muted)]">
                {" "}
                (anteprima sotto · resta registrata e visibile)
              </span>
            </p>
          ) : null}
          {fattura.modalitaCollegamento === "sostituzione" &&
          fattura.fatturaSostitutivaId ? (
            <p className="mt-1">
              Fattura sostitutiva:{" "}
              <Link
                href={fatturaDetailPath("emessa", fattura.fatturaSostitutivaId)}
                className="font-mono font-medium text-[var(--primary)] hover:underline"
              >
                {fattura.fatturaSostitutivaNumeroInterno ||
                  "Fattura di rimpiazzo"}
              </Link>
              <span className="text-[var(--muted)]"> (anteprima sotto)</span>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Codice</th>
              <th className="px-4 py-3 font-medium">Descrizione</th>
              <th className="px-4 py-3 font-medium">Qtà</th>
              <th className="px-4 py-3 font-medium">Listino</th>
              <th className="px-4 py-3 font-medium">Sconto %</th>
              <th className="px-4 py-3 font-medium">Prezzo netto</th>
              <th className="px-4 py-3 font-medium">Importo</th>
            </tr>
          </thead>
          <tbody>
            {fattura.righe.length === 0 ? (
              <tr className="border-t border-[var(--border)]">
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  Nessuna riga prodotto registrata.
                  {onEdit && !isPreview
                    ? " Usa «Modifica» per inserire codice, descrizione, quantità e prezzi."
                    : null}
                </td>
              </tr>
            ) : (
              fattura.righe.map((r, i) => {
                const netto = prezzoScontatoUnitario(
                  r.prezzoUnitario,
                  r.scontoPercentuale
                );
                const isStorno = r.quantita < 0;
                return (
                  <tr
                    key={r.id ?? i}
                    className={
                      isStorno
                        ? "border-t border-amber-200 bg-amber-50/40"
                        : "border-t border-[var(--border)]"
                    }
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-900">
                      {r.codice?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {r.descrizione?.trim() || "—"}
                      {isStorno ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          Storno
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {r.quantita}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {r.scontoPercentuale > 0 ? (
                        <span className="text-[var(--muted)] line-through">
                          {formatEuro(r.prezzoUnitario)}
                        </span>
                      ) : (
                        formatEuro(r.prezzoUnitario)
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {r.scontoPercentuale > 0
                        ? `${r.scontoPercentuale} %`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-900">
                      {formatEuro(netto)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {formatEuro(r.importo)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Spedizione
          </p>
          <p className="mt-1 tabular-nums font-medium">
            {formatEuro(fattura.spedizione)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {fattura.spedizioneIvaApplicata
              ? "IVA applicata anche sulla spedizione"
              : "IVA non applicata sulla spedizione"}
            {fattura.kind === "nota_credito"
              ? fattura.spedizioneSottraiIncassi
                ? " · sottratta dagli incassi"
                : " · non sottratta (resta negli incassi)"
              : ""}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Imponibile
          </p>
          <p className="mt-1 tabular-nums font-medium">
            {formatEuro(fattura.imponibile)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            IVA {fattura.ivaPercentuale}%
          </p>
          <p className="mt-1 tabular-nums font-medium">
            {formatEuro(fattura.imposta)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Totale
          </p>
          <p className="mt-1 text-lg tabular-nums font-semibold">
            {formatEuro(fattura.totale)}
          </p>
        </div>
      </section>

      {fattura.dilazioni.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Dilazioni</h3>
          </div>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Data scadenza</th>
                <th className="px-4 py-3 font-medium">Importo</th>
                <th className="px-4 py-3 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {fattura.dilazioni.map((d, i) => (
                <tr key={d.id ?? i} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">{formatDateIt(d.dataScadenza)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(d.importo)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                        d.statoPagamento === "pagato"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {labelStatoPagamento(d.statoPagamento)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {fattura.note ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Note
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{fattura.note}</p>
        </section>
      ) : null}
    </div>
  );
}
