"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  generaLottoUscitaFoglioAction,
  getDecodificaLottoAction,
  updateVisibilitaLottoAction,
} from "@/app/actions/lotti-esterni";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import { stampaSchedaLottoUscita } from "@/lib/produzione/stampa-scheda-lotto-uscita";
import {
  FOGLI_STORAGE_KEY,
  loadFogliFromStorage,
} from "@/lib/produzione/fogli-lavorazione";
import {
  VISIBILITA_CHIAVI,
  VISIBILITA_LABEL,
  type LottoEsterno,
  type VisibilitaChiave,
} from "@/lib/produzione/lotti-esterni";

function persistLottoSuFoglioLocale(foglioId: string, codice: string) {
  if (typeof window === "undefined") return;
  const fogli = loadFogliFromStorage();
  const next = fogli.map((f) =>
    f.id === foglioId ? { ...f, lottoUscitaCodice: codice } : f
  );
  window.localStorage.setItem(FOGLI_STORAGE_KEY, JSON.stringify(next));
}

type Props = {
  foglioId: string;
  lottoCodice?: string | null;
};

export function LottoUscitaBox({ foglioId, lottoCodice }: Props) {
  const [lotto, setLotto] = useState<LottoEsterno | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lottoCodice) {
      void generaLottoUscitaFoglioAction(foglioId).then((res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }
        setLotto(res.lotto);
        persistLottoSuFoglioLocale(foglioId, res.lotto.codice);
        void getDecodificaLottoAction(res.lotto.codice).then((d) => {
          if (d.success) setPublicUrl(d.data.publicUrl);
        });
      });
      return;
    }
    void getDecodificaLottoAction(lottoCodice).then((d) => {
      if (!d.success) {
        setError(d.error);
        return;
      }
      setLotto(d.data.lotto);
      setPublicUrl(d.data.publicUrl);
      persistLottoSuFoglioLocale(foglioId, d.data.lotto.codice);
    });
  }, [foglioId, lottoCodice]);

  async function saveVis(next: Record<VisibilitaChiave, boolean>) {
    if (!lotto) return;
    setBusy(true);
    const res = await updateVisibilitaLottoAction({
      id: lotto.id,
      visibilita: next,
      publicEnabled: lotto.publicEnabled,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setLotto({ ...lotto, visibilita: next });
  }

  function printSheet() {
    if (!lotto) return;
    const canvas = rootRef.current?.querySelector("canvas");
    const qr =
      canvas instanceof HTMLCanvasElement ? canvas.toDataURL("image/png") : null;
    stampaSchedaLottoUscita({
      codice: lotto.codice,
      publicUrl,
      prodotto: lotto.prodottoNome,
      settimana: lotto.settimana,
      anno: lotto.anno,
      qrDataUrl: qr,
    });
  }

  if (!lotto) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {error ?? "Generazione lotto in uscita…"}
      </p>
    );
  }

  return (
    <section
      ref={rootRef}
      className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Lotto prodotto in uscita (esterno)
          </p>
          <p className="font-mono text-2xl font-semibold tracking-wide text-slate-900">
            {lotto.codice}
          </p>
          <p className="text-xs text-slate-600">
            Settimana ISO {lotto.settimana} · {lotto.anno} · 10 caratteri ·
            accompagna il prodotto fino a vendita / fattura / DDT
          </p>
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={busy}
              checked={lotto.publicEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setBusy(true);
                void updateVisibilitaLottoAction({
                  id: lotto.id,
                  visibilita: lotto.visibilita,
                  publicEnabled: enabled,
                }).then((res) => {
                  setBusy(false);
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setLotto({ ...lotto, publicEnabled: enabled });
                });
              }}
            />
            QR pubblico attivo
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/produzione/fogli-lavorazione/decifratore?codice=${lotto.codice}`}
            className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-800"
          >
            Decifratore
          </Link>
          <button
            type="button"
            onClick={printSheet}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white"
          >
            Stampa QR / PDF
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <BarcodePreview value={publicUrl || lotto.codice} format="qrcode" />
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Cosa mostrare sul QR pubblico
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {VISIBILITA_CHIAVI.map((k) => (
              <li key={k}>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={lotto.visibilita[k]}
                    onChange={(e) =>
                      void saveVis({
                        ...lotto.visibilita,
                        [k]: e.target.checked,
                      })
                    }
                  />
                  {VISIBILITA_LABEL[k]}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
