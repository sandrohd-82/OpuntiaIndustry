"use client";

import { useMemo } from "react";
import { formatEuro } from "@/lib/amministrazione/fatture";
import {
  righeCartellaUscita,
  righeElaborazioneFatture,
  TITOLI_USCITA_EXCEL,
  titoliElaborazioneExcel,
  type FatturaElaborazioneSorgente,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";

export function ElaborazioneRegistroTabella({
  docs,
  kind,
}: {
  docs: FatturaElaborazioneSorgente[];
  kind: CommercialistaRegistroKind;
}) {
  const beneConsumo = registroMostraBeneConsumo(kind);
  const righe = useMemo(
    () => righeElaborazioneFatture(docs, kind),
    [docs, kind]
  );
  const titoli = titoliElaborazioneExcel(kind);
  const righeUscita = useMemo(
    () => (beneConsumo ? [] : righeCartellaUscita(docs, kind)),
    [beneConsumo, docs, kind]
  );

  if (docs.length === 0) {
    return (
      <p className="text-sm text-slate-600">Nessun documento nel periodo.</p>
    );
  }

  if (!beneConsumo) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-800 text-xs text-white">
            <tr>
              {TITOLI_USCITA_EXCEL.map((titolo) => (
                <th key={titolo} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {titolo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righeUscita.map((riga, index) =>
              riga.tipo === "documento" ? (
                <tr
                  key={`${riga.nomeFile}-${index}`}
                  className={
                    riga.notaCredito
                      ? "border-t border-red-100 bg-[#FEECEC]"
                      : "border-t border-slate-200"
                  }
                >
                  <td className="px-3 py-1.5 tabular-nums">
                    {riga.numeroProgressivo ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{riga.tipoDocumento}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{riga.numeroDocumento}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{riga.data}</td>
                  <td className="px-3 py-1.5">{riga.intestazione}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatEuro(riga.imponibile)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatEuro(riga.iva)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatEuro(riga.totale)}
                  </td>
                  <td className="px-3 py-1.5 text-center">{riga.nazione}</td>
                  <td className="px-3 py-1.5 text-center font-medium">
                    {riga.beniStrumentali}
                  </td>
                </tr>
              ) : (
                <tr
                  key={`t-${index}`}
                  className={
                    riga.tipo === "trimestre"
                      ? "border-t border-slate-800 bg-slate-900 font-semibold text-white"
                      : "border-t border-amber-200 bg-amber-50 font-semibold text-slate-900"
                  }
                >
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">{riga.etichetta}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(riga.imponibile)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(riga.iva)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(riga.totale)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-800 text-xs text-white">
          <tr>
            {titoli.map((titolo) => (
              <th key={titolo} className="px-3 py-2 font-semibold whitespace-nowrap">
                {titolo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {righe.map((riga, i) =>
            riga.tipo === "fattura" ? (
              <tr
                key={`f-${i}`}
                className={
                  riga.notaCredito
                    ? "border-t border-red-100 bg-[#FEECEC]"
                    : "border-t border-slate-200"
                }
              >
                <td className="px-3 py-1.5 tabular-nums">
                  {riga.numeroProvvisorio ?? "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {riga.nomeFile}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {riga.numeroDocumento || "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">{riga.data}</td>
                <td className="px-3 py-1.5">{riga.intestazione}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatEuro(riga.imponibile)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatEuro(riga.iva)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatEuro(riga.totale)}
                </td>
                <td className="px-3 py-1.5 text-center text-xl leading-none">
                  {riga.nazione}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {riga.origineDocumento || "—"}
                </td>
                <td className="px-3 py-1.5 text-center font-medium">
                  {riga.beneAmmortizzabile ?? "—"}
                </td>
              </tr>
            ) : (
              <tr
                key={`t-${i}`}
                className={
                  riga.tipo === "generale"
                    ? "border-t border-slate-800 bg-slate-900 font-semibold text-white"
                    : "border-t border-amber-200 bg-amber-50 font-semibold text-slate-900"
                }
              >
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2">{riga.etichetta}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatEuro(riga.imponibile)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatEuro(riga.iva)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatEuro(riga.totale)}
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
