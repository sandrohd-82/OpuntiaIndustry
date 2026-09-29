"use client";

import { useEffect, useState } from "react";
import {
  completaCalcoloSpedizionePreventivoAction,
  contestoSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  type Preventivo,
} from "@/lib/amministrazione/preventivi";

export function PreventivoCalcoloSpedizioneSheet({
  item,
  onClose,
  onCompleted,
}: {
  item: Preventivo;
  onClose: () => void;
  onCompleted: (message: string) => void;
}) {
  const [azienda, setAzienda] = useState(item.cliente);
  const [indirizzo, setIndirizzo] = useState("Caricamento indirizzo…");
  const [importo, setImporto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void contestoSpedizionePreventivoAction(item.id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setIndirizzo("Indirizzo non disponibile.");
        return;
      }
      setAzienda(res.azienda || item.cliente);
      setIndirizzo(res.indirizzo);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.cliente]);

  const peso = item.righe.reduce(
    (sum, riga) => sum + (Number.isFinite(riga.quantita) ? riga.quantita : 0),
    0
  );

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">
          Calcolo spedizione · {item.numeroInterno}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const valore = Number(importo.replace(",", "."));
              if (!Number.isFinite(valore) || valore < 0) {
                setError("Inserisci il costo della spedizione.");
                return;
              }
              setBusy(true);
              setError(null);
              void completaCalcoloSpedizionePreventivoAction({
                preventivoId: item.id,
                importo: valore,
              }).then((res) => {
                setBusy(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                onCompleted(
                  res.provaChiusa
                    ? "Mail inviata all'indirizzo indicato. Il preventivo di prova è uscito dall'archivio."
                    : `Spedizione inserita. Preventivo ${item.numeroInterno} inviato.`
                );
              });
            }}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Invio…" : "Completa"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mx-auto mb-3 max-w-[210mm] rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <article className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-200">
        <div className="box-border flex min-h-[297mm] flex-col px-[14mm] py-[12mm]">
          <PreventivoA4Letterhead
            numero={item.numeroInterno}
            dataPreventivo={item.dataPreventivo}
            commerciale={{
              id: item.commercialeRiferimentoId ?? "",
              nome: item.commercialeRiferimentoNome,
              telefono: item.commercialeRiferimentoTelefono,
              email: item.commercialeRiferimentoEmail,
            }}
          />

          <div className="mt-6 text-[12px] leading-relaxed">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              Azienda di spedizione
            </p>
            <p className="font-semibold">{azienda}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
              Indirizzo
            </p>
            <p>{indirizzo}</p>
            <p className="mt-2 text-slate-600">
              {PREVENTIVO_CONSEGNA_LABEL[item.consegnaMetodo]} · peso {peso} kg
            </p>
          </div>

          <table className="mt-6 w-full text-left text-[11px]">
            <thead className="border-b border-slate-300 text-slate-600">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Codice</th>
                <th className="py-1.5 pr-2 font-medium">Nome prodotto</th>
                <th className="py-1.5 pr-2 font-medium">Qty</th>
                <th className="py-1.5 pr-2 font-medium">Imballaggio</th>
              </tr>
            </thead>
            <tbody>
              {item.righe.map((riga) => (
                <tr key={riga.id} className="border-t border-slate-200">
                  <td className="py-1.5 pr-2 font-medium">{riga.prodottoCodice}</td>
                  <td className="py-1.5 pr-2">{riga.prodottoNome}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {riga.quantita} {riga.unitaMisura}
                  </td>
                  <td className="py-1.5 pr-2">
                    {riga.confezionamento.trim() || "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-300">
                <td className="py-2 pr-2 font-medium">—</td>
                <td className="py-2 pr-2">Contributo spese di spedizione</td>
                <td className="py-2 pr-2">1</td>
                <td className="py-2 pr-2">
                  <label className="block text-[10px] text-slate-500">
                    Costo €
                    <input
                      inputMode="decimal"
                      value={importo}
                      onChange={(e) => setImporto(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                    />
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
