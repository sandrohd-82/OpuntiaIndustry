"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquisisciLockSpedizionePreventivoAction,
  apriPdfPreventivoEmessoAction,
  completaCalcoloSpedizionePreventivoAction,
  contestoSpedizionePreventivoAction,
  getPreventivoPerModificaAction,
  rilasciaLockSpedizionePreventivoAction,
  rinnovaLockSpedizionePreventivoAction,
} from "@/app/actions/preventivi";
import {
  PreventivoFoglioA4,
  type PreventivoFoglioDestinatario,
} from "@/components/amministrazione/PreventivoFoglioA4";
import { foglioPreventivoToPdfBase64 } from "@/lib/amministrazione/preventivo-foglio-cattura";
import {
  AGRINSICILIA_LETTERHEAD,
  AGRINSICILIA_MAIL_FIRMA,
  formatDestinatarioIndirizzo,
} from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_IVA_DEFAULT,
  type Preventivo,
} from "@/lib/amministrazione/preventivi";

export function PreventivoCalcoloSpedizioneSheet({
  item,
  modo = "completa",
  onClose,
  onCompleted,
}: {
  item: Preventivo;
  modo?: "dettagli" | "completa";
  onClose: () => void;
  onCompleted?: (message: string) => void;
}) {
  const foglioRef = useRef<HTMLDivElement>(null);
  const [azienda, setAzienda] = useState(item.cliente);
  const [indirizzo, setIndirizzo] = useState("Caricamento indirizzo…");
  const [destinatario, setDestinatario] =
    useState<PreventivoFoglioDestinatario | null>(null);
  const [importo, setImporto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockOk, setLockOk] = useState(modo === "dettagli");
  const [mailMittente, setMailMittente] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailOggetto, setMailOggetto] = useState("");
  const [mailTesto, setMailTesto] = useState("");
  const [confermaInvio, setConfermaInvio] = useState(false);
  const chiuso = useRef(false);
  const solaLettura = modo === "dettagli";

  useEffect(() => {
    if (solaLettura) return;
    let cancelled = false;
    chiuso.current = false;
    void acquisisciLockSpedizionePreventivoAction(item.id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setLockOk(false);
        setError(res.error);
        return;
      }
      setLockOk(true);
    });
    const beat = window.setInterval(() => {
      void rinnovaLockSpedizionePreventivoAction(item.id);
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(beat);
      if (!chiuso.current) {
        void rilasciaLockSpedizionePreventivoAction(item.id);
      }
    };
  }, [item.id, solaLettura]);

  useEffect(() => {
    let cancelled = false;
    void getPreventivoPerModificaAction(item.id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        if (solaLettura) setError(res.error);
        return;
      }
      setMailMittente(res.foglio.mailMittente);
      setMailTo(res.foglio.mailTo);
      setMailOggetto(res.foglio.mailOggetto);
      setMailTesto(res.foglio.mailTesto);
      if (!solaLettura || !res.foglio.destinatario) return;
      const sede = formatDestinatarioIndirizzo(res.foglio.destinatario.sede);
      setDestinatario({
        ragioneSociale: res.foglio.destinatario.ragioneSociale,
        partitaIva: res.foglio.destinatario.partitaIva,
        codiceFiscale: res.foglio.destinatario.codiceFiscale,
        via: sede.via,
        capCitta: sede.capCitta,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, solaLettura]);

  useEffect(() => {
    if (solaLettura) return;
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
  }, [item.id, item.cliente, solaLettura]);

  const peso = item.righe.reduce(
    (sum, riga) => sum + (Number.isFinite(riga.quantita) ? riga.quantita : 0),
    0
  );
  const valore = Number(importo.replace(",", "."));
  const importoPronto =
    importo.trim() !== "" && Number.isFinite(valore) && valore >= 0;
  const importoFoglio = importoPronto && valore > 0 ? valore : 0;

  const mailVuota = !mailTo.trim() && !mailOggetto.trim() && !mailTesto.trim();
  const spedizioneScheda = solaLettura ? item.spedizioneImporto : importoFoglio;
  const spedizioneDaCalcolare = solaLettura
    ? item.stato === "in_attesa_spedizione" && item.spedizioneImporto <= 0
    : !importoPronto || valore <= 0;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          {solaLettura ? "Dettaglio" : "Calcolo spedizione"} · {item.numeroInterno}
        </h2>
        <div className="flex flex-wrap gap-2">
          {item.pdfEmessi.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => {
                void apriPdfPreventivoEmessoAction(doc.id).then((res) => {
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  window.open(res.url, "_blank", "noopener,noreferrer");
                });
              }}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
            >
              {item.pdfEmessi.length > 1 ? `PDF v${doc.versione}` : "PDF inviato"}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
          >
            {solaLettura ? "Chiudi" : "Annulla"}
          </button>
          {solaLettura ? null : (
            <button
              type="button"
              disabled={busy || !lockOk || !confermaInvio || !(valore > 0)}
              onClick={() => {
                if (!importoPronto || !(valore > 0)) {
                  setError("Inserisci il costo della spedizione.");
                  return;
                }
                if (!confermaInvio) {
                  setError(
                    "Conferma l'invio della mail. Senza conferma non parte nulla."
                  );
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
                      confermaInvio: true,
                    })
                  )
                  .then((res) => {
                    setBusy(false);
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    chiuso.current = true;
                    onCompleted?.(
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
              {busy ? "Invio…" : "Conferma e invia"}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="min-h-0 overflow-auto bg-slate-200 px-3 py-4">
          {solaLettura ? null : (
            <div className="mx-auto mb-3 w-[210mm] max-w-full rounded border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-800">
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
              <label className="mt-3 flex items-start gap-2 text-[12px] text-slate-800">
                <input
                  type="checkbox"
                  checked={confermaInvio}
                  onChange={(e) => setConfermaInvio(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Confermo il prezzo e autorizzo l&apos;invio della mail al
                  cliente. Prima di questa conferma non parte nulla.
                </span>
              </label>
            </div>
          )}
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
            spedizioneImporto={spedizioneScheda}
            spedizioneDaCalcolare={spedizioneDaCalcolare}
            note={item.note}
            giorniConsegna={item.giorniConsegna || "da concordare"}
            tipoPagamento={item.tipoPagamento}
            ivaPercentuale={item.righe[0]?.ivaPercentuale || PREVENTIVO_IVA_DEFAULT}
            validitaGiorni={item.validitaGiorni}
          />
        </div>

        <div className="min-h-0 overflow-y-auto border-t border-slate-200 bg-white px-5 py-5 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold text-slate-900">Mail</h3>
          {mailVuota ? (
            <p className="mt-3 text-sm text-slate-500">
              Nessuna mail compilata per questo preventivo.
            </p>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-slate-800">
              <p>
                <span className="font-semibold">Mittente: </span>
                {mailMittente || "—"}
              </p>
              <p>
                <span className="font-semibold">Destinatario: </span>
                {mailTo || "—"}
              </p>
              <p>
                <span className="font-semibold">Oggetto: </span>
                {mailOggetto || "—"}
              </p>
              <div className="whitespace-pre-wrap border-t border-slate-200 pt-3 leading-relaxed">
                {mailTesto}
              </div>
              <div className="border-t border-slate-200 pt-3">
                <img
                  src={AGRINSICILIA_LETTERHEAD.logoSrc}
                  alt={AGRINSICILIA_LETTERHEAD.logoAlt}
                  className="h-14 w-auto"
                />
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-800">
                  {AGRINSICILIA_MAIL_FIRMA}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
