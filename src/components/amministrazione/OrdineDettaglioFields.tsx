"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { FaPlus, FaTrash, FaFilePdf, FaUpload } from "react-icons/fa6";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  emptyTrasporto,
  imponibileRiga,
  IVA_PERCENTUALI_COMUNI,
  newRigaProdotto,
  totaleOrdine,
  totaleRiga,
  totaleTrasporto,
  type OrdineDocumentoCliente,
  type OrdineRigaProdotto,
  type OrdineTrasporto,
} from "@/lib/amministrazione/ordini";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function parseNum(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  numeroInterno: string;
  onNumeroInternoChange: (value: string) => void;
  numeroCliente: string;
  onNumeroClienteChange: (value: string) => void;
  documentoFile: File | null;
  documentoEsistente: OrdineDocumentoCliente | null;
  onDocumentoFileChange: (file: File | null) => void;
  onDocumentoEsistenteClear: () => void;
  righe: OrdineRigaProdotto[];
  onRigheChange: (righe: OrdineRigaProdotto[]) => void;
  trasporto: OrdineTrasporto;
  onTrasportoChange: (trasporto: OrdineTrasporto) => void;
};

export function OrdineDettaglioFields({
  numeroInterno,
  onNumeroInternoChange,
  numeroCliente,
  onNumeroClienteChange,
  documentoFile,
  documentoEsistente,
  onDocumentoFileChange,
  onDocumentoEsistenteClear,
  righe,
  onRigheChange,
  trasporto,
  onTrasportoChange,
}: Props) {
  const docInputId = useId();
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [prodottiReady, setProdottiReady] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listProdottiPropriAction();
      if (cancelled) return;
      if (result.success) setProdotti(result.prodotti);
      setProdottiReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedProdotti = useMemo(
    () =>
      [...prodotti].sort((a, b) =>
        a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
      ),
    [prodotti]
  );

  const totale = totaleOrdine(righe, trasporto);
  const hasDocumento = Boolean(documentoFile || documentoEsistente);

  function patchRiga(id: string, patch: Partial<OrdineRigaProdotto>) {
    onRigheChange(righe.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function onPickDocumento(files: FileList | null) {
    const next = files?.[0] ?? null;
    if (!next) return;
    const okTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!okTypes.includes(next.type) && !next.name.toLowerCase().endsWith(".pdf")) {
      setDocError("Allegare un PDF o un’immagine dell’ordine cliente.");
      return;
    }
    setDocError(null);
    onDocumentoEsistenteClear();
    onDocumentoFileChange(next);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">N. ordine interno</span>
          <input
            value={numeroInterno}
            onChange={(e) => onNumeroInternoChange(e.target.value)}
            required
            placeholder="Es. STO-2026-001"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            N. ordine cliente{" "}
            <span className="font-normal text-[var(--muted)]">(opzionale)</span>
          </span>
          <input
            value={numeroCliente}
            onChange={(e) => onNumeroClienteChange(e.target.value)}
            placeholder="Riferimento ordine del cliente"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <div className="block text-sm">
        <span className="mb-1 block font-medium">
          Documento ordine cliente{" "}
          <span className="font-normal text-[var(--muted)]">(opzionale)</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={docInputId}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FaUpload size={12} />
            {hasDocumento ? "Sostituisci file" : "Allega documento"}
          </label>
          <input
            id={docInputId}
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              onPickDocumento(e.target.files);
              e.target.value = "";
            }}
          />
          {documentoFile ? (
            <span className="inline-flex items-center gap-2 text-xs text-slate-700">
              <FaFilePdf className="text-red-600" />
              {documentoFile.name}
              <button
                type="button"
                onClick={() => onDocumentoFileChange(null)}
                className="text-[var(--primary)] hover:underline"
              >
                Rimuovi
              </button>
            </span>
          ) : documentoEsistente ? (
            <span className="inline-flex items-center gap-2 text-xs text-slate-700">
              <FaFilePdf className="text-red-600" />
              {documentoEsistente.name}
              <button
                type="button"
                onClick={onDocumentoEsistenteClear}
                className="text-[var(--primary)] hover:underline"
              >
                Rimuovi
              </button>
            </span>
          ) : (
            <span className="text-xs text-[var(--muted)]">Nessun allegato</span>
          )}
        </div>
        {docError ? <p className="mt-1 text-xs text-red-600">{docError}</p> : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Prodotti</p>
          <button
            type="button"
            onClick={() => onRigheChange([...righe, newRigaProdotto()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            <FaPlus size={11} />
            Aggiungi riga
          </button>
        </div>

        {righe.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted)]">
            Nessuna riga. Aggiungi almeno un prodotto proprio.
          </p>
        ) : (
          <div className="space-y-3">
            {righe.map((riga, index) => (
              <div
                key={riga.id}
                className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Riga {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onRigheChange(righe.filter((r) => r.id !== riga.id))
                    }
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                    aria-label={`Rimuovi riga ${index + 1}`}
                  >
                    <FaTrash size={11} />
                    Rimuovi
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <label className="block text-sm sm:col-span-2 lg:col-span-2">
                    <span className="mb-1 block text-xs font-medium">
                      Tipo di prodotto
                    </span>
                    <select
                      value={riga.prodottoId}
                      required
                      disabled={!prodottiReady}
                      onChange={(e) => {
                        const p = sortedProdotti.find(
                          (x) => x.id === e.target.value
                        );
                        patchRiga(riga.id, {
                          prodottoId: p?.id ?? "",
                          prodottoCodice: p?.codice ?? "",
                          prodottoNome: p?.nome ?? "",
                        });
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    >
                      <option value="">
                        {prodottiReady
                          ? "Seleziona prodotto…"
                          : "Caricamento…"}
                      </option>
                      {sortedProdotti.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codice} — {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium">
                      Quantità
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={riga.quantita || ""}
                      onChange={(e) =>
                        patchRiga(riga.id, {
                          quantita: parseNum(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium">
                      Prezzo (€)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={riga.prezzoUnitario || ""}
                      onChange={(e) =>
                        patchRiga(riga.id, {
                          prezzoUnitario: parseNum(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium">
                      IVA %
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      list={`iva-options-${riga.id}`}
                      required
                      value={riga.ivaPercentuale}
                      onChange={(e) =>
                        patchRiga(riga.id, {
                          ivaPercentuale: parseNum(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                    <datalist id={`iva-options-${riga.id}`}>
                      {IVA_PERCENTUALI_COMUNI.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </label>

                  <div className="block text-sm">
                    <span className="mb-1 block text-xs font-medium">
                      Totale riga
                    </span>
                    <p className="rounded-lg border border-transparent bg-white px-2.5 py-2 text-sm font-semibold tabular-nums">
                      {formatEuro(totaleRiga(riga))}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      Imponibile {formatEuro(imponibileRiga(riga))}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] p-3">
        <p className="text-sm font-semibold">Trasporto</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-xs font-medium">Azienda</span>
            <input
              value={trasporto.azienda}
              onChange={(e) =>
                onTrasportoChange({ ...trasporto, azienda: e.target.value })
              }
              placeholder="Trasportatore"
              className="w-full rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">
              Imponibile (€)
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={trasporto.imponibile || ""}
              onChange={(e) =>
                onTrasportoChange({
                  ...trasporto,
                  imponibile: parseNum(e.target.value),
                })
              }
              className="w-full rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium">IVA %</span>
            <input
              type="number"
              min={0}
              step="0.01"
              list="iva-trasporto-options"
              value={trasporto.ivaPercentuale}
              onChange={(e) =>
                onTrasportoChange({
                  ...trasporto,
                  ivaPercentuale: parseNum(e.target.value),
                })
              }
              className="w-full rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            <datalist id="iva-trasporto-options">
              {IVA_PERCENTUALI_COMUNI.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        </div>
        <p className="mt-2 text-right text-xs text-[var(--muted)]">
          Totale trasporto:{" "}
          <span className="font-semibold text-slate-800">
            {formatEuro(totaleTrasporto(trasporto))}
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--primary)]/30 bg-[color-mix(in_srgb,var(--primary)_8%,white)] px-4 py-3">
        <span className="text-sm font-medium text-slate-700">
          Totale ordine
        </span>
        <span className="text-lg font-semibold tabular-nums text-[var(--primary)]">
          {formatEuro(totale)}
        </span>
      </div>
    </div>
  );
}

export function useOrdineDettaglioState(suggestedNumeroInterno: string) {
  const [numeroInterno, setNumeroInterno] = useState(suggestedNumeroInterno);
  const [numeroCliente, setNumeroCliente] = useState("");
  const [documentoFile, setDocumentoFile] = useState<File | null>(null);
  const [documentoEsistente, setDocumentoEsistente] =
    useState<OrdineDocumentoCliente | null>(null);
  const [righe, setRighe] = useState<OrdineRigaProdotto[]>(() => [
    newRigaProdotto(),
  ]);
  const [trasporto, setTrasporto] = useState<OrdineTrasporto>(emptyTrasporto);

  return {
    numeroInterno,
    setNumeroInterno,
    numeroCliente,
    setNumeroCliente,
    documentoFile,
    setDocumentoFile,
    documentoEsistente,
    setDocumentoEsistente,
    righe,
    setRighe,
    trasporto,
    setTrasporto,
  };
}
