"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FaDownload, FaXmark } from "react-icons/fa6";
import {
  auditCommercialistaPaperAction,
  getCommercialistaPaperBatchAction,
  scaricaElaborazioneFattureExcelAction,
  type CommercialistaPaperDoc,
} from "@/app/actions/commercialista";
import { formatEuro } from "@/lib/amministrazione/fatture";
import { buildElaborazioneFattureXlsx } from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import {
  righeElaborazioneFatture,
  titoliElaborazioneExcel,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  buildFatturaClassicaPdf,
  buildPaperFatturaPdf,
  chiediCartellaScrittura,
  nomiPdfUnivoci,
  scriviFileInCartella,
} from "@/lib/amministrazione/fattura-classica-pdf";
import {
  etichettaRegistro,
  nomeFoglioRegistro,
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

type Props = {
  kind: CommercialistaRegistroKind;
  anno: number;
  trimestre: TrimestreNumero;
  onClose: () => void;
};

export function CommercialistaElaboraFattureModal({
  kind,
  anno,
  trimestre,
  onClose,
}: Props) {
  const titleId = useId();
  const [docs, setDocs] = useState<CommercialistaPaperDoc[]>([]);
  const [labelPeriodo, setLabelPeriodo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scaricaMsg, setScaricaMsg] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();
  const [scaricando, setScaricando] = useState(false);
  const kindLabel = etichettaRegistro(kind);
  const beneConsumo = registroMostraBeneConsumo(kind);
  const righe = useMemo(
    () => righeElaborazioneFatture(docs, kind),
    [docs, kind]
  );
  const titoli = titoliElaborazioneExcel(kind);

  useEffect(() => {
    startLoad(async () => {
      const res = await getCommercialistaPaperBatchAction({
        kind,
        anno,
        trimestre,
      });
      if (!res.success) {
        setError(res.error);
        setDocs([]);
        return;
      }
      setError(null);
      setDocs(res.docs);
      setLabelPeriodo(res.labelPeriodo);
    });
  }, [kind, anno, trimestre]);

  async function salvaCartella() {
    if (docs.length === 0 || scaricando) return;
    setScaricaMsg(null);
    let scelta: Awaited<ReturnType<typeof chiediCartellaScrittura>>;
    try {
      scelta = await chiediCartellaScrittura();
    } catch (err) {
      setScaricaMsg(
        err instanceof Error ? err.message : "Non sono riuscito a chiedere la cartella."
      );
      return;
    }
    if (!scelta) return;
    setScaricando(true);
    try {
      const nomeCartella = nomeFoglioRegistro(kind);
      const cartella = await scelta.getDirectoryHandle(nomeCartella, {
        create: true,
      });
      const nomi = nomiPdfUnivoci(
        docs.map((doc) => ({
          numeroSequenza: doc.numeroSequenza,
          numeroFattura:
            doc.numeroDocumento ||
            doc.classica?.numero ||
            doc.model.numero ||
            doc.numeroInterno,
          data: doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data || "",
        })),
        "entrata"
      );
      for (let i = 0; i < docs.length; i += 1) {
        const doc = docs[i];
        const fileName = nomi[i] ?? `documento_${i + 1}.pdf`;
        const pdf = doc.classica
          ? buildFatturaClassicaPdf({
              model: doc.classica,
              numeroSequenza: doc.numeroSequenza,
              showSequenza: doc.numeroSequenza != null,
              fileName,
            })
          : buildPaperFatturaPdf({
              model: doc.model,
              numeroSequenza: doc.numeroSequenza,
              fileName,
            });
        await scriviFileInCartella(cartella, pdf.fileName, pdf.blob);
      }
      const excel = await buildElaborazioneFattureXlsx({
        kind,
        anno,
        trimestre,
        docs,
        collegaPdf: true,
      });
      await scriviFileInCartella(
        cartella,
        excel.filename,
        new Blob([excel.bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      await auditCommercialistaPaperAction({
        kind,
        anno,
        trimestre,
        mode: "salva_cartella",
        documenti: docs.length,
        mostraSequenza: true,
      });
      setScaricaMsg(
        `Cartella «${nomeCartella}» salvata: ${docs.length} PDF e il resoconto. Il numero documento apre il PDF.`
      );
    } catch (err) {
      setScaricaMsg(
        err instanceof Error ? err.message : "Non sono riuscito a salvare la cartella."
      );
    } finally {
      setScaricando(false);
    }
  }

  async function scarica() {
    if (righe.length === 0 || scaricando) return;
    setScaricaMsg(null);
    setScaricando(true);
    try {
      const res = await scaricaElaborazioneFattureExcelAction({
        kind,
        anno,
        trimestre,
      });
      if (!res.success) {
        setScaricaMsg(res.error);
        return;
      }
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setScaricaMsg("Excel scaricato.");
    } catch (err) {
      setScaricaMsg(
        err instanceof Error ? err.message : "Non sono riuscito a scaricare l'Excel."
      );
    } finally {
      setScaricando(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950/70"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full min-h-0 flex-col bg-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Elabora {kindLabel}
              </h2>
              <p className="text-xs text-slate-500">
                {labelPeriodo || `Anno ${anno} · T${trimestre}`}
                {docs.length > 0 ? ` · ${docs.length} documenti` : null}
              </p>
              {beneConsumo ? (
                <p className="mt-1 max-w-xl text-xs text-slate-500">
                  Il numero 1 è il primo documento del 1° gennaio. Salva cartella
                  chiede dove scrivere: dentro trovi i PDF e il resoconto, e il
                  numero documento apre il PDF.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={righe.length === 0 || scaricando || pending}
                onClick={() => void (beneConsumo ? salvaCartella() : scarica())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaDownload size={12} />
                {scaricando
                  ? "Preparazione…"
                  : (beneConsumo ? "Salva cartella" : "Scarica Excel")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50"
                aria-label="Chiudi"
              >
                <FaXmark size={14} />
              </button>
            </div>
          </div>
          {scaricaMsg ? (
            <p className="mx-auto mt-2 max-w-6xl text-xs text-slate-700">
              {scaricaMsg}
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
          {pending ? (
            <p className="text-center text-sm text-slate-600">
              Preparazione elenco…
            </p>
          ) : error ? (
            <p className="mx-auto max-w-6xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : righe.length === 0 ? (
            <p className="text-center text-sm text-slate-600">
              Nessun documento nel periodo.
            </p>
          ) : (
            <div className="mx-auto max-w-6xl overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-800 text-xs text-white">
                  <tr>
                    {titoli.map((titolo) => (
                      <th
                        key={titolo}
                        className="px-3 py-2 font-semibold whitespace-nowrap"
                      >
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
                        {beneConsumo ? (
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {riga.numeroDocumento || "—"}
                          </td>
                        ) : null}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {riga.data}
                        </td>
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
                        <td
                          className={`px-3 py-1.5 text-center ${
                            beneConsumo ? "text-xl leading-none" : ""
                          }`}
                        >
                          {riga.nazione}
                        </td>
                        {beneConsumo ? (
                          <>
                            <td className="px-3 py-1.5 text-center">
                              {riga.origineDocumento || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center font-medium">
                              {riga.beneAmmortizzabile ?? "—"}
                            </td>
                          </>
                        ) : null}
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
                        {beneConsumo ? <td className="px-3 py-2" /> : null}
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
                        {beneConsumo ? (
                          <>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                          </>
                        ) : null}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
