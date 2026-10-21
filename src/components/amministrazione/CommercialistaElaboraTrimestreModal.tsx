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
import type { CommercialistaRegistroKind } from "@/lib/amministrazione/commercialista";
import {
  COLORI_TIPO_DOCUMENTO,
  righeResocontoCompleto,
  TITOLI_RESOCONTO_COMPLETO,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  NOME_RESOCONTO_COMPLETO,
  buildPacchettoTrimestreXlsx,
} from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import {
  gruppiElaborazioneTrimestre,
  cartellaPdfTrimestre,
  nomeCartellaConConteggio,
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
import { CommercialistaLinkOspite } from "@/components/amministrazione/CommercialistaLinkOspite";

const KINDS: CommercialistaRegistroKind[] = [
  "emessa",
  "ricevuta",
  "ddt_emesso",
  "ddt_ricevuto",
  "nota_emessa",
  "nota_ricevuta",
  "scontrino",
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
  pagina = false,
}: {
  anno: number;
  trimestre: TrimestreNumero;
  onClose?: () => void;
  /** Pagina aperta dal link: niente chiusura verso il riepilogo. */
  pagina?: boolean;
}) {
  const titleId = useId();
  const [perKind, setPerKind] = useState<Partial<Record<CommercialistaRegistroKind, Carico>>>({});
  const [pending, setPending] = useState(true);
  const [scrivendo, setScrivendo] = useState(false);
  const [consigliAperti, setConsigliAperti] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const consigliId = useId();
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
              nomi[index] ?? `documento_${index + 1}.pdf`,
              docs.length
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
      const sezioni = gruppi.flatMap((gruppo) =>
        gruppo.registri.map((registro) => {
          const docs = perKind[registro.kind]?.docs ?? [];
          return {
            kind: registro.kind,
            docs,
            cartellaRelativa: cartellaPdfTrimestre(gruppo, registro, docs.length),
          };
        })
      );
      const documentiPrevisti = sezioni.reduce((n, sezione) => n + sezione.docs.length, 0);
      if (documentiPrevisti > 0) {
        const excel = await buildPacchettoTrimestreXlsx({
          anno,
          trimestre,
          sezioni,
          voci,
        });
        await scriviFileInCartella(
          radice,
          excel.filename,
          new Blob([excel.bytes as BlobPart], { type: MIME_XLSX })
        );
      }
      let documenti = 0;
      for (const gruppo of gruppi) {
        const haSottocartelle = gruppo.registri.some((registro) => registro.sottocartella);
        const cartellaGruppo = haSottocartelle
          ? await radice.getDirectoryHandle(gruppo.cartella, { create: true })
          : null;
        for (const registro of gruppo.registri) {
          const docs = perKind[registro.kind]?.docs ?? [];
          const nomeFoglia = nomeCartellaConConteggio(
            registro.sottocartella ?? gruppo.cartella,
            docs.length
          );
          const dest = cartellaGruppo
            ? await cartellaGruppo.getDirectoryHandle(nomeFoglia, { create: true })
            : await radice.getDirectoryHandle(nomeFoglia, { create: true });
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
      await auditCommercialistaTrimestreAction({
        anno,
        trimestre,
        documenti,
        cartella: nomeCartella,
      });
      setMsg(
        documenti > 0
          ? `Cartella «${nomeCartella}» salvata: ${documenti} PDF. Ogni cartella di file ha il suo Excel. ${NOME_RESOCONTO_COMPLETO} è nella cartella madre. Il nome del file, o il numero dove la pagina non mostra il file, apre la fattura.`
          : `Cartella «${nomeCartella}» salvata. Nessun documento: le cartelle di file sono a (0 file) e non ho scritto gli Excel.`
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Non sono riuscito a salvare la cartella.");
    } finally {
      setScrivendo(false);
    }
  }

  const corpo = (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/70" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full min-h-0 flex-col bg-slate-100 px-[3vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-300 bg-white px-5 py-4 shadow-sm">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Elabora trimestre
              </h2>
              <p className="text-xs text-slate-500">
                {nomeCartella}
                {voci.length > 0 ? ` · ${voci.length} documenti` : null}
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
              {pagina ? null : (
                <CommercialistaLinkOspite
                  ambito="trimestre"
                  registro={null}
                  anno={anno}
                  trimestre={trimestre}
                />
              )}
              <button
                type="button"
                disabled={pending || scrivendo}
                onClick={() => setConsigliAperti(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaDownload size={12} />
                {scrivendo ? "Preparazione…" : "Esporta"}
              </button>
              {pagina ? null : (
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50"
                  aria-label="Chiudi"
                >
                  <FaXmark size={14} />
                </button>
              )}
            </div>
          </div>
          {msg ? (
            <p className="mt-2 w-full text-xs text-slate-700">{msg}</p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto py-6">
          {pending ? (
            <p className="text-center text-sm text-slate-600">Preparazione elenco…</p>
          ) : (
            <div className="flex w-full flex-col gap-8">
              {gruppi.map((gruppo) => {
                const haSottocartelle = gruppo.registri.some(
                  (registro) => registro.sottocartella
                );
                const prima = gruppo.registri[0];
                const titoloGruppo =
                  haSottocartelle || !prima
                    ? gruppo.cartella
                    : nomeCartellaConConteggio(
                        gruppo.cartella,
                        perKind[prima.kind]?.docs.length ?? 0
                      );
                return (
                <section key={gruppo.cartella} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">{titoloGruppo}</h3>
                  {gruppo.registri.map((registro) => {
                    const carico = perKind[registro.kind];
                    return (
                      <div key={registro.kind} className="space-y-2">
                        {registro.sottocartella ? (
                          <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {nomeCartellaConConteggio(
                              registro.sottocartella,
                              carico?.docs.length ?? 0
                            )}
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
                );
              })}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">{NOME_RESOCONTO_COMPLETO}</h3>
                {righeComplete.length === 0 ? (
                  <p className="text-sm text-slate-600">Nessun documento nel periodo.</p>
                ) : (
                  <div className="w-full overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
                    <table className="w-full border-collapse text-left text-xs [&_td]:border-l [&_td]:border-slate-300 [&_td:first-child]:border-l-0 [&_th]:border-l [&_th]:border-slate-500 [&_th]:text-center [&_th:first-child]:border-l-0">
                      <thead className="bg-slate-800 text-xs text-white">
                        <tr>
                          {TITOLI_RESOCONTO_COMPLETO.map((titolo) => (
                            <th key={titolo} className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">
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
                              <td className="px-1.5 py-1 whitespace-nowrap">{riga.data}</td>
                              <td className="px-1.5 py-1 whitespace-nowrap">{riga.tipoDocumento}</td>
                              <td className="px-1.5 py-1 whitespace-nowrap text-blue-700 underline">
                                {riga.numeroDocumento || "—"}
                              </td>
                              <td className="px-1.5 py-1">{riga.intestazione}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
                                {riga.nonContabilizzato ? (
                                  <span className="inline-flex flex-col items-end leading-tight">
                                    <span className="text-[10px] text-slate-500">NC non contabilizzato</span>
                                    <span className="text-slate-400 line-through">{formatEuro(riga.imponibile)}</span>
                                  </span>
                                ) : (
                                  formatEuro(riga.imponibile)
                                )}
                              </td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
                                {riga.nonContabilizzato ? (
                                  <span className="inline-flex flex-col items-end leading-tight">
                                    <span className="text-[10px] text-slate-500">NC non contabilizzato</span>
                                    <span className="text-slate-400 line-through">{formatEuro(riga.iva)}</span>
                                  </span>
                                ) : (
                                  formatEuro(riga.iva)
                                )}
                              </td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
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
                              <td className="px-1.5 py-1" />
                              <td className="px-1.5 py-1" />
                              <td className="px-1.5 py-1" />
                              <td className="px-1.5 py-1">{riga.etichetta}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
                                {formatEuro(riga.imponibile)}
                              </td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
                                {formatEuro(riga.iva)}
                              </td>
                              <td className="px-1.5 py-1 text-right tabular-nums">
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
      {consigliAperti ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={consigliId}
            className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={consigliId} className="text-sm font-semibold text-slate-900">
              Prima di scegliere la cartella
            </h3>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-slate-700">
              <li>
                Qualsiasi cartella si decide di usare, è utile crearne una nuova
                prima del download e scaricare al suo interno.
              </li>
              <li>
                Verrà chiesta l&apos;autorizzazione a modificare quella cartella.
                Serve solo a generare le cartelle nuove, così il download resta
                nell&apos;ordine giusto.
              </li>
            </ol>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConsigliAperti(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Chiudi
              </button>
              <button
                type="button"
                disabled={scrivendo}
                onClick={() => {
                  setConsigliAperti(false);
                  void esporta();
                }}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Scegli la cartella
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (pagina) return corpo;
  if (typeof document === "undefined") return null;
  return createPortal(corpo, document.body);
}
