"use client";

import { useMemo, useState, useTransition } from "react";
import { FaPrint, FaLink } from "react-icons/fa6";
import {
  associateBarcodeAction,
  listArticoliPerAssociaBarcodeAction,
} from "@/app/actions/magazzino-barcode";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import { buildBarcodeFromModel } from "@/lib/magazzino/barcode";
import type { MagazzinoCatalogKind } from "@/lib/magazzino/types";

type PrintSize = "50x30" | "100x50";

/**
 * Generatore generico: stringa libera + impostazioni grafiche (Code 128 / QR,
 * formato stampa) e funzionali (modello a pezzi + associazione scheda).
 */
export function BarcodeGeneratoreBoard() {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"code128" | "qrcode">("code128");
  const [printSize, setPrintSize] = useState<PrintSize>("50x30");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fase, setFase] = useState("");
  const [parametro, setParametro] = useState("");
  const [progressivo, setProgressivo] = useState("");
  const [kind, setKind] = useState<MagazzinoCatalogKind>("prodotto_fornitore");
  const [q, setQ] = useState("");
  const [articoli, setArticoli] = useState<
    Array<{
      id: string;
      codice: string;
      nome: string;
      barcode: string | null;
      schedaProvvisoria: boolean;
    }>
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => text.trim(), [text]);

  function generaDaModello() {
    const s = buildBarcodeFromModel({
      data,
      categoria,
      fase,
      parametro,
      progressivo,
    });
    setText(s);
  }

  function loadArticoli() {
    startTransition(async () => {
      const res = await listArticoliPerAssociaBarcodeAction(kind, q);
      if (!res.success) {
        setErr(res.error);
        return;
      }
      setArticoli(res.items);
      setErr(null);
    });
  }

  function associa() {
    if (!preview || !selectedId) {
      setErr("Inserisci barcode e seleziona un articolo.");
      return;
    }
    startTransition(async () => {
      const res = await associateBarcodeAction({
        barcode: preview,
        catalogKind: kind,
        prodottoId: selectedId,
      });
      if (!res.success) {
        setErr(res.error);
        return;
      }
      setMsg(`Associato a ${res.item.codice} — ${res.item.nome}`);
      setErr(null);
      loadArticoli();
    });
  }

  function stampa() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)] print:hidden">
        Inserisci una stringa (o compila il modello), scegli Code 128 / QR e il
        formato etichetta, poi stampa o associa a una scheda magazzino.
      </p>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Impostazioni</h3>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Stringa da convertire</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="es. LOT-01.07.2026/HDG/F2/D.10.D-58"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              Data
              <input
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              Categoria/Prodotto
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              Fase
              <input
                value={fase}
                onChange={(e) => setFase(e.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              Parametro
              <input
                value={parametro}
                onChange={(e) => setParametro(e.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              Progressivo
              <input
                value={progressivo}
                onChange={(e) => setProgressivo(e.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={generaDaModello}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Genera da modello
          </button>
          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={format === "code128"}
                onChange={() => setFormat("code128")}
              />
              Code 128
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={format === "qrcode"}
                onChange={() => setFormat("qrcode")}
              />
              QR Code
            </label>
            <label className="inline-flex items-center gap-2">
              Formato stampa
              <select
                value={printSize}
                onChange={(e) => setPrintSize(e.target.value as PrintSize)}
                className="rounded border border-[var(--border)] px-2 py-1"
              >
                <option value="50x30">50×30 mm</option>
                <option value="100x50">100×50 mm</option>
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Anteprima</h3>
          <BarcodePreview value={preview} format={format} />
          <button
            type="button"
            disabled={!preview}
            onClick={stampa}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <FaPrint size={14} />
            Stampa etichetta
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 print:hidden">
        <h3 className="text-sm font-semibold">Associa a scheda articolo</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as MagazzinoCatalogKind)
            }
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="prodotto_fornitore">Prodotti (Pr)</option>
            <option value="materia_prima">Materia prima (Mp)</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca articolo…"
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={loadArticoli}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Cerca
          </button>
        </div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">— seleziona articolo —</option>
          {articoli.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codice} — {a.nome}
              {a.barcode ? ` · ${a.barcode}` : ""}
              {a.schedaProvvisoria ? " · provvisoria" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !preview || !selectedId}
          onClick={associa}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <FaLink size={12} />
          Associa barcode alla scheda
        </button>
      </div>

      <div
        className={`hidden print:flex print:items-center print:justify-center ${
          printSize === "50x30" ? "print-label-50" : "print-label-100"
        }`}
      >
        <div className="text-center">
          <BarcodePreview value={preview} format={format} />
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print\\:flex,
          .print\\:flex * {
            visibility: visible !important;
          }
          .print-label-50 {
            width: 50mm;
            height: 30mm;
          }
          .print-label-100 {
            width: 100mm;
            height: 50mm;
          }
          @page {
            margin: 0;
            size: auto;
          }
        }
      `}</style>
    </div>
  );
}
