import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import {
  formatDateIt,
  formatEuro,
  labelStatoPagamento,
  prezzoScontatoUnitario,
  type Fattura,
} from "@/lib/amministrazione/fatture";
import Link from "next/link";

type Props = {
  fattura: Fattura;
};

export function FatturaDettaglioView({ fattura }: Props) {
  const listHref =
    fattura.kind === "emessa"
      ? "/app/amministrazione/fatture/emesse"
      : "/app/amministrazione/fatture/ricevute";
  const entityLabel = fattura.kind === "emessa" ? "Cliente" : "Fornitore";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={listHref}
            className="text-sm text-[var(--muted)] hover:text-slate-800"
          >
            ← Torna all&apos;elenco
          </Link>
          <h2 className="mt-2 font-mono text-xl font-semibold">
            {fattura.numeroInterno}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDateIt(fattura.dataEmissione)}
            {fattura.numeroDocumentoEsterno
              ? ` · Doc. esterno ${fattura.numeroDocumentoEsterno}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
              fattura.statoPagamento === "pagato"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {labelStatoPagamento(fattura.statoPagamento)}
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {entityLabel}
        </h3>
        <p className="mt-1 font-medium">
          <span className="font-mono text-sm">{fattura.anagraficaCodiceTarga}</span>{" "}
          {fattura.anagraficaRagioneSociale}
        </p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Codice</th>
              <th className="px-4 py-3">Descrizione</th>
              <th className="px-4 py-3">Qtà</th>
              <th className="px-4 py-3">Listino</th>
              <th className="px-4 py-3">Sconto %</th>
              <th className="px-4 py-3">Prezzo netto</th>
              <th className="px-4 py-3">Importo</th>
            </tr>
          </thead>
          <tbody>
            {fattura.righe.map((r, i) => {
              const netto = prezzoScontatoUnitario(
                r.prezzoUnitario,
                r.scontoPercentuale
              );
              return (
                <tr key={r.id ?? i} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono text-xs">{r.codice}</td>
                  <td className="px-4 py-3">{r.descrizione}</td>
                  <td className="px-4 py-3 tabular-nums">{r.quantita}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.scontoPercentuale > 0 ? (
                      <span className="text-[var(--muted)] line-through">
                        {formatEuro(r.prezzoUnitario)}
                      </span>
                    ) : (
                      formatEuro(r.prezzoUnitario)
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.scontoPercentuale > 0
                      ? `${r.scontoPercentuale} %`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatEuro(netto)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(r.importo)}
                  </td>
                </tr>
              );
            })}
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
