"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { listLottiAgrinsiciliaProdottoAction } from "@/app/actions/magazzino-lotti";
import { listProdottiPropriMagazzinoAction } from "@/app/actions/magazzino";
import { prelevaQuantitaAgrinsiciliaAction } from "@/app/actions/magazzino-prelievo";
import {
  MAGAZZINO_CARICO_UNITA_OPTIONS,
  type MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function MagazzinoPrelevaQuantitaBoard() {
  const params = useSearchParams();
  const foglio = params.get("foglio");
  const processo = params.get("processo");
  const attivita = params.get("attivita");
  const ritorno = params.get("ritorno");
  const fromProcesso = Boolean(processo || foglio);

  const [prodotti, setProdotti] = useState<
    Array<{
      id: string;
      codice: string;
      nome: string;
      giacenzaKg: number;
      unitaScheda: MagazzinoCaricoUnita;
    }>
  >([]);
  const [lotti, setLotti] = useState<
    Array<{ lottoCodice: string; quantitaKg: number }>
  >([]);
  const [prodottoId, setProdottoId] = useState("");
  const [lottoCodice, setLottoCodice] = useState("");
  const [quantita, setQuantita] = useState("");
  const [unita, setUnita] = useState<MagazzinoCaricoUnita>("kg");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listProdottiPropriMagazzinoAction().then((res) => {
      if (res.success) setProdotti(res.prodotti);
    });
  }, []);

  useEffect(() => {
    if (!prodottoId) {
      setLotti([]);
      setLottoCodice("");
      return;
    }
    const prod = prodotti.find((p) => p.id === prodottoId);
    if (prod) setUnita(prod.unitaScheda);
    void listLottiAgrinsiciliaProdottoAction(prodottoId).then((res) => {
      if (!res.success) return;
      const disponibili = res.lotti
        .filter((l) => l.quantitaKg > 1e-9)
        .map((l) => ({ lottoCodice: l.lottoCodice, quantitaKg: l.quantitaKg }));
      setLotti(disponibili);
      if (disponibili.length === 1) {
        setLottoCodice(disponibili[0]!.lottoCodice);
      }
    });
  }, [prodottoId, prodotti]);

  const lottoSel = useMemo(
    () => lotti.find((l) => l.lottoCodice === lottoCodice) ?? null,
    [lotti, lottoCodice]
  );

  function save() {
    const qty = Number(quantita.replace(",", "."));
    startTransition(async () => {
      setError(null);
      setOk(null);
      const res = await prelevaQuantitaAgrinsiciliaAction({
        prodottoId,
        lottoCodice,
        quantita: qty,
        unitaMisura: unita,
        foglioId: foglio && UUID_RE.test(foglio) ? foglio : null,
        processoId: processo && UUID_RE.test(processo) ? processo : null,
        attivitaId: attivita && UUID_RE.test(attivita) ? attivita : null,
        note,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOk(`Prelievo registrato. Giacenza prodotto: ${res.giacenzaKg} kg/lt.`);
      setQuantita("");
      const prodRes = await listProdottiPropriMagazzinoAction();
      if (prodRes.success) setProdotti(prodRes.prodotti);
      const lotRes = await listLottiAgrinsiciliaProdottoAction(prodottoId);
      if (lotRes.success) {
        setLotti(
          lotRes.lotti
            .filter((l) => l.quantitaKg > 1e-9)
            .map((l) => ({
              lottoCodice: l.lottoCodice,
              quantitaKg: l.quantitaKg,
            }))
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {fromProcesso ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Prelievo avviato dal processo in produzione.
          {ritorno ? (
            <>
              {" "}
              <Link href={ritorno} className="font-medium underline">
                Torna al foglio
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Prodotto</span>
          <select
            value={prodottoId}
            onChange={(e) => setProdottoId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Seleziona…</option>
            {prodotti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codice} — {p.nome} ({p.giacenzaKg.toLocaleString("it-IT")}{" "}
                kg/lt)
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Lotto</span>
          <select
            value={lottoCodice}
            onChange={(e) => setLottoCodice(e.target.value)}
            disabled={!prodottoId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm disabled:opacity-50"
          >
            <option value="">
              {prodottoId ? "Seleziona lotto…" : "Prima il prodotto"}
            </option>
            {lotti.map((l) => (
              <option key={l.lottoCodice} value={l.lottoCodice}>
                {l.lottoCodice} · {l.quantitaKg.toLocaleString("it-IT")} kg
              </option>
            ))}
          </select>
          {lottoSel ? (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Disponibili sul lotto: {lottoSel.quantitaKg.toLocaleString("it-IT")}{" "}
              kg
            </span>
          ) : null}
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Quantità</span>
          <input
            type="number"
            min={0}
            step="0.001"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Unità</span>
          <select
            value={unita}
            onChange={(e) =>
              setUnita(e.target.value as MagazzinoCaricoUnita)
            }
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {MAGAZZINO_CARICO_UNITA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="button"
            disabled={pending || !prodottoId || !lottoCodice || !quantita}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Registrazione…" : "Registra prelievo"}
          </button>
        </div>
      </div>
    </div>
  );
}
