"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaDownload, FaXmark } from "react-icons/fa6";
import {
  auditCommercialistaTrimestreAction,
  getCommercialistaPaperBatchAction,
  type CommercialistaPaperDoc,
} from "@/app/actions/commercialista";
import { ElaborazioneRegistroTabella } from "@/components/amministrazione/ElaborazioneRegistroTabella";
import { etichettaRegistro, type CommercialistaRegistroKind } from "@/lib/amministrazione/commercialista";
import {
  COLORI_TIPO_DOCUMENTO,
  righeResocontoCompleto,
  TITOLI_RESOCONTO_COMPLETO,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  NOME_RESOCONTO_COMPLETO,
  buildResocontoCompletoXlsx,
} from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import {
  gruppiElaborazioneTrimestre,
  nomeCartellaTrimestre,
  nomiFileElaborazione,
  percorsoPdfTrimestre,
  scriviElaborazioneRegistro,
} from "@/lib/amministrazione/elaborazione-trimestre";
import { formatEuro } from "@/lib/amministrazione/fatture";
import {
  chiediCartellaScrittura,
  scriviFileInCartella,
} from "@/lib/amministrazione/fattura-classica-pdf";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

const KINDS: CommercialistaRegistroKind[] = [
  "emessa",
  "ricevuta",
  "ddt_emesso",
  "ddt_ricevuto",
  "nota_emessa",
  "nota_ricevuta",
];

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Carico = {
  docs: CommercialistaPaperDoc[];
  errore: string | null;
};

