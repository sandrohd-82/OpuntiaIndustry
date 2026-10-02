"use client";

import { FatturaA4PiePagina } from "@/components/amministrazione/FatturaA4PiePagina";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoDestinatarioPicker } from "@/components/amministrazione/PreventivoDestinatarioPicker";
import { PreventivoDocField } from "@/components/amministrazione/PreventivoDocPencil";
import {
  destinatarioToPreventivo,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function comeDestinatario(
  snap: FatturaDestinatarioSnapshot
): DestinatarioPreventivo {
  return destinatarioToPreventivo(snap, {
    kind: "cliente",
    id: "stampa",
    ragioneSociale: snap.ragioneSociale,
    partitaIva: snap.partitaIva,
    codiceFiscale: snap.codiceFiscale,
    codiceTarga: "",
    email: snap.email,
    sede: snap.sede,
  });
}

/** Stesso foglio della fattura di sistema, senza loghi e senza matite. */
export function FatturaClassicaStampa({
  model,
}: {
  model: FatturaClassicaStampaModel;
}) {
  return (
    <article className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
      <div className="box-border flex min-h-[297mm] flex-col px-[14mm] py-[12mm]">
        <PreventivoA4Letterhead
          numero={model.numero}
          dataPreventivo={model.dataDocumento}
          commerciale={model.commerciale}
          documentoLabel="FATTURA"
          stampa
          nascondiLogo
        />
        <PreventivoDestinatarioPicker
          value={comeDestinatario(model.destinatario)}
          onChange={() => {}}
          onEdit={() => {}}
          stampa
        />
        <div className="mt-8 border-t border-slate-200 pt-5">
          <PreventivoDocField
            label="Prodotti"
            onEdit={() => {}}
            stampa
          >
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-slate-300 text-slate-600">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                  <th className="py-1.5 pr-2 font-medium">Qty</th>
                  <th className="py-1.5 pr-2 font-medium">Listino</th>
                  <th className="py-1.5 pr-2 font-medium">Sconto</th>
                  <th className="py-1.5 pr-2 font-medium">Netto</th>
                  <th className="py-1.5 font-medium">IVA</th>
                </tr>
              </thead>
              <tbody>
                {model.righe.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-2 text-slate-400 italic">
                      Nessuna riga prodotto
                    </td>
                  </tr>
                ) : (
                  model.righe.map((r, i) => {
                    const netto = prezzoScontatoUnitario(
                      r.prezzoUnitario,
                      r.scontoPercentuale
                    );
                    return (
                      <tr
                        key={`${r.codice}-${i}`}
                        className="border-b border-slate-100"
                      >
                        <td className="py-1.5 pr-2">
                          {r.codice} — {r.descrizione}
                          {r.note.trim() ? (
                            <div className="text-[10px] text-slate-600">
                              {r.note.trim()}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">
                          {r.quantita} {r.unitaMisura}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">
                          {euro(r.prezzoUnitario)} €
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">
                          {r.scontoPercentuale > 0
                            ? `${r.scontoPercentuale} %`
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums font-medium">
                          {euro(netto)} €
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {r.ivaPercentuale}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </PreventivoDocField>
          <PreventivoDocField
            label="Note"
            onEdit={() => {}}
            className="mt-4"
            stampa
          >
            <p className="whitespace-pre-line text-[11px] leading-[1.45] text-slate-800">
              {model.note.trim() || "Nessuna nota documento."}
            </p>
          </PreventivoDocField>
          <div className="mt-3 h-px w-full bg-slate-900" />
        </div>
        <FatturaA4PiePagina
          piano={model.piano}
          onEditPagamento={() => {}}
          onEditTotali={() => {}}
          numero={model.numero}
          dataDocumento={model.dataDocumento}
          ivaPercentuale={model.ivaPercentuale}
          imponibile={model.imponibile}
          totaleIva={model.imposta}
          totale={model.totale}
          nascondiLoghi
        />
      </div>
    </article>
  );
}
