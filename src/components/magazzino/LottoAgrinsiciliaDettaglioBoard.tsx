"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaArrowLeft, FaPrint } from "react-icons/fa6";
import {
  completaConfezIsolamentoLottoAction,
  getLottoAgrinsiciliaDettaglioAction,
  listImballaggiCiMagazzinoAction,
} from "@/app/actions/magazzino-lotti";
import { stampaFoglioLottoAgrinsicilia } from "@/lib/magazzino/stampa-foglio-lotto-agrinsicilia";
import { publicLottoUrl } from "@/lib/produzione/lotti-esterni";
import { stampaSchedaLottoUscita } from "@/lib/produzione/stampa-scheda-lotto-uscita";
import type {
  ImballaggioMagazzinoOpt,
  LottoAgrinsiciliaDettaglio,
} from "@/lib/magazzino/types";

function dt(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT");
}

export function LottoAgrinsiciliaDettaglioBoard({
  lottoCodice,
  prodottoId,
}: {
  lottoCodice: string;
  prodottoId?: string;
}) {
  const [lotto, setLotto] = useState<LottoAgrinsiciliaDettaglio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [confezioni, setConfezioni] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [isolamenti, setIsolamenti] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [confezioneId, setConfezioneId] = useState("");
  const [isolamentoId, setIsolamentoId] = useState("");
  const [savingCi, setSavingCi] = useState(false);

  async function reload() {
    const [d, cat] = await Promise.all([
      getLottoAgrinsiciliaDettaglioAction({ lottoCodice, prodottoId }),
      listImballaggiCiMagazzinoAction(),
    ]);
    if (!d.success) {
      setError(d.error);
      setLotto(null);
      return;
    }
    setLotto(d.lotto);
    setConfezioneId(d.lotto.confezioneId ?? "");
    setIsolamentoId(d.lotto.isolamentoId ?? "");
    setError(null);
    if (cat.success) {
      setConfezioni(cat.confezioni);
      setIsolamenti(cat.isolamenti);
    }
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lottoCodice, prodottoId]);

  async function salvaCi() {
    if (!lotto) return;
    setSavingCi(true);
    setError(null);
    const res = await completaConfezIsolamentoLottoAction({
      lottoCodice: lotto.lottoCodice,
      prodottoId: lotto.prodottoId,
      confezioneId,
      isolamentoId,
    });
    setSavingCi(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await reload();
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento lotto…</p>;
  }
  if (!lotto) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700">{error ?? "Lotto non trovato."}</p>
        <Link
          href="/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita"
          className="text-sm font-medium text-[var(--primary)]"
        >
          Torna all’elenco
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline"
          >
            <FaArrowLeft size={11} />
            Elenco e quantità
          </Link>
          <h2 className="mt-2 font-mono text-lg font-semibold tracking-wide">
            {lotto.lottoCodice}
          </h2>
          <p className="text-sm text-slate-700">
            {lotto.prodottoCodice} — {lotto.prodottoNome}
          </p>
          <p className="text-sm tabular-nums text-slate-600">
            Quantità caricata: {lotto.quantitaKg.toLocaleString("it-IT")}{" "}
            {lotto.unita}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => stampaFoglioLottoAgrinsicilia(lotto)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            <FaPrint size={13} />
            Stampa foglio lotto
          </button>
          {lotto.lottoEsterno ? (
            <button
              type="button"
              onClick={() =>
                stampaSchedaLottoUscita({
                  codice: lotto.lottoEsterno!.codice,
                  publicUrl: lotto.lottoEsterno!.publicToken
                    ? publicLottoUrl(
                        lotto.lottoEsterno!.publicToken,
                        window.location.origin
                      )
                    : "",
                  prodotto: `${lotto.prodottoCodice} — ${lotto.prodottoNome}`,
                  settimana: lotto.lottoEsterno!.settimana ?? 0,
                  anno: lotto.lottoEsterno!.anno ?? new Date().getFullYear(),
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium"
            >
              <FaPrint size={13} />
              Stampa lotto esterno
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">Confezionamento e isolamento</h3>
        {lotto.daCompletareCi ? (
          <p className="mt-1 text-xs text-amber-800">
            Campo obbligatorio ancora da completare. Il carico quantità è già
            valido.
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {lotto.confezioneNome ?? "—"} · {lotto.isolamentoNome ?? "—"}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Confezionamento</span>
            <select
              value={confezioneId}
              onChange={(e) => setConfezioneId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {confezioni.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice} — {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Isolamento</span>
            <select
              value={isolamentoId}
              onChange={(e) => setIsolamentoId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {isolamenti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice} — {c.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={savingCi || !confezioneId || !isolamentoId}
          onClick={() => void salvaCi()}
          className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {savingCi ? "Salvataggio…" : "Salva confezione e isolamento"}
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Foglio ingresso materia prima</h3>
          {lotto.foglioIngresso ? (
            <dl className="mt-2 space-y-1 text-sm">
              <p>
                <span className="text-[var(--muted)]">Codice: </span>
                {lotto.foglioIngresso.codice}
              </p>
              <p>
                <span className="text-[var(--muted)]">Lotto MP: </span>
                {lotto.foglioIngresso.lottoMp || "—"}
              </p>
              <p>
                <span className="text-[var(--muted)]">Stato: </span>
                {lotto.foglioIngresso.documentoStato}
              </p>
              <p>
                <span className="text-[var(--muted)]">Operatore muletto: </span>
                {lotto.foglioIngresso.operatoreMuletto || "—"}
              </p>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Nessun foglio ingresso collegato a questo lotto.
            </p>
          )}
        </section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Foglio di lavorazione</h3>
          {lotto.foglio ? (
            <dl className="mt-2 space-y-1 text-sm">
              <p>
                <span className="text-[var(--muted)]">Codice: </span>
                {lotto.foglio.codice}
              </p>
              <p>
                <span className="text-[var(--muted)]">Stato: </span>
                {lotto.foglio.stato}
              </p>
              <p>
                <span className="text-[var(--muted)]">Lotto foglio: </span>
                {lotto.foglio.lottoLabel || "—"}
              </p>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Nessun foglio di lavorazione collegato.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">Lotti</h3>
        <p className="mt-2 text-sm">
          <span className="text-[var(--muted)]">Interno: </span>
          <span className="font-mono font-semibold">{lotto.lottoCodice}</span>
        </p>
        <p className="mt-1 text-sm">
          <span className="text-[var(--muted)]">Esterno: </span>
          {lotto.lottoEsterno ? (
            <span className="font-mono font-semibold">
              {lotto.lottoEsterno.codice}
            </span>
          ) : (
            "—"
          )}
        </p>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">
          Timeline e turnistica registrazioni
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Ogni registrazione con data/ora e operatore. La turnistica di
          Produzione, se ancora vuota, non aggiunge altri turni.
        </p>
        <ol className="mt-3 space-y-2">
          {lotto.timeline.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm"
            >
              <p className="text-xs text-[var(--muted)]">{dt(e.at)}</p>
              <p className="font-medium">{e.titolo}</p>
              <p className="text-slate-700">{e.dettaglio}</p>
              <p className="text-xs text-slate-600">
                Operatore: {e.operatore || "—"}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