export function CommercialistaElaboraTrimestreModal({
  anno,
  trimestre,
  onClose,
}: {
  anno: number;
  trimestre: TrimestreNumero;
  onClose: () => void;
}) {
  const titleId = useId();
  const [perKind, setPerKind] = useState<Partial<Record<CommercialistaRegistroKind, Carico>>>({});
  const [pending, setPending] = useState(true);
  const [scrivendo, setScrivendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const gruppi = useMemo(
    () => gruppiElaborazioneTrimestre(anno, trimestre),
    [anno, trimestre]
  );
  const nomeCartella = nomeCartellaTrimestre(anno, trimestre);
  const voci = useMemo(() => {
    const out: {
      kind: CommercialistaRegistroKind;
      doc: CommercialistaPaperDoc;
      percorsoPdf: string;
    }[] = [];
    for (const gruppo of gruppi) {
      for (const registro of gruppo.registri) {
        const docs = perKind[registro.kind]?.docs ?? [];
        const nomi = nomiFileElaborazione(docs);
        docs.forEach((doc, index) => {
          out.push({
            kind: registro.kind,
            doc,
            percorsoPdf: percorsoPdfTrimestre(
              gruppo,
              registro,
              nomi[index] ?? `documento_${index + 1}.pdf`
            ),
          });
        });
      }
    }
    return out;
  }, [gruppi, perKind]);
  const righeComplete = useMemo(() => righeResocontoCompleto(voci), [voci]);

  useEffect(() => {
    let attivo = true;
    setPending(true);
    void (async () => {
      const risultati = await Promise.all(
        KINDS.map(async (kind) => {
          const res = await getCommercialistaPaperBatchAction({ kind, anno, trimestre });
          return { kind, res };
        })
      );
      if (!attivo) return;
      const next: Partial<Record<CommercialistaRegistroKind, Carico>> = {};
      for (const voce of risultati) {
        next[voce.kind] = voce.res.success
          ? { docs: voce.res.docs, errore: null }
          : { docs: [], errore: voce.res.error };
      }
      setPerKind(next);
      setPending(false);
    })();
    return () => {
      attivo = false;
    };
  }, [anno, trimestre]);

  async function esporta() {
    if (pending || scrivendo) return;
    setMsg(null);
    let scelta: Awaited<ReturnType<typeof chiediCartellaScrittura>>;
    try {
      scelta = await chiediCartellaScrittura();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Non sono riuscito a chiedere la cartella.");
      return;
    }
    if (!scelta) return;
    setScrivendo(true);
    try {
      const radice = await scelta.getDirectoryHandle(nomeCartella, { create: true });
      let documenti = 0;
      for (const gruppo of gruppi) {
        const cartellaGruppo = await radice.getDirectoryHandle(gruppo.cartella, {
          create: true,
        });
        for (const registro of gruppo.registri) {
          const docs = perKind[registro.kind]?.docs ?? [];
          const dest = registro.sottocartella
            ? await cartellaGruppo.getDirectoryHandle(registro.sottocartella, {
                create: true,
              })
            : cartellaGruppo;
          await scriviElaborazioneRegistro({
            cartella: dest,
            kind: registro.kind,
            anno,
            trimestre,
            docs,
          });
          documenti += docs.length;
        }
      }
      const excel = await buildResocontoCompletoXlsx(voci);
      await scriviFileInCartella(
        radice,
        excel.filename,
        new Blob([excel.bytes as BlobPart], { type: MIME_XLSX })
      );
      await auditCommercialistaTrimestreAction({
        anno,
        trimestre,
        documenti,
        cartella: nomeCartella,
      });
      setMsg(
        `Cartella «${nomeCartella}» salvata: ${documenti} PDF, le quattro cartelle e ${NOME_RESOCONTO_COMPLETO}.`
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Non sono riuscito a salvare la cartella.");
    } finally {
      setScrivendo(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/70" role="presentation">
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
                Elabora trimestre
              </h2>
              <p className="text-xs text-slate-500">
                {nomeCartella}
                {voci.length > 0 ? ` · ${voci.length} documenti` : null}
              </p>
              <p className="mt-1 max-w-3xl text-xs text-slate-500">
                Esporta chiede dove salvare e crea «{nomeCartella}». Dentro ci sono
                Emesse, Ricevute, DDT e Note Cr, con gli stessi PDF e lo stesso
                resoconto della singola elaborazione, più {NOME_RESOCONTO_COMPLETO}.
                In DDT e Note Cr, emessi e ricevuti restano in due cartelle. Il
                numero documento del resoconto completo apre il PDF.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {KINDS.map((kind) => (
                  <li
                    key={kind}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-slate-300"
                      style={{ backgroundColor: COLORI_TIPO_DOCUMENTO[kind].fondo }}
                    />
                    {COLORI_TIPO_DOCUMENTO[kind].etichetta}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending || scrivendo}
                onClick={() => void esporta()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaDownload size={12} />
                {scrivendo ? "Preparazione…" : "Esporta"}
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
          {msg ? (
            <p className="mx-auto mt-2 max-w-6xl text-xs text-slate-700">{msg}</p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
          {pending ? (
            <p className="text-center text-sm text-slate-600">Preparazione elenco…</p>
          ) : (
            <div className="mx-auto flex max-w-6xl flex-col gap-8">
              {gruppi.map((gruppo) => (
                <section key={gruppo.cartella} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">{gruppo.cartella}</h3>
                  {gruppo.registri.map((registro) => {
                    const carico = perKind[registro.kind];
                    return (
                      <div key={registro.kind} className="space-y-2">
                        {registro.sottocartella ? (
                          <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {etichettaRegistro(registro.kind)}
                          </h4>
                        ) : null}
                        {carico?.errore ? (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {carico.errore}
                          </p>
                        ) : (
                          <ElaborazioneRegistroTabella
                            docs={carico?.docs ?? []}
                            kind={registro.kind}
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">{NOME_RESOCONTO_COMPLETO}</h3>
                {righeComplete.length === 0 ? (
                  <p className="text-sm text-slate-600">Nessun documento nel periodo.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-800 text-xs text-white">
                        <tr>
                          {TITOLI_RESOCONTO_COMPLETO.map((titolo) => (
                            <th key={titolo} className="px-3 py-2 font-semibold whitespace-nowrap">
                              {titolo}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {righeComplete.map((riga, index) =>
                          riga.tipo === "documento" ? (
                            <tr
                              key={`${riga.percorsoPdf}-${index}`}
                              className="border-t border-slate-200"
                              style={{ backgroundColor: COLORI_TIPO_DOCUMENTO[riga.kind].fondo }}
                            >
                              <td className="px-3 py-1.5 whitespace-nowrap">{riga.data}</td>
                              <td className="px-3 py-1.5 whitespace-nowrap">{riga.tipoDocumento}</td>
                              <td className="px-3 py-1.5 whitespace-nowrap text-blue-700 underline">
                                {riga.numeroDocumento || "—"}
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
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
