"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { listCodiciMpLavorataMagazzinoAction } from "@/app/actions/produzione-ingresso-mp";
import {
  generaCodiceMpInventarioAction,
  listFornitoriTargaMagazzinoAction,
  nextLottoProgressivoAgrinsiciliaAction,
  type FornitoreTargaMagazzino,
} from "@/app/actions/magazzino";
import {
  composeLottoAgrinsicilia,
  composeLottoBozza,
  digitsFromDataLotto,
  formatDataLotto,
  formatPartialDate,
  isValidLottoAgrinsicilia,
  parseLottoAgrinsicilia,
  parseLottoBozza,
  stripTargaFornitore,
  type LottoAgrinsiciliaParti,
} from "@/lib/magazzino/lotto-agrinsicilia";
import { isValidLottoIngressoMp } from "@/lib/produzione/fogli-ingresso-mp";
import { SelectMenu } from "@/components/ui/SelectMenu";

type CodiceMpOpt = {
  lotto: string;
  fornitoreTarga: string;
  fornitoreLabel: string;
  materiaPrima: string;
};

type Props = {
  targaProdotto: string;
  prodottoLabel: string;
  initialLotto?: string;
  /** Codice MP inventario generato in questa sessione (non è ancora in anagrafica). */
  initialMpInventario?: string;
  onMpInventario?: (codice: string) => void;
  /** Lotto già componibile (es. dopo genera MP inventario): resta in form anche chiudendo. */
  onDraftLotto?: (lotto: string) => void;
  onClose: () => void;
  onConfirm: (lotto: string) => void;
};

function mpInventarioOpt(codice: string, fornitoreTarga = "INV"): CodiceMpOpt {
  return {
    lotto: codice,
    fornitoreTarga,
    fornitoreLabel: "Inventario (senza storico)",
    materiaPrima: "Inventario",
  };
}

