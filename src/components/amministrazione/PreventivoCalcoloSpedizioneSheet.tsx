"use client";

import { useEffect, useRef, useState } from "react";
import {
  completaCalcoloSpedizionePreventivoAction,
  contestoSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import {
  PreventivoFoglioA4,
  type PreventivoFoglioDestinatario,
} from "@/components/amministrazione/PreventivoFoglioA4";
import { foglioPreventivoToPdfBase64 } from "@/lib/amministrazione/preventivo-foglio-cattura";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_IVA_DEFAULT,
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
  const foglioRef = useRef<HTMLDivElement>(null);
  const [azienda, setAzienda] = useState(item.cliente);
  const [indirizzo, setIndirizzo] = useState("Caricamento indirizzo…");
  const [destinatario, setDestinatario] =
    useState<PreventivoFoglioDestinatario | null>(null);
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
      setDestinatario(res.destinatario);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.cliente]);

  const peso = item.righe.reduce(
    (sum, riga) => sum + (Number.isFinite(riga.quantita) ? riga.quantita : 0),
    0
  );
  const valore = Number(importo.replace(",", "."));
  const importoPronto =
    importo.trim() !== "" && Number.isFinite(valore) && valore >= 0;
  const importoFoglio = importoPronto && valore > 0 ? valore : 0;

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
              if (!importoPronto) {
                setError("Inserisci il costo della spedizione.");
                return;
              }
              const node = foglioRef.current;
              if (!node) {
                setError("La scheda del preventivo non è pronta.");
                return;
              }
              setBusy(true);
              setError(null);
              void foglioPreventivoToPdfBase64(node)
                .then((pdfBase64) =>
                  completaCalcoloSpedizionePreventivoAction({
                    preventivoId: item.id,
                    importo: valore,
                    pdfBase64,
                  })
                )
                .then((res) => {
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
                })
                .catch((e: unknown) => {
                  setBusy(false);
                  setError(
                    e instanceof Error
                      ? `Scheda non allegata: ${e.message}`
                      : "Scheda non allegata."
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

      <div className="mx-auto mb-3 w-[210mm] max-w-full rounded border border-white/15 bg-white px-4 py-3 text-[12px] text-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Azienda di spedizione
        </p>
        <p className="mt-1 font-semibold">{azienda}</p>
        <p>{indirizzo}</p>
        <p className="mt-1 text-slate-600">
          {PREVENTIVO_CONSEGNA_LABEL[item.consegnaMetodo]} · peso {peso} kg
        </p>
        <label className="mt-2 block text-[11px] text-slate-600">
          Costo spedizione €
          <input
            inputMode="decimal"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
            className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
      </div>

      <PreventivoFoglioA4
        ref={foglioRef}
        stampa
        numero={item.numeroInterno}
        dataPreventivo={item.dataPreventivo}
        commerciale={{
          id: item.commercialeRiferimentoId ?? "",
          nome: item.commercialeRiferimentoNome,
          telefono: item.commercialeRiferimentoTelefono,
          email: item.commercialeRiferimentoEmail,
        }}
        destinatario={destinatario}
        righe={item.righe.map((riga) => ({
          key: riga.id,
          prodottoCodice: riga.prodottoCodice,
          prodottoNome: riga.prodottoNome,
          quantita: riga.quantita,
          unitaMisura: riga.unitaMisura,
          prezzoUnitario: riga.prezzoUnitario,
          ivaPercentuale: riga.ivaPercentuale,
          scontoExtraPct: riga.scontoExtraPct,
          scontoListinoPct: riga.scontoListinoPct,
          scontoListinoStandardPct: riga.scontoListinoStandardPct,
          confezionamento: riga.confezionamento,
        }))}
        consegnaMetodo={item.consegnaMetodo}
        spedizioneImporto={importoFoglio}
        spedizioneDaCalcolare={!importoPronto || valore <= 0}
        note={item.note}
        giorniConsegna={item.giorniConsegna || "da concordare"}
        tipoPagamento={item.tipoPagamento}
        ivaPercentuale={item.righe[0]?.ivaPercentuale || PREVENTIVO_IVA_DEFAULT}
        validitaGiorni={item.validitaGiorni}
      />
    </div>
  );
}
