"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import {
  listFornitoriTargaMagazzinoAction,
  listLottiMateriaPrimaPerLottoAction,
  nextLottoProgressivoAgrinsiciliaAction,
  type FornitoreTargaMagazzino,
  type LottoMateriaPrimaOption,
} from "@/app/actions/magazzino";
import {
  composeLottoAgrinsicilia,
  composeLottoBozza,
  digitsFromDataLotto,
  formatPartialDate,
  parseLottoAgrinsicilia,
  parseLottoBozza,
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
    dataInizio: "",
    targaProdotto,
    targaFornitore: "",
    ddt: "",
    progressivo: "",
  };
}

function dateParts(dataInizio: string): [string, string, string] {
  const d = digitsFromDataLotto(dataInizio);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)];
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
  const [parti, setParti] = useState<LottoAgrinsiciliaParti>(
    parsedInitial
      ? { ...parsedInitial, targaProdotto }
      : emptyParti(targaProdotto)
  );
  const [fornitori, setFornitori] = useState<FornitoreTargaMagazzino[]>([]);
  const [lottiMp, setLottiMp] = useState<LottoMateriaPrimaOption[]>([]);
  const [lottoMpId, setLottoMpId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const fornRef = useRef<HTMLInputElement>(null);
  const ddtRef = useRef<HTMLInputElement>(null);
  const progRef = useRef<HTMLInputElement>(null);

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
        dataInizio: parsedInitial?.dataInizio,
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
    dayRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targaProdotto]);

  const [dd, mm, yy] = dateParts(parti.dataInizio);
  const bozza = composeLottoBozza({ ...parti, targaProdotto });
  const composto = composeLottoAgrinsicilia({ ...parti, targaProdotto });

  function setPartiLocked(next: LottoAgrinsiciliaParti) {
    setParti({ ...next, targaProdotto });
    setError(null);
  }

  function patch(partial: Partial<LottoAgrinsiciliaParti>) {
    setPartiLocked({ ...parti, ...partial, targaProdotto });
  }

  function applyPasted(value: string) {
    const parsed =
      parseLottoAgrinsicilia(value) ?? parseLottoBozza(value, targaProdotto);
    setPartiLocked({ ...parsed, targaProdotto });
  }

  async function refreshProgressivo(dataInizio: string) {
    const prog = await nextLottoProgressivoAgrinsiciliaAction({
      targaProdotto,
      dataInizio,
    });
    if (prog.success) {
      setParti((cur) => ({
        ...cur,
        dataInizio,
        targaProdotto,
        progressivo: cur.progressivo || prog.progressivo,
      }));
    }
  }

  function onDateSeg(
    which: "dd" | "mm" | "yy",
    value: string,
    next?: React.RefObject<HTMLInputElement | null>
  ) {
    const digits = value.replace(/\D/g, "");
    const parts = dateParts(parti.dataInizio);
    if (which === "dd") parts[0] = digits.slice(0, 2);
    if (which === "mm") parts[1] = digits.slice(0, 2);
    if (which === "yy") parts[2] = digits.slice(0, 2);
    const dataInizio = formatPartialDate(parts.join(""));
    patch({ dataInizio: dataInizio.includes("_") ? parts.join("") : dataInizio });
    const max = which === "yy" ? 2 : 2;
    if (digits.length >= max && next?.current) next.current.focus();
    if (which === "yy" && digits.length >= 2) {
      const full = formatPartialDate(parts.join(""));
      if (!full.includes("_")) void refreshProgressivo(full);
    }
  }

  function confirm() {
    const out = composeLottoAgrinsicilia({ ...parti, targaProdotto });
    if (!out) {
      setError(
        "Completa data, fornitore, DDT e progressivo, oppure incolla un lotto valido."
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
          Lotto lavorazione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Digita sulla riga (separatori già visibili, come una data) oppure
          compila i campi sotto: si aggiornano a vicenda. {prodottoLabel}
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Compilazione manuale (separatori già in riga)
          </span>
          <input
            value={bozza}
            onChange={(e) => applyPasted(e.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm tracking-wide"
          />
        </label>

        <div className="mt-2">
          <span className="mb-1 block text-xs text-[var(--muted)]">
            Stessa riga, caselle separate
          </span>
          <div
            className="flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text.includes("L-") || text.includes("/")) {
                e.preventDefault();
                applyPasted(text);
              }
            }}
          >
            <span className="select-none text-slate-400">L-</span>
            <MaskCell
              ref={dayRef}
              value={dd}
              max={2}
              placeholder="gg"
              onChange={(v) => onDateSeg("dd", v, monthRef)}
            />
            <span className="select-none text-slate-400">.</span>
            <MaskCell
              ref={monthRef}
              value={mm}
              max={2}
              placeholder="mm"
              onChange={(v) => onDateSeg("mm", v, yearRef)}
            />
            <span className="select-none text-slate-400">.</span>
            <MaskCell
              ref={yearRef}
              value={yy}
              max={2}
              placeholder="aa"
              onChange={(v) => onDateSeg("yy", v, fornRef)}
            />
            <span className="select-none text-slate-400">/</span>
            <span className="rounded bg-slate-50 px-1 text-slate-600">
              {targaProdotto}
            </span>
            <span className="select-none text-slate-400">/</span>
            <MaskCell
              ref={fornRef}
              value={parti.targaFornitore}
              max={3}
              placeholder="___"
              onChange={(v) => {
                const next = stripTargaFornitore(v).slice(0, 3);
                patch({ targaFornitore: next });
                if (next.length >= 3) ddtRef.current?.focus();
              }}
            />
            <span className="select-none text-slate-400">/</span>
            <MaskCell
              ref={ddtRef}
              value={parti.ddt}
              max={12}
              width="w-20"
              placeholder="____"
              onChange={(v) => {
                const next = v.replace(/\s+/g, "").replace(/-/g, "");
                patch({ ddt: next });
              }}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "Enter") {
                  e.preventDefault();
                  progRef.current?.focus();
                }
              }}
            />
            <span className="select-none text-slate-400">-</span>
            <MaskCell
              ref={progRef}
              value={parti.progressivo}
              max={3}
              placeholder="___"
              onChange={(v) =>
                patch({ progressivo: v.replace(/\D/g, "").slice(0, 3) })
              }
            />
          </div>
        </div>

        <p className="mt-5 text-sm font-medium">Campi per significato</p>
        <p className="text-xs text-[var(--muted)]">
          Se compili qui, la riga sopra si aggiorna da sola. Se scrivi sopra, si
          compilano questi campi.
        </p>

        {lottiMp.length > 0 ? (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Lotto materia prima</span>
            <select
              value={lottoMpId}
              onChange={(e) => {
                const id = e.target.value;
                setLottoMpId(id);
                const lotto = lottiMp.find((l) => l.id === id);
                if (!lotto) return;
                patch({
                  targaFornitore: lotto.targaFornitore || parti.targaFornitore,
                  ddt: lotto.ddt || parti.ddt,
                });
              }}
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
              Data inizio lavorazione
            </span>
            <input
              value={formatPartialDate(parti.dataInizio)}
              onChange={(e) => {
                const digits = digitsFromDataLotto(e.target.value);
                const dataInizio =
                  digits.length === 6
                    ? formatPartialDate(digits)
                    : digits;
                patch({ dataInizio });
                if (digits.length === 6) void refreshProgressivo(formatPartialDate(digits));
              }}
              placeholder="gg.mm.aa"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
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
              onChange={(e) =>
                patch({ targaFornitore: stripTargaFornitore(e.target.value) })
              }
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
              onChange={(e) =>
                patch({ ddt: e.target.value.replace(/\s+/g, "") })
              }
              placeholder="B013"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Progressivo annuo (3 cifre)
            </span>
            <input
              value={parti.progressivo}
              onChange={(e) =>
                patch({
                  progressivo: e.target.value.replace(/\D/g, "").slice(0, 3),
                })
              }
              placeholder="001"
              maxLength={3}
              className="w-32 rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

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

const MaskCell = forwardRef<
  HTMLInputElement,
  {
    value: string;
    max: number;
    placeholder: string;
    width?: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  }
>(function MaskCell(
  { value, max, placeholder, width, onChange, onKeyDown },
  ref
) {
  return (
    <input
      ref={ref}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={`${width ?? "w-8"} border-0 bg-transparent p-0 text-center outline-none placeholder:text-slate-300`}
    />
  );
});
