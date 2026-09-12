"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  listFornitoriTargaMagazzinoAction,
  listLottiMateriaPrimaPerLottoAction,
  nextLottoProgressivoAgrinsiciliaAction,
  type FornitoreTargaMagazzino,
  type LottoMateriaPrimaOption,
} from "@/app/actions/magazzino";
import {
  composeLottoAgrinsicilia,
  dataLottoToIso,
  formatDataLotto,
  isoToDataLotto,
  parseLottoAgrinsicilia,
  stripTargaFornitore,
  type LottoAgrinsiciliaParti,
} from "@/lib/magazzino/lotto-agrinsicilia";

type Props = {
  targaProdotto: string;
  prodottoLabel: string;
  initialLotto?: string;
  onClose: () => void;
  onConfirm: (lotto: string) => void;
};

function emptyParti(targaProdotto: string): LottoAgrinsiciliaParti {
  return {
    dataInizio: formatDataLotto(new Date()),
    targaProdotto,
    targaFornitore: "",
    ddt: "",
    progressivo: "",
  };
}

export function LottoAgrinsiciliaModal({
  targaProdotto,
  prodottoLabel,
  initialLotto,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const parsedInitial = parseLottoAgrinsicilia(initialLotto ?? "");
  const [raw, setRaw] = useState(initialLotto ?? "");
  const [parti, setParti] = useState<LottoAgrinsiciliaParti>(
    parsedInitial
      ? { ...parsedInitial, targaProdotto }
      : emptyParti(targaProdotto)
  );
  const [fornitori, setFornitori] = useState<FornitoreTargaMagazzino[]>([]);
  const [lottiMp, setLottiMp] = useState<LottoMateriaPrimaOption[]>([]);
  const [lottoMpId, setLottoMpId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    void Promise.all([
      listFornitoriTargaMagazzinoAction(),
      listLottiMateriaPrimaPerLottoAction(),
      nextLottoProgressivoAgrinsiciliaAction({
        targaProdotto,
        dataInizio: parti.dataInizio,
      }),
    ]).then(([f, m, p]) => {
      if (f.success) setFornitori(f.items);
      if (m.success) setLottiMp(m.items);
      if (p.success && !parsedInitial?.progressivo) {
        setParti((cur) =>
          cur.progressivo ? cur : { ...cur, progressivo: p.progressivo }
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targaProdotto]);

  const composto = useMemo(() => composeLottoAgrinsicilia(parti), [parti]);

  function applyRaw(value: string) {
    setRaw(value);
    const parsed = parseLottoAgrinsicilia(value);
    if (!parsed) return;
    setParti({ ...parsed, targaProdotto });
    setError(null);
  }

  function patch(partial: Partial<LottoAgrinsiciliaParti>) {
    setParti((cur) => {
      const next = { ...cur, ...partial, targaProdotto };
      setRaw(composeLottoAgrinsicilia(next));
      return next;
    });
    setError(null);
  }

  async function onDataChange(iso: string) {
    const dataInizio = isoToDataLotto(iso) || formatDataLotto(new Date());
    const prog = await nextLottoProgressivoAgrinsiciliaAction({
      targaProdotto,
      dataInizio,
    });
    patch({
      dataInizio,
      progressivo: prog.success ? prog.progressivo : parti.progressivo,
    });
  }

  function onFornitoreSelect(targaSenzaF: string) {
    patch({ targaFornitore: targaSenzaF });
  }

  function onLottoMpSelect(id: string) {
    setLottoMpId(id);
    const lotto = lottiMp.find((l) => l.id === id);
    if (!lotto) return;
    patch({
      targaFornitore: lotto.targaFornitore || parti.targaFornitore,
      ddt: lotto.ddt || parti.ddt,
    });
  }

  function confirm() {
    const out = composeLottoAgrinsicilia(parti);
    if (!out) {
      setError(
        "Compila data, targa fornitore, DDT e progressivo, oppure incolla un lotto valido."
      );
      return;
    }
    onConfirm(out);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl">
        <h2 id={titleId} className="text-base font-semibold">
          Composizione lotto lavorazione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Incolla il lotto completo: il sistema lo suddivide nei campi, come un
          IBAN. Prodotto: {prodottoLabel} (targa {targaProdotto}).
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Lotto completo</span>
          <input
            autoFocus
            value={raw}
            onChange={(e) => applyRaw(e.target.value)}
            placeholder="L-11.06.26/NDRi/031/B013-215"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1 font-mono text-xs">
          <Seg label="L-" value="L-" locked />
          <Seg label="data" value={parti.dataInizio || "gg.mm.aa"} />
          <Seg label="prodotto" value={parti.targaProdotto || "—"} locked />
          <Seg label="fornitore" value={parti.targaFornitore || "—"} />
          <Seg label="DDT" value={parti.ddt || "—"} />
          <Seg label="n°" value={parti.progressivo || "—"} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Data inizio lavorazione
            </span>
            <input
              type="date"
              value={dataLottoToIso(parti.dataInizio)}
              onChange={(e) => void onDataChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Targa prodotto</span>
            <input
              readOnly
              value={targaProdotto}
              className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

        {lottiMp.length > 0 ? (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">
              Lotto materia prima (riempie fornitore e DDT se noti)
            </span>
            <select
              value={lottoMpId}
              onChange={(e) => onLottoMpSelect(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona lotto Mp…</option>
              {lottiMp.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lottoCodice} · {l.prodottoCodice}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Targa fornitore (senza F)
            </span>
            <select
              value={
                fornitori.some((f) => f.targaSenzaF === parti.targaFornitore)
                  ? parti.targaFornitore
                  : ""
              }
              onChange={(e) => onFornitoreSelect(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona fornitore…</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.targaSenzaF}>
                  {f.targaSenzaF} — {f.ragioneSociale}
                </option>
              ))}
            </select>
            <input
              value={parti.targaFornitore}
              onChange={(e) =>
                patch({ targaFornitore: stripTargaFornitore(e.target.value) })
              }
              placeholder="031"
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">DDT merce in arrivo</span>
            <input
              value={parti.ddt}
              onChange={(e) => patch({ ddt: e.target.value.replace(/\s+/g, "") })}
              placeholder="B013"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">
            Progressivo annuo (questo prodotto, 3 cifre)
          </span>
          <input
            value={parti.progressivo}
            onChange={(e) =>
              patch({ progressivo: e.target.value.replace(/\D/g, "").slice(0, 3) })
            }
            placeholder="001"
            maxLength={3}
            className="w-32 rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
          />
        </label>

        {composto ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm">
            {composto}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Usa questo lotto
          </button>
        </div>
      </div>
    </div>
  );
}

function Seg({
  label,
  value,
  locked,
}: {
  label: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <span
      title={label}
      className={`rounded-md border px-2 py-1 ${
        locked
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : "border-[var(--border)] bg-white"
      }`}
    >
      {value}
    </span>
  );
}
