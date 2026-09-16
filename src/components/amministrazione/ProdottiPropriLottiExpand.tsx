"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listLottiAgrinsiciliaProdottoAction } from "@/app/actions/magazzino-lotti";
import type { LottoAgrinsiciliaElencoRiga } from "@/lib/magazzino/types";

function lottoHref(row: LottoAgrinsiciliaElencoRiga): string {
  const q = new URLSearchParams({
    codice: row.lottoCodice,
    prodotto: row.prodottoId,
  });
  return `/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita/lotto?${q.toString()}`;
}

export function ProdottiPropriLottiExpand({
  prodottoId,
  colSpan,
}: {
  prodottoId: string;
  colSpan: number;
}) {
  const [lotti, setLotti] = useState<LottoAgrinsiciliaElencoRiga[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listLottiAgrinsiciliaProdottoAction(prodottoId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setLotti([]);
        return;
      }
      setLotti(res.lotti);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [prodottoId]);

  return (
    <tr className="border-t border-[var(--border)] bg-slate-50/80">
      <td colSpan={colSpan} className="px-4 py-3">
        {lotti === null ? (
          <p className="text-xs text-[var(--muted)]">Caricamento lotti…</p>
        ) : error ? (
          <p className="text-xs text-red-700">{error}</p>
        ) : lotti.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            Nessun lotto registrato per questo prodotto.
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                <th className="pb-2 pr-3 font-medium">Lotto interno</th>
                <th className="pb-2 pr-3 font-medium">Quantità</th>
                <th className="pb-2 pr-3 font-medium">Fogli / lotto esterno</th>
                <th className="pb-2 pr-3 font-medium">Confezione / isolamento</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lotti.map((l) => (
                <tr key={l.lottoCodice} className="border-t border-slate-200">
                  <td className="py-2 pr-3 font-mono text-[12px] font-semibold">
                    {l.lottoCodice}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {l.quantitaKg.toLocaleString("it-IT")} kg
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {l.foglioCodice ? `Lav. ${l.foglioCodice}` : "—"}
                    {l.foglioIngressoCodice
                      ? ` · MP ${l.foglioIngressoCodice}`
                      : ""}
                    {l.lottoUscitaCodice
                      ? ` · est. ${l.lottoUscitaCodice}`
                      : ""}
                  </td>
                  <td className="py-2 pr-3">
                    {l.daCompletareCi ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                        Da completare
                      </span>
                    ) : (
                      <span>
                        {l.confezioneNome ?? "—"} · {l.isolamentoNome ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Link
                      href={lottoHref(l)}
                      className="font-medium text-[var(--primary)] hover:underline"
                    >
                      Dettaglio
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
