"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  associateBarcodeAction,
  createArticoloFromBarcodeAction,
  listArticoliPerAssociaBarcodeAction,
  lookupBarcodeAction,
  movimentoScanAction,
} from "@/app/actions/magazzino-barcode";
import type { BarcodeLookupHit } from "@/lib/magazzino/barcode";
import {
  CATEGORIA_UTILIZZO_OPTIONS,
  type MagazzinoCatalogKind,
} from "@/lib/magazzino/types";

type Mode = "carico" | "scarico";
type UnknownStep = "choice" | "associa" | "crea" | null;

function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, ok ? 120 : 280);
  } catch {
    /* ignore */
  }
}

export function MagazzinoScanBoard({ mode }: { mode: Mode }) {
  const scannerId = useId().replace(/:/g, "");
  const [manual, setManual] = useState("");
  const [qty, setQty] = useState(1);
  const [last, setLast] = useState<BarcodeLookupHit | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [unknownStep, setUnknownStep] = useState<UnknownStep>(null);
  const [kind, setKind] = useState<MagazzinoCatalogKind>("prodotto_fornitore");
  const [selectedId, setSelectedId] = useState("");
  const [articoli, setArticoli] = useState<
    Array<{ id: string; codice: string; nome: string }>
  >([]);
  const [newNome, setNewNome] = useState("");
  const [provvisoria, setProvvisoria] = useState(true);
  const [categoria, setCategoria] = useState<"mat_consumo" | "mat_poco_consumo">(
    "mat_consumo"
  );
  const [camOn, setCamOn] = useState(false);
  const [pending, startTransition] = useTransition();
  const scanningLock = useRef(false);

  useEffect(() => {
    if (!camOn) return;
    let scanner: { stop: () => Promise<void> } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const elId = `qr-reader-${scannerId}`;
        const inst = new Html5Qrcode(elId);
        scanner = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 140 } },
          (decoded) => {
            if (scanningLock.current || cancelled) return;
            scanningLock.current = true;
            handleCode(decoded).finally(() => {
              setTimeout(() => {
                scanningLock.current = false;
              }, 900);
            });
          },
          () => undefined
        );
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Fotocamera non disponibile (serve HTTPS / permesso)."
          );
          setCamOn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void scanner?.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, scannerId, mode]);

  async function handleCode(code: string) {
    const barcode = code.trim();
    if (!barcode) return;
    setError(null);
    setInfo(null);

    const looked = await lookupBarcodeAction(barcode);
    if (!looked.success) {
      setError(looked.error);
      beep(false);
      return;
    }
    if (!looked.found) {
      setUnknownBarcode(looked.barcode);
      setUnknownStep("choice");
      beep(false);
      return;
    }

    const mov = await movimentoScanAction({
      barcode,
      mode,
      quantita: qty,
      unita: looked.item.unita,
    });
    if (!mov.success) {
      setError(mov.error);
      beep(false);
      return;
    }
    setLast(mov.item);
    setInfo(
      `${mode === "carico" ? "Carico" : "Scarico"} ok · ${mov.item.codice} · giacenza ${mov.item.giacenza} ${mov.item.unita}`
    );
    beep(true);
  }

  function submitManual() {
    startTransition(async () => {
      await handleCode(manual);
    });
  }

  function loadArticoli() {
    startTransition(async () => {
      const res = await listArticoliPerAssociaBarcodeAction(kind);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setArticoli(res.items.map((a) => ({ id: a.id, codice: a.codice, nome: a.nome })));
    });
  }

  function doAssocia() {
    if (!unknownBarcode || !selectedId) return;
    startTransition(async () => {
      const res = await associateBarcodeAction({
        barcode: unknownBarcode,
        catalogKind: kind,
        prodottoId: selectedId,
      });
      if (!res.success) {
        setError(res.error);
        beep(false);
        return;
      }
      setUnknownStep(null);
      setUnknownBarcode(null);
      await handleCode(res.item.barcode);
    });
  }

  function doCrea() {
    if (!unknownBarcode || !newNome.trim()) return;
    startTransition(async () => {
      const res = await createArticoloFromBarcodeAction({
        barcode: unknownBarcode,
        catalogKind: kind,
        nome: newNome.trim(),
        schedaProvvisoria: provvisoria,
        categoriaUtilizzo: categoria,
        unita: "pz",
      });
      if (!res.success) {
        setError(res.error);
        beep(false);
        return;
      }
      setUnknownStep(null);
      setUnknownBarcode(null);
      setInfo(
        `Creato ${res.item.codice}${
          res.item.schedaProvvisoria ? " (scheda provvisoria)" : ""
        }`
      );
      await handleCode(res.item.barcode);
    });
  }

  const title = mode === "carico" ? "Carico magazzino" : "Scarico magazzino";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <p className="text-sm text-[var(--muted)]">
        {title}: scansiona o digita il barcode. Quantità applicata a ogni
        lettura.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Quantità</span>
        <input
          type="number"
          min={0.001}
          step="any"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-lg tabular-nums"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCamOn((v) => !v)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${
            camOn ? "bg-red-600" : "bg-sky-600"
          }`}
        >
          {camOn ? "Ferma fotocamera" : "Attiva fotocamera"}
        </button>
      </div>

      {camOn ? (
        <div
          id={`qr-reader-${scannerId}`}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-black"
        />
      ) : null}

      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitManual();
          }}
          placeholder="Digita / pistola barcode…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={submitManual}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          OK
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}
      {last ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
          <p className="font-mono text-xs font-semibold">{last.codice}</p>
          <p className="font-medium">{last.nome}</p>
          <p className="text-[var(--muted)]">
            Giacenza: {last.giacenza.toLocaleString("it-IT")} {last.unita}
            {last.schedaProvvisoria ? " · scheda provvisoria" : ""}
          </p>
        </div>
      ) : null}

      {unknownStep ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Barcode sconosciuto</h3>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">
              {unknownBarcode}
            </p>

            {unknownStep === "choice" ? (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    setUnknownStep("associa");
                    loadArticoli();
                  }}
                >
                  Associa a prodotto esistente
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                  onClick={() => setUnknownStep("crea")}
                >
                  Crea nuovo prodotto
                </button>
                <button
                  type="button"
                  className="w-full text-sm text-[var(--muted)]"
                  onClick={() => {
                    setUnknownStep(null);
                    setUnknownBarcode(null);
                  }}
                >
                  Annulla
                </button>
              </div>
            ) : null}

            {unknownStep === "associa" ? (
              <div className="mt-3 space-y-2">
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as MagazzinoCatalogKind);
                    setSelectedId("");
                  }}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="prodotto_fornitore">Prodotti (Pr)</option>
                  <option value="materia_prima">Materia prima (Mp)</option>
                </select>
                <button
                  type="button"
                  onClick={loadArticoli}
                  className="text-xs text-sky-700"
                >
                  Ricarica elenco
                </button>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="">— articolo —</option>
                  {articoli.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codice} — {a.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !selectedId}
                  onClick={doAssocia}
                  className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Conferma associazione
                </button>
              </div>
            ) : null}

            {unknownStep === "crea" ? (
              <div className="mt-3 space-y-2">
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as MagazzinoCatalogKind)
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="prodotto_fornitore">Prodotti (Pr)</option>
                  <option value="materia_prima">Materia prima (Mp)</option>
                </select>
                <input
                  value={newNome}
                  onChange={(e) => setNewNome(e.target.value)}
                  placeholder="Nome prodotto"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <select
                  value={categoria}
                  onChange={(e) =>
                    setCategoria(
                      e.target.value as "mat_consumo" | "mat_poco_consumo"
                    )
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {CATEGORIA_UTILIZZO_OPTIONS.filter(
                    (o) => o.requiresMagazzino
                  ).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={provvisoria}
                    onChange={(e) => setProvvisoria(e.target.checked)}
                  />
                  Scheda provvisoria (completa con fattura)
                </label>
                <button
                  type="button"
                  disabled={pending || !newNome.trim()}
                  onClick={doCrea}
                  className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Crea e continua
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
