"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FaDownload, FaXmark } from "react-icons/fa6";
import {
  auditCommercialistaPaperAction,
  getCommercialistaPaperBatchAction,
  type CommercialistaPaperDoc,
} from "@/app/actions/commercialista";
import { ElaborazioneRegistroTabella } from "@/components/amministrazione/ElaborazioneRegistroTabella";
import {
  righeElaborazioneFatture,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import { scriviElaborazioneRegistro } from "@/lib/amministrazione/elaborazione-trimestre";
import { chiediCartellaScrittura } from "@/lib/amministrazione/fattura-classica-pdf";
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
      await scriviElaborazioneRegistro({
        cartella,
        kind,
        anno,
        trimestre,
        docs,
      });
      await auditCommercialistaPaperAction({
        kind,
        anno,
        trimestre,
        mode: "salva_cartella",
        documenti: docs.length,
        mostraSequenza: true,
      });
      setScaricaMsg(
        beneConsumo
          ? `Cartella «${nomeCartella}» salvata: ${docs.length} PDF e il resoconto. Il numero documento apre il PDF.`
          : `Cartella «${nomeCartella}» salvata: ${docs.length} PDF e il resoconto. Il nome del file usa la numerazione del periodo; nel foglio il progressivo parte dal 1° gennaio.`
      );
    } catch (err) {
      setScaricaMsg(
        err instanceof Error ? err.message : "Non sono riuscito a salvare la cartella."
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
              <p className="mt-1 max-w-xl text-xs text-slate-500">
                {beneConsumo
                  ? "Il numero 1 è il primo documento del 1° gennaio. Salva cartella chiede dove scrivere: dentro trovi i PDF e il resoconto, e il numero documento apre il PDF."
                  : "Il nome del file usa la numerazione già in uso, non quella dal 1° gennaio. Nel resoconto il progressivo parte dal 1° gennaio e il numero documento apre il PDF."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={righe.length === 0 || scaricando || pending}
                onClick={() => void salvaCartella()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaDownload size={12} />
                {scaricando ? "Preparazione…" : "Salva cartella"}
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
            <div className="mx-auto max-w-6xl">
              <ElaborazioneRegistroTabella docs={docs} kind={kind} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
