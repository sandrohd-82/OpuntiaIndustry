"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  type OrdineAllegato,
  type OrdineRigaProdotto,
  type OrdineTrasporto,
} from "@/lib/amministrazione/ordini";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function AllegatoUpload({
  label,
  inputId,
  file,
  esistente,
  onFileChange,
  onEsistenteClear,
  error,
}: {
  label: string;
  inputId: string;
  file: File | null;
  esistente: OrdineAllegato | null;
  onFileChange: (file: File | null) => void;
  onEsistenteClear: () => void;
  error?: string | null;
}) {
  const has = Boolean(file || esistente);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
          title={label}
        >
          <FaUpload size={11} />
          {has ? "Sostituisci" : "Carica"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!next) return;
            onEsistenteClear();
            onFileChange(next);
          }}
        />
        {file ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-slate-700">
            <FaFilePdf className="shrink-0 text-red-600" />
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="shrink-0 text-[var(--primary)] hover:underline"
            >
              Rimuovi
            </button>
          </span>
        ) : esistente ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-slate-700">
            <FaFilePdf className="shrink-0 text-red-600" />
            <span className="truncate">{esistente.name}</span>
            <button
              type="button"
              onClick={onEsistenteClear}
              className="shrink-0 text-[var(--primary)] hover:underline"
            >
              Rimuovi
            </button>
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">{label}</span>
        )}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function NumeroInternoInfo() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Legenda numero ordine interno"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold italic leading-none text-slate-700 hover:bg-slate-300"
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-slate-700 shadow-lg"
        >
          <span
            className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[var(--border)] bg-white"
            aria-hidden
          />
          <span className="relative block font-semibold text-slate-900">
            Formato: Or-AA-TARGA/N
          </span>
          <ul className="relative mt-1.5 list-disc space-y-1 pl-4">
            <li>
              <strong>Or</strong> = Ordine
            </li>
            <li>
              <strong>AA</strong> = anno a 2 cifre dalla data ordine (es. 26)
            </li>
            <li>
              <strong>TARGA</strong> = identificativo cliente (es. C003)
            </li>
            <li>
              <strong>N</strong> = progressivo ordini di quel cliente (non legato
              ad altre aziende; se ne ha fatti 390, il prossimo è 391)
            </li>
          </ul>
          <p className="relative mt-2 font-medium text-[var(--primary)]">
            Esempio: Or-26-C003/391
          </p>
        </span>
      ) : null}
    </span>
  );
}

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
  numeroCliente: string;
  onNumeroClienteChange: (value: string) => void;
  offertaFile: File | null;
  offertaEsistente: OrdineAllegato | null;
  onOffertaFileChange: (file: File | null) => void;
  onOffertaEsistenteClear: () => void;
  ordineClienteFile: File | null;
  ordineClienteEsistente: OrdineAllegato | null;
  onOrdineClienteFileChange: (file: File | null) => void;
  onOrdineClienteEsistenteClear: () => void;
  righe: OrdineRigaProdotto[];
  onRigheChange: (righe: OrdineRigaProdotto[]) => void;
  trasporto: OrdineTrasporto;
  onTrasportoChange: (trasporto: OrdineTrasporto) => void;
};

export function OrdineDettaglioFields({
  numeroInterno,
  numeroCliente,
  onNumeroClienteChange,
  offertaFile,
  offertaEsistente,
  onOffertaFileChange,
  onOffertaEsistenteClear,
  ordineClienteFile,
  ordineClienteEsistente,
  onOrdineClienteFileChange,
  onOrdineClienteEsistenteClear,
  righe,
  onRigheChange,
  trasporto,
  onTrasportoChange,
}: Props) {
  const offertaInputId = useId();
  const ordineClienteInputId = useId();
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [prodottiReady, setProdottiReady] = useState(false);

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

  function patchRiga(id: string, patch: Partial<OrdineRigaProdotto>) {
    onRigheChange(righe.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block text-sm">
          <span className="mb-1 flex items-center font-medium">
            N. ordine interno
            <NumeroInternoInfo />
          </span>
          <input
            value={numeroInterno}
            readOnly
            required
            placeholder="Seleziona cliente e data ordine"
            className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-mono text-sm outline-none"
          />
          <AllegatoUpload
            label="Offerta interna inviata al cliente"
            inputId={offertaInputId}
            file={offertaFile}
            esistente={offertaEsistente}
            onFileChange={onOffertaFileChange}
            onEsistenteClear={onOffertaEsistenteClear}
          />
        </div>

        <div className="block text-sm">
          <span className="mb-1 block font-medium">
            N. ordine del cliente{" "}
            <span className="font-normal text-[var(--muted)]">(opzionale)</span>
          </span>
          <input
            value={numeroCliente}
            onChange={(e) => onNumeroClienteChange(e.target.value)}
            placeholder="Riferimento ordine del cliente"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          <AllegatoUpload
            label="Ordine inviato dal cliente"
            inputId={ordineClienteInputId}
            file={ordineClienteFile}
            esistente={ordineClienteEsistente}
            onFileChange={onOrdineClienteFileChange}
            onEsistenteClear={onOrdineClienteEsistenteClear}
          />
        </div>
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

export function useOrdineDettaglioState() {
  const [numeroInterno, setNumeroInterno] = useState("");
  const [numeroCliente, setNumeroCliente] = useState("");
  const [offertaFile, setOffertaFile] = useState<File | null>(null);
  const [offertaEsistente, setOffertaEsistente] =
    useState<OrdineAllegato | null>(null);
  const [ordineClienteFile, setOrdineClienteFile] = useState<File | null>(null);
  const [ordineClienteEsistente, setOrdineClienteEsistente] =
    useState<OrdineAllegato | null>(null);
  const [righe, setRighe] = useState<OrdineRigaProdotto[]>(() => [
    newRigaProdotto(),
  ]);
  const [trasporto, setTrasporto] = useState<OrdineTrasporto>(emptyTrasporto);

  return {
    numeroInterno,
    setNumeroInterno,
    numeroCliente,
    setNumeroCliente,
    offertaFile,
    setOffertaFile,
    offertaEsistente,
    setOffertaEsistente,
    ordineClienteFile,
    setOrdineClienteFile,
    ordineClienteEsistente,
    setOrdineClienteEsistente,
    righe,
    setRighe,
    trasporto,
    setTrasporto,
  };
}
