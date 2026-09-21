"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { listLottiAgrinsiciliaProdottoAction } from "@/app/actions/magazzino-lotti";
import { PiantaPostoMappaModal } from "@/components/magazzino/PiantaPostoMappaModal";
import {
  fetchOccupazioniPiantaProdotto,
  formatKgIt,
  type OccupazioneLottoPianta,
} from "@/lib/magazzino/posto-occupazione";
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
  prodottoCodice,
  colSpan,
}: {
  prodottoId: string;
  prodottoCodice?: string;
  colSpan: number;
}) {
  const [lotti, setLotti] = useState<LottoAgrinsiciliaElencoRiga[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perLotto, setPerLotto] = useState<
    Record<string, OccupazioneLottoPianta>
  >({});
  const [aperto, setAperto] = useState<string | null>(null);
  const [mappa, setMappa] = useState<{
    ubicazioneId: string;
    postoCodice: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOccupazioniPiantaProdotto(prodottoId).then((occ) => {
      if (cancelled || !occ.success) return;
      setPerLotto(occ.perLotto);
    });
    void listLottiAgrinsiciliaProdottoAction(prodottoId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error);
          setLotti([]);
          return;
        }
        setLotti(res.lotti);
        setError(null);
        return fetchOccupazioniPiantaProdotto(
          prodottoId,
          res.lotti.map((l) => l.lottoCodice)
        );
      })
      .then((occ) => {
        if (cancelled || !occ || !occ.success) return;
        setPerLotto((prev) => ({ ...prev, ...occ.perLotto }));
      })
      .catch(() => {
        /* elenco lotti: se fallisce resta il messaggio error */
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
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                <th className="pb-2 pr-3 font-medium">Lotto interno</th>
                <th className="pb-2 pr-3 font-medium">Quantità</th>
                <th className="pb-2 pr-3 font-medium">Fogli / lotto esterno</th>
                <th className="pb-2 pr-3 font-medium">Confezione / isolamento</th>
                <th className="pb-2 font-medium" />
                <th className="w-10 pb-2" />
              </tr>
            </thead>
            <tbody>
              {lotti.map((l) => {
                const pianta = perLotto[l.lottoCodice];
                const apertoLotto = aperto === l.lottoCodice;
                return (
                  <Fragment key={l.lottoCodice}>
                    <tr className="border-t border-slate-200">
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
                        {pianta?.riepilogo ? (
                          <span className="font-medium text-slate-900">
                            {pianta.riepilogo}
                          </span>
                        ) : (
                          <span className="text-slate-500">Non in pianta</span>
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
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          aria-expanded={apertoLotto}
                          aria-label={
                            apertoLotto
                              ? "Chiudi confezionamenti"
                              : "Apri confezionamenti in pianta"
                          }
                          onClick={() =>
                            setAperto((id) =>
                              id === l.lottoCodice ? null : l.lottoCodice
                            )
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-white"
                        >
                          {apertoLotto ? (
                            <FaChevronUp size={12} />
                          ) : (
                            <FaChevronDown size={12} />
                          )}
                        </button>
                      </td>
                    </tr>
                    {apertoLotto ? (
                      <tr className="border-t border-slate-200 bg-white/80">
                        <td colSpan={6} className="py-2 pl-8 pr-2">
                          <div className="border-l-2 border-emerald-700 pl-3">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Confezionamenti in pianta
                              {prodottoCodice ? ` · ${prodottoCodice}` : ""}
                            </p>
                            {!pianta?.righe.length ? (
                              <p className="text-xs text-slate-500">
                                Nessun sacco o cartone caricato in pianta per
                                questo lotto.
                              </p>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                                    <th className="pb-1 pr-2 font-medium">
                                      Codice
                                    </th>
                                    <th className="pb-1 pr-2 font-medium">
                                      Peso
                                    </th>
                                    <th className="pb-1 pr-2 font-medium">
                                      Tipo
                                    </th>
                                    <th className="pb-1 pr-2 font-medium">
                                      Codice
                                    </th>
                                    <th className="pb-1 pr-2 font-medium">
                                      Posto
                                    </th>
                                    <th className="pb-1 font-medium" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {pianta.righe.map((r) => (
                                    <tr
                                      key={r.elementoId}
                                      className="border-t border-slate-100"
                                    >
                                      <td className="py-1.5 pr-2 font-mono font-semibold">
                                        {r.codiceElemento}
                                      </td>
                                      <td className="py-1.5 pr-2 tabular-nums">
                                        {formatKgIt(r.pesoKg)}
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        {r.tipoSacco}
                                      </td>
                                      <td className="py-1.5 pr-2 font-mono">
                                        {r.targa || prodottoCodice || "—"}
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        {r.postoCodice || "—"}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setMappa({
                                              ubicazioneId: r.ubicazioneId,
                                              postoCodice: r.postoCodice,
                                            })
                                          }
                                          className="rounded-md border border-emerald-800 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-950 hover:bg-emerald-50"
                                        >
                                          Mostra in mappa
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {mappa ? (
          <PiantaPostoMappaModal
            ubicazioneId={mappa.ubicazioneId}
            postoCodice={mappa.postoCodice}
            onClose={() => setMappa(null)}
          />
        ) : null}
      </td>
    </tr>
  );
}
