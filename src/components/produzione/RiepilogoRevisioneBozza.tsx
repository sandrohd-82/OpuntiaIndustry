"use client";

import type { DifferenzaRevisione } from "@/lib/produzione/revisione-da-proposta";

const ESITO: Record<DifferenzaRevisione["esito"], string> = {
  modificata: "Modifica",
  aggiunta: "Consegna aggiunta",
  eliminata: "Consegna eliminata",
};

export function RiepilogoRevisioneBozza(props: {
  differenze: DifferenzaRevisione[];
  motivo: string | null;
  applicabile: boolean;
  giaApplicata: boolean;
  pending: boolean;
  onConferma: () => void;
  onChiudi: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Riepilogo prima della bozza</h3>
        <button type="button" onClick={props.onChiudi} className="text-sm text-slate-600">
          Chiudi
        </button>
      </div>
      <p className="mt-1 text-slate-700">
        La versione già pubblicata non cambia. Dopo la pubblicazione il fornitore vede la nuova
        versione e deve accettarla di nuovo.
      </p>
      {props.differenze.length > 0 ? (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-2 font-medium">Voce</th>
              <th className="py-1 pr-2 font-medium">Valore attuale</th>
              <th className="py-1 pr-2 font-medium">Valore proposto</th>
              <th className="py-1 font-medium">Esito</th>
            </tr>
          </thead>
          <tbody>
            {props.differenze.map((riga) => (
              <tr key={`${riga.codice}-${riga.esito}-${riga.proposto}`} className="border-t border-amber-100">
                <td className="py-1 pr-2">{riga.codice}</td>
                <td className="py-1 pr-2">{riga.attuale}</td>
                <td className="py-1 pr-2">{riga.proposto}</td>
                <td className="py-1">{ESITO[riga.esito]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {props.motivo ? <p className="mt-2 text-slate-800">{props.motivo}</p> : null}
      {props.applicabile && !props.giaApplicata ? (
        <button
          type="button"
          disabled={props.pending}
          onClick={props.onConferma}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Applica alla bozza
        </button>
      ) : null}
    </div>
  );
}