function mergeCodiciMp(base: CodiceMpOpt[], extra: CodiceMpOpt[]): CodiceMpOpt[] {
  const seen = new Set<string>();
  const out: CodiceMpOpt[] = [];
  for (const row of [...extra, ...base]) {
    const key = row.lotto.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

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
  initialMpInventario,
  onMpInventario,
  onDraftLotto,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const parsedInitial =
    parseLottoAgrinsicilia(initialLotto ?? "") ??
    (initialLotto
      ? parseLottoBozza(initialLotto, targaProdotto)
      : null);
  const seedMp = (
    parsedInitial?.ddt ||
    initialMpInventario ||
    ""
  ).trim();
  const extraMpRef = useRef<CodiceMpOpt[]>(
    seedMp ? [mpInventarioOpt(seedMp, parsedInitial?.targaFornitore || "INV")] : []
  );
  const [parti, setParti] = useState<LottoAgrinsiciliaParti>(() => {
    if (parsedInitial && (parsedInitial.ddt || parsedInitial.dataInizio)) {
      return {
        ...emptyParti(targaProdotto),
        ...parsedInitial,
        targaProdotto,
        ddt: seedMp || parsedInitial.ddt,
      };
    }
    return seedMp
      ? { ...emptyParti(targaProdotto), ddt: seedMp }
      : emptyParti(targaProdotto);
  });
  const [fornitori, setFornitori] = useState<FornitoreTargaMagazzino[]>([]);
  const [codiciMp, setCodiciMp] = useState<CodiceMpOpt[]>(() => extraMpRef.current);
  const [codiceMpSel, setCodiceMpSel] = useState(seedMp);
  const [listsReady, setListsReady] = useState(false);
  const [generaMpBusy, setGeneraMpBusy] = useState(false);
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
      listCodiciMpLavorataMagazzinoAction(),
      nextLottoProgressivoAgrinsiciliaAction({
        targaProdotto,
        dataInizio: parsedInitial?.dataInizio,
      }),
    ]).then(([f, m, p]) => {
      if (f.success) setFornitori(f.items);
      if (m.success) {
        setCodiciMp((cur) => mergeCodiciMp(m.items, [...extraMpRef.current, ...cur]));
      }
      if (p.success) {
        setParti((cur) =>
          cur.progressivo ? cur : { ...cur, progressivo: p.progressivo }
        );
      }
    }).finally(() => setListsReady(true));
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

  async function generaCodiceMpInventario() {
    setError(null);
    setGeneraMpBusy(true);
    const res = await generaCodiceMpInventarioAction();
    setGeneraMpBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    const codice = res.codice;
    const forn = parti.targaFornitore || "INV";
    const dataDigits = digitsFromDataLotto(parti.dataInizio);
    const dataInizio =
      dataDigits.length === 6
        ? formatPartialDate(dataDigits)
        : formatDataLotto(new Date());
    const opt = mpInventarioOpt(codice, forn);
    extraMpRef.current = mergeCodiciMp(extraMpRef.current, [opt]);
    setCodiciMp((cur) => mergeCodiciMp(cur, [opt]));
    setCodiceMpSel(codice);
    setPartiLocked({
      ...parti,
      ddt: codice,
      targaFornitore: forn,
      dataInizio,
      progressivo: parti.progressivo || "001",
    });
    onMpInventario?.(codice);
    const draft = composeLottoAgrinsicilia({
      ...parti,
      targaProdotto,
      ddt: codice,
      targaFornitore: forn,
      dataInizio,
      progressivo: parti.progressivo || "001",
    });
    if (draft && isValidLottoAgrinsicilia(draft)) {
      onDraftLotto?.(draft);
    }
  }

  function confirm() {
    const next = {
      ...parti,
      targaProdotto,
      ddt: (parti.ddt || codiceMpSel || seedMp).trim(),
    };
    const out = composeLottoAgrinsicilia(next);
    if (out && isValidLottoAgrinsicilia(out)) {
      onMpInventario?.(next.ddt);
      onConfirm(out);
      return;
    }
    if (next.ddt && !isValidLottoIngressoMp(next.ddt)) {
      setError(
        "Codice MP lavorata non valido: serve GGMMAA + 5 cifre esadecimali (es. 12092600001)."
      );
      return;
    }
    setError(
      "Completa data, fornitore, codice MP lavorata (GGMMAA + 5 hex) e progressivo. Poi usa «Usa questo lotto»."
    );
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
              max={11}
              width="w-28"
              placeholder="GGMMAAhhhhh"
              onChange={(v) => {
                const next = v
                  .replace(/\s+/g, "")
                  .replace(/-/g, "")
                  .toUpperCase();
                setCodiceMpSel(next);
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

        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium">Codice MP lavorata</span>
          <SelectMenu
            loading={!listsReady}
            placeholder="Seleziona lotto ingresso MP"
            value={codiceMpSel || parti.ddt}
            onChange={(e) => {
              const lotto = e.target.value;
              setCodiceMpSel(lotto);
              if (!lotto) return;
              const row = codiciMp.find((l) => l.lotto === lotto);
              patch({
                targaFornitore: row?.fornitoreTarga || parti.targaFornitore || "INV",
                ddt: lotto,
              });
            }}
          >
            {mergeCodiciMp(
              codiciMp,
              (codiceMpSel || parti.ddt)
                ? [mpInventarioOpt(codiceMpSel || parti.ddt, parti.targaFornitore || "INV")]
                : []
            ).map((l) => (
              <option key={l.lotto} value={l.lotto}>
                {l.lotto} · {l.materiaPrima} · {l.fornitoreLabel}
              </option>
            ))}
          </SelectMenu>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Se il carico è da inventario e non c&apos;è ingresso né
            lavorazione, genera un codice MP nuovo.
          </p>
          <button
            type="button"
            disabled={generaMpBusy}
            onClick={() => void generaCodiceMpInventario()}
            className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            {generaMpBusy
              ? "Generazione…"
              : "Genera codice MP inventario"}
          </button>
        </label>

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
            <SelectMenu
              loading={!listsReady}
              placeholder="Seleziona fornitore materia prima"
              value={parti.targaFornitore}
              onChange={(e) =>
                patch({ targaFornitore: stripTargaFornitore(e.target.value) })
              }
            >
              {!fornitori.some((f) => f.targaSenzaF === "INV") ? (
                <option value="INV">INV — Inventario / settaggio magazzino</option>
              ) : null}
              {parti.targaFornitore &&
              parti.targaFornitore !== "INV" &&
              !fornitori.some((f) => f.targaSenzaF === parti.targaFornitore) ? (
                <option value={parti.targaFornitore}>
                  {parti.targaFornitore} — (inserito)
                </option>
              ) : null}
              {fornitori.map((f) => (
                <option key={f.id} value={f.targaSenzaF}>
                  {f.targaSenzaF} — {f.ragioneSociale}
                </option>
              ))}
            </SelectMenu>
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
            <span className="mb-1 block font-medium">
              Codice MP lavorata (GGMMAA + 5 hex)
            </span>
            <input
              value={parti.ddt}
              onChange={(e) => {
                const next = e.target.value.replace(/\s+/g, "").toUpperCase();
                setCodiceMpSel(next);
                patch({ ddt: next });
              }}
              placeholder="12092600001"
              maxLength={11}
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
