"use client";

import { useMemo, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import type { ConfezionamentoNodoDraft } from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  contaFogliBlocco,
  contaFogliCollo,
  pagineFogliLotto,
  type FoglioLottoStampaModo,
} from "@/lib/magazzino/fogli-lotto-blocchi";
import { stampaFogliLottoAgrinsicilia } from "@/lib/magazzino/stampa-foglio-lotto-agrinsicilia";
import type { LottoAgrinsiciliaDettaglio } from "@/lib/magazzino/types";

export function StampaFogliLottoModal({
  lotto,
  nodi,
  onClose,
}: {
  lotto: LottoAgrinsiciliaDettaglio;
  nodi: ConfezionamentoNodoDraft[];
  onClose: () => void;
}) {
  const [modo, setModo] = useState<FoglioLottoStampaModo>(
    nodi.length ? "blocco" : "libera"
  );
  const [copie, setCopie] = useState(1);
  const nBlocco = useMemo(() => contaFogliBlocco(nodi), [nodi]);
  const nCollo = useMemo(() => contaFogliCollo(nodi), [nodi]);
  const nFogli =
    modo === "blocco" ? nBlocco : modo === "collo" ? nCollo : Math.max(1, copie);

  function stampa() {
    const pagine = pagineFogliLotto(modo, nodi, copie);
    stampaFogliLottoAgrinsicilia(lotto, pagine);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stampa-fogli-lotto-title"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="stampa-fogli-lotto-title" className="text-base font-semibold">
          Stampa fogli lotto
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          I fogli seguono i blocchi salvati. Scegli se stamparne uno per ogni
          blocco, uno per ogni collo (con i totali del pallet) oppure un numero
          libero.
        </p>

        <fieldset className="mt-4 space-y-2">
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            <input
              type="radio"
              name="stampa-modo"
              checked={modo === "blocco"}
              disabled={!nBlocco}
              onChange={() => setModo("blocco")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Un foglio per ogni blocco</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {nBlocco
                  ? `${nBlocco} fogli (ogni pallet / unità di movimentazione)`
                  : "Nessun blocco salvato"}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            <input
              type="radio"
              name="stampa-modo"
              checked={modo === "collo"}
              disabled={!nCollo}
              onChange={() => setModo("collo")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Un foglio per ogni collo</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {nCollo
                  ? `${nCollo} fogli. Su ogni foglio c’è il totale colli di quel pallet (es. collo 3 di 10).`
                  : "Nessun collo nei blocchi"}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            <input
              type="radio"
              name="stampa-modo"
              checked={modo === "libera"}
              onChange={() => setModo("libera")}
              className="mt-0.5"
            />
            <span className="flex-1">
              <span className="font-medium">Stampa libera</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Decidi tu quante copie del foglio lotto.
              </span>
              {modo === "libera" ? (
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={copie}
                  onChange={(e) =>
                    setCopie(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="mt-2 w-24 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              ) : null}
            </span>
          </label>
        </fieldset>

        <p className="mt-3 text-sm font-medium">
          Verranno stampati {nFogli} {nFogli === 1 ? "foglio" : "fogli"}.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={nFogli < 1}
            onClick={stampa}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <FaPrint size={13} />
            Stampa
          </button>
        </div>
      </div>
    </div>
  );
}
