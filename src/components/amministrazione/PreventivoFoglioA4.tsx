"use client";

import { Fragment, forwardRef } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoA4PiePagina } from "@/components/amministrazione/PreventivoA4PiePagina";
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_IVA_DEFAULT,
  prezzoNettoRigaPreventivo,
  roundEuro,
  type PreventivoConsegna,
} from "@/lib/amministrazione/preventivi";

export type PreventivoFoglioDestinatario = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  via: string;
  capCitta: string;
};

export type PreventivoFoglioRiga = {
  key: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: string;
  prezzoUnitario: number;
  ivaPercentuale: number;
  scontoExtraPct: number;
  scontoListinoPct?: number;
  scontoListinoStandardPct?: number;
  confezionamento: string;
};

type Props = {
  titleId?: string;
  numero: string;
  dataPreventivo: string;
  commerciale: PreventivoCommercialeRiferimento | null;
  destinatario: PreventivoFoglioDestinatario | null;
  righe: PreventivoFoglioRiga[];
  consegnaMetodo: PreventivoConsegna;
  spedizioneImporto: number;
  spedizioneDaCalcolare: boolean;
  note: string;
  giorniConsegna: string;
  tipoPagamento: OrdineTipoPagamento;
  ivaPercentuale?: number;
  validitaGiorni: number;
  /** Foglio da allegare: stessa grafica, senza matite. */
  stampa?: boolean;
  onEditData?: () => void;
  onEditCommerciale?: () => void;
  onEditDestinatario?: () => void;
  onEditProdotto?: (key?: string) => void;
  onRemoveRiga?: (key: string) => void;
  onAddRiga?: () => void;
  onEditNote?: () => void;
  onEditSpedizione?: () => void;
  onEditGiorni?: () => void;
  onEditPagamento?: () => void;
  onEditTotali?: () => void;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const PreventivoFoglioA4 = forwardRef<HTMLDivElement, Props>(
  function PreventivoFoglioA4(
    {
      titleId,
      numero,
      dataPreventivo,
      commerciale,
      destinatario,
      righe,
      consegnaMetodo,
      spedizioneImporto,
      spedizioneDaCalcolare,
      note,
      giorniConsegna,
      tipoPagamento,
      ivaPercentuale = PREVENTIVO_IVA_DEFAULT,
      validitaGiorni,
      stampa = false,
      onEditData,
      onEditCommerciale,
      onEditDestinatario,
      onEditProdotto,
      onRemoveRiga,
      onAddRiga,
      onEditNote,
      onEditSpedizione,
      onEditGiorni,
      onEditPagamento,
      onEditTotali,
    },
    ref
  ) {
    const ph = !destinatario;
    const ivaDocumento = ivaPercentuale > 0 ? ivaPercentuale : PREVENTIVO_IVA_DEFAULT;
    let imponibile = 0;
    let iva = 0;
    for (const riga of righe) {
      const netto = prezzoNettoRigaPreventivo(
        riga.prezzoUnitario,
        riga.scontoExtraPct,
        riga.scontoListinoPct ?? 0
      );
      const imp = netto * riga.quantita;
      const aliq = riga.ivaPercentuale > 0 ? riga.ivaPercentuale : ivaDocumento;
      imponibile += imp;
      iva += imp * (aliq / 100);
    }
    if (spedizioneImporto > 0) {
      imponibile += spedizioneImporto;
      iva += spedizioneImporto * (ivaDocumento / 100);
    }
    const impR = roundEuro(imponibile);
    const ivaR = roundEuro(iva);
    const totale = roundEuro(impR + ivaR);
    const spedizioneTesto =
      consegnaMetodo === "corriere_cliente" && spedizioneDaCalcolare
        ? "A carico dell'acquirente · prezzo da calcolare"
        : spedizioneImporto > 0
          ? `${PREVENTIVO_CONSEGNA_LABEL[consegnaMetodo]} · ${euro(spedizioneImporto)} €`
          : PREVENTIVO_CONSEGNA_LABEL[consegnaMetodo];
    const spedizioneNota =
      spedizioneImporto > 0 && !spedizioneDaCalcolare;

    return (
      <article
        role={titleId ? "dialog" : undefined}
        aria-modal={titleId ? true : undefined}
        aria-labelledby={titleId}
        className="paper-invoice-sheet mx-auto w-[210mm] max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
      >
        <div
          ref={ref}
          className="box-border flex min-h-[297mm] w-full flex-col bg-white px-[14mm] py-[12mm]"
        >
          <PreventivoA4Letterhead
            numero={numero}
            dataPreventivo={dataPreventivo}
            onEditData={onEditData}
            commerciale={commerciale}
            onEditCommerciale={onEditCommerciale}
            stampa={stampa}
          />

          <section className="mt-5">
            <PreventivoDocField
              label="Modifica destinatario"
              onEdit={onEditDestinatario ?? (() => {})}
              pencilRight
              stampa={stampa}
            >
              <div className="grid grid-cols-2 gap-6 text-[12px] leading-[1.45] text-slate-900">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                    Destinatario
                  </p>
                  <p
                    className={`mt-1 font-semibold uppercase ${
                      ph ? "text-slate-400" : ""
                    }`}
                  >
                    {destinatario?.ragioneSociale || "Spett.le Ragione sociale"}
                  </p>
                  <PreventivoDocQa
                    className={ph ? "text-slate-400" : undefined}
                    domanda="P.IVA"
                    risposta={destinatario?.partitaIva || "—"}
                  />
                  <PreventivoDocQa
                    className={ph ? "text-slate-400" : undefined}
                    domanda="CF"
                    risposta={destinatario?.codiceFiscale || "—"}
                  />
                </div>
                <div className="pt-5 text-right uppercase">
                  <p className={!destinatario?.via ? "text-slate-400 normal-case" : undefined}>
                    {destinatario?.via || "Via / indirizzo"}
                  </p>
                  <p
                    className={
                      !destinatario?.capCitta ? "text-slate-400 normal-case" : undefined
                    }
                  >
                    {destinatario?.capCitta || "CAP Città (PR)"}
                  </p>
                </div>
              </div>
            </PreventivoDocField>
          </section>

          <div className="mt-8 border-t border-slate-200 pt-5">
            <PreventivoDocField
              label="Aggiungi o modifica prodotti"
              onEdit={() => onEditProdotto?.()}
              stampa={stampa}
            >
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-slate-300 text-slate-600">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Codice</th>
                    <th className="py-1.5 pr-2 font-medium">Nome prodotto</th>
                    <th className="py-1.5 pr-2 font-medium">Prezzo U</th>
                    <th className="py-1.5 pr-2 font-medium">Qty</th>
                    <th className="py-1.5 pr-2 font-medium">Sconto</th>
                    <th className="py-1.5 pr-2 font-medium">Totale</th>
                    {stampa ? null : <th className="py-1.5 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {righe.length === 0 ? (
                    <tr>
                      <td colSpan={stampa ? 6 : 7} className="py-2 text-slate-400 italic">
                        Codice, nome, prezzo, quantità, sconto e totale…
                      </td>
                    </tr>
                  ) : (
                    righe.map((riga) => {
                      const netto = prezzoNettoRigaPreventivo(
                        riga.prezzoUnitario,
                        riga.scontoExtraPct,
                        riga.scontoListinoPct ?? 0
                      );
                      const totaleRiga = roundEuro(netto * riga.quantita);
                      const applicatoListino = riga.scontoListinoPct ?? 0;
                      const standard =
                        riga.scontoListinoStandardPct ?? applicatoListino;
                      const scontoParti: string[] = [];
                      if (applicatoListino > 0) {
                        scontoParti.push(
                          `${applicatoListino.toLocaleString("it-IT")}%`
                        );
                      }
                      if (riga.scontoExtraPct > 0) {
                        scontoParti.push(
                          `extra ${riga.scontoExtraPct.toLocaleString("it-IT")}%`
                        );
                      }
                      const dettaglio =
                        riga.confezionamento.trim() ||
                        "Nessun dettaglio di confezionamento";
                      const notaSconto =
                        applicatoListino + 0.0001 < standard
                          ? applicatoListino > 0
                            ? `Sconto standard ridotto al ${applicatoListino.toLocaleString("it-IT")}% (listino ${standard.toLocaleString("it-IT")}%). `
                            : "Sconto standard annullato. "
                          : "Sconto applicato a proposta di confezionamento. ";
                      return (
                        <Fragment key={riga.key}>
                          <tr className="border-t border-slate-300">
                            <td className="py-1.5 pr-2 font-medium">
                              {riga.prodottoCodice}
                            </td>
                            <td className="py-1.5 pr-2">{riga.prodottoNome}</td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {euro(riga.prezzoUnitario)} €
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {riga.quantita} {riga.unitaMisura}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums">
                              {scontoParti.length ? scontoParti.join(" + ") : "—"}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums font-medium">
                              {euro(totaleRiga)} €
                            </td>
                            {stampa ? null : (
                              <td className="py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => onEditProdotto?.(riga.key)}
                                  className="mr-1 text-[10px] text-slate-500 underline"
                                >
                                  modifica
                                </button>
                                {onRemoveRiga ? (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveRiga(riga.key)}
                                    className="text-red-600"
                                    aria-label="Rimuovi riga"
                                  >
                                    <FaTrash size={11} />
                                  </button>
                                ) : null}
                              </td>
                            )}
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td colSpan={stampa ? 6 : 7} className="px-0 pb-2 pt-0">
                              <p className="ml-6 max-w-[78%] text-[9px] leading-tight text-slate-500">
                                {notaSconto}
                                {dettaglio}
                              </p>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })
                  )}
                  {consegnaMetodo === "corriere_cliente" ? (
                    <tr className="border-t border-slate-300">
                      <td className="py-1.5 pr-2 font-medium">—</td>
                      <td className="py-1.5 pr-2">Contributo spese di spedizione</td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {spedizioneNota ? `${euro(spedizioneImporto)} €` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {spedizioneNota ? "1" : "—"}
                      </td>
                      <td className="py-1.5 pr-2">—</td>
                      <td className="py-1.5 pr-2 font-medium">
                        {spedizioneNota
                          ? `${euro(spedizioneImporto)} €`
                          : "Totale da calcolare"}
                      </td>
                      {stampa ? null : <td />}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </PreventivoDocField>
            {!stampa && righe.length > 0 && onAddRiga ? (
              <button
                type="button"
                onClick={onAddRiga}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400"
              >
                <FaPlus size={8} />
                Aggiungi riga
              </button>
            ) : null}

            <PreventivoDocField
              label="Modifica note"
              onEdit={onEditNote ?? (() => {})}
              className="mt-4"
              stampa={stampa}
            >
              <p className="whitespace-pre-line text-[11px] leading-[1.45] text-slate-800">
                {note}
              </p>
            </PreventivoDocField>

            <div className="mt-4 space-y-1 text-[11px] leading-[1.45]">
              <PreventivoDocField
                label="Modifica spedizione e consegna"
                onEdit={onEditSpedizione ?? (() => {})}
                stampa={stampa}
              >
                <PreventivoDocQa
                  domanda="Spedizione e consegna"
                  risposta={spedizioneTesto}
                />
              </PreventivoDocField>
              <PreventivoDocField
                label="Modifica giorni di consegna"
                onEdit={onEditGiorni ?? (() => {})}
                stampa={stampa}
              >
                <PreventivoDocQa
                  domanda="Giorni di consegna"
                  risposta={giorniConsegna}
                />
              </PreventivoDocField>
            </div>
            <div className="mt-3 h-px w-full bg-slate-900" />
          </div>

          <PreventivoA4PiePagina
            tipoPagamento={tipoPagamento}
            onEditPagamento={onEditPagamento ?? (() => {})}
            numero={numero}
            dataPreventivo={dataPreventivo}
            ivaPercentuale={ivaDocumento}
            validitaGiorni={validitaGiorni}
            onEditTotali={onEditTotali}
            stampa={stampa}
            imponibile={impR}
            totaleIva={ivaR}
            totalePreventivo={totale}
          />
        </div>
      </article>
    );
  }
);
