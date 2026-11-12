"use client";

import { useState } from "react";
import { FatturaA4PiePagina } from "@/components/amministrazione/FatturaA4PiePagina";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
import { PreventivoDocField } from "@/components/amministrazione/PreventivoDocPencil";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  etichettaScontoDocumento,
  nettoUnitarioDocumento,
  totalsFromFatturaRighe,
  type FatturaA4Riga,
} from "@/lib/amministrazione/fattura-a4-documento";
import type { EmissioneRigaInput } from "@/lib/amministrazione/fattura-emissione";
import type { OrdinePagamentoPiano } from "@/lib/amministrazione/ordine-pagamento-piano";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";

export type BozzaSezione =
  | "fattura-cliente"
  | "fattura-righe"
  | "fattura-note"
  | "fattura-pagamento";

type Props = {
  numero: string;
  dataDocumento: string;
  commerciale: PreventivoCommercialeRiferimento | null;
  cliente: Cliente | null;
  noteDocumento: string;
  onDataDocumento: (value: string) => void;
  piano: OrdinePagamentoPiano;
  righe: EmissioneRigaInput[];
  imponibile: number;
  imposta: number;
  totale: number;
  onVaiA: (sezione: BozzaSezione, rigaIndex?: number) => void;
};

function rigaDocumento(r: EmissioneRigaInput): FatturaA4Riga {
  return {
    prodottoId: r.prodottoId,
    codice: r.codice,
    descrizione: r.descrizione,
    quantita: r.quantita,
    unitaMisura: r.unitaMisura || "kg",
    prezzoUnitario: r.prezzoUnitario,
    scontoPercentuale: r.scontoPercentuale,
    scontoListinoPct: r.scontoListinoPct,
    scontoExtraPct: r.scontoExtraPct,
    ivaPercentuale: r.ivaPercentuale,
    isSpedizione: r.isSpedizione,
    note: r.note,
  };
}

export function FatturaEmissioneDocumento({
  numero,
  dataDocumento,
  commerciale,
  cliente,
  noteDocumento,
  onDataDocumento,
  piano,
  righe,
  imponibile,
  imposta,
  totale,
  onVaiA,
}: Props) {
  const docRighe = righe.map(rigaDocumento);
  const ivaPct =
    docRighe.find((r) => !r.isSpedizione && r.ivaPercentuale > 0)
      ?.ivaPercentuale ?? 22;
  const sede = cliente?.sedeAmministrativa;
  const [dataAperta, setDataAperta] = useState(false);
  const [dataBozza, setDataBozza] = useState(dataDocumento);

  return (
    <article
      id="bozza-fattura"
      className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
    >
      <div className="box-border flex min-h-[297mm] flex-col px-[14mm] py-[12mm]">
        <PreventivoA4Letterhead
          numero={numero || "…"}
          dataPreventivo={dataDocumento}
          commerciale={commerciale}
          documentoLabel="FATTURA"
          onEditData={() => {
            setDataBozza(dataDocumento);
            setDataAperta(true);
          }}
          onEditCommerciale={() => onVaiA("fattura-cliente")}
        />

        <button
          type="button"
          onClick={() => onVaiA("fattura-cliente")}
          className="mt-6 w-full rounded-lg border border-transparent px-1 py-2 text-left hover:border-slate-300"
        >
          <p className="text-[12px] font-bold">
            {cliente?.ragioneSociale || "Seleziona il cliente"}
          </p>
          <p className="text-[11px] leading-snug text-slate-700">
            {[sede?.indirizzo, sede?.cap, sede?.citta, sede?.provincia]
              .filter(Boolean)
              .join(", ") || "Intestazione dalla anagrafica"}
          </p>
          <p className="text-[11px] text-slate-700">
            {cliente?.partitaIva ? `P.IVA ${cliente.partitaIva}` : "P.IVA"}
            {cliente?.codiceFiscale ? ` · C.F. ${cliente.codiceFiscale}` : ""}
          </p>
        </button>

        <div className="mt-[18mm] border-t border-slate-200 pt-6">
          <PreventivoDocField
            label="Modifica prodotti, prezzi e sconto"
            onEdit={() => onVaiA("fattura-righe", 0)}
          >
            <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
              <thead className="text-slate-700">
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">Prodotto</th>
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">Qty</th>
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">Listino</th>
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">Sconto</th>
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">Netto</th>
                  <th className="border border-slate-300 px-2 py-1.5 font-medium">IVA</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right font-medium">Tot</th>
                </tr>
              </thead>
              <tbody>
                {docRighe.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="border border-slate-300 px-2 py-3 text-slate-500"
                    >
                      Nessuna riga. Aggiungila nel form: il foglio si aggiorna subito.
                    </td>
                  </tr>
                ) : (
                  docRighe.map((r, i) => {
                    const netto = nettoUnitarioDocumento(r);
                    const totRiga = totalsFromFatturaRighe([r]).totale;
                    return (
                      <tr
                        key={`${r.codice}-${i}`}
                        className={`cursor-pointer ${i % 2 === 0 ? "bg-white" : "bg-slate-100"}`}
                        onClick={() => onVaiA("fattura-righe", i)}
                      >
                        <td className="border border-slate-300 px-2 py-1.5">
                          {r.codice ? `${r.codice} — ` : ""}
                          {r.descrizione || "Riga da compilare"}
                          {r.note ? (
                            <span className="mt-0.5 block text-[10px] text-slate-500">
                              {r.note.replace(/\{\{sconti:[^}]+\}\}/g, "").trim()}
                            </span>
                          ) : null}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                          {r.quantita} {r.unitaMisura}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                          {r.prezzoUnitario.toLocaleString("it-IT", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          €
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                          {etichettaScontoDocumento(r)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 tabular-nums font-medium">
                          {netto.toLocaleString("it-IT", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}{" "}
                          €
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 tabular-nums">
                          {r.ivaPercentuale}%
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold tabular-nums">
                          {totRiga.toLocaleString("it-IT", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          €
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </PreventivoDocField>
          <PreventivoDocField
            label="Modifica note e dicitura"
            onEdit={() => onVaiA("fattura-note")}
            className="mt-4"
          >
            <p className="whitespace-pre-line text-[11px] leading-[1.45] text-slate-800">
              {noteDocumento || "Nessuna nota documento."}
            </p>
          </PreventivoDocField>
          <div className="mt-3 h-px w-full bg-slate-900" />
        </div>

        <FatturaA4PiePagina
          piano={piano}
          onEditPagamento={() => onVaiA("fattura-pagamento")}
          onEditTotali={() => onVaiA("fattura-righe", 0)}
          numero={numero || "…"}
          dataDocumento={dataDocumento}
          ivaPercentuale={ivaPct}
          imponibile={imponibile}
          totaleIva={imposta}
          totale={totale}
        />
      </div>
      {dataAperta ? (
        <PreventivoEditModal
          title="Data fattura"
          onClose={() => setDataAperta(false)}
          onConfirm={() => {
            onDataDocumento(dataBozza);
            setDataAperta(false);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data documento</span>
            <input
              type="date"
              value={dataBozza}
              onChange={(e) => setDataBozza(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}
    </article>
  );
}
