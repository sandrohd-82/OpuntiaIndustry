"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { listMateriePrimeAction } from "@/app/actions/materie-prime";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";

const MATERIA_PRIMA_PATH = "/app/amministrazione/schede/materia-prima?nuovo=1";

type Props = {
  value: string[];
  onChange: (codes: string[]) => void;
  /** Certificato bio della scheda fornitore (usato se si selezionano materie bio). */
  bioCertificato?: string;
  bioCodice?: string;
};

export function FornitoreDiTags({
  value,
  onChange,
  bioCertificato = "",
  bioCodice = "",
}: Props) {
  const [materie, setMaterie] = useState<MateriaPrima[]>([]);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  async function refresh() {
    const result = await listMateriePrimeAction();
    if (result.success) setMaterie(result.materie);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    void refresh();
  }, [pickerOpen]);

  const selected = useMemo(() => {
    const byCode = new Map(materie.map((m) => [m.codice, m]));
    return value.map((code) => {
      const m = byCode.get(code);
      return {
        code,
        nome: m?.nome,
        isBio: Boolean(m?.isBio),
      };
    });
  }, [value, materie]);

  const hasBioSelected = selected.some((item) => item.isBio);
  const certLoaded = Boolean(bioCertificato.trim() || bioCodice.trim());

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materie.filter((m) => {
      if (value.includes(m.codice)) return false;
      if (!q) return true;
      return (
        m.codice.toLowerCase().includes(q) || m.nome.toLowerCase().includes(q)
      );
    });
  }, [materie, value, query]);

  function addCode(code: string) {
    if (value.includes(code)) return;
    onChange([...value, code]);
    setPickerOpen(false);
    setQuery("");
  }

  function removeCode(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">Fornitore di</legend>
      <p className="text-xs text-[var(--muted)]">
        Seleziona i codici interni delle materie prime. Per le materie bio viene
        usato il certificato caricato in questa scheda.
      </p>

      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2 py-2">
        {selected.length === 0 ? (
          <span className="px-1 text-sm text-[var(--muted)]">Nessun codice</span>
        ) : (
          selected.map((item) => (
            <span
              key={item.code}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide ring-1 ring-[var(--border)]"
              title={item.nome || item.code}
            >
              {item.code}
              {item.isBio && (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  Bio
                </span>
              )}
              <button
                type="button"
                aria-label={`Rimuovi ${item.code}`}
                onClick={() => removeCode(item.code)}
                className="text-[var(--muted)] hover:text-slate-900"
              >
                <FaXmark size={11} />
              </button>
            </span>
          ))
        )}
      </div>

      {hasBioSelected && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs">
          {certLoaded ? (
            <div className="space-y-1">
              <p className="font-medium text-emerald-900">
                Certificato bio applicato alle materie selezionate
              </p>
              {bioCertificato.trim() && (
                <p className="text-emerald-900/90">
                  Certificato: {bioCertificato.trim()}
                </p>
              )}
              {bioCodice.trim() && (
                <p className="text-emerald-900/90">
                  Codice bio: {bioCodice.trim()}
                </p>
              )}
            </div>
          ) : (
            <p className="text-amber-800">
              Hai selezionato materie bio: carica certificato e codice bio in
              questa scheda per associarli.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <FaPlus size={12} />
          Aggiungi
        </button>
        <Link
          href={MATERIA_PRIMA_PATH}
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-[var(--primary)] hover:underline"
        >
          Nuova materia prima
        </Link>
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={() => setPickerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Seleziona materia prima"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Seleziona da elenco</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Scegli un codice esistente oppure crea una nuova materia prima.
            </p>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtra per codice o nome…"
              autoFocus
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />

            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)]">
              {!ready ? (
                <p className="px-3 py-3 text-sm text-[var(--muted)]">
                  Caricamento…
                </p>
              ) : available.length === 0 ? (
                <div className="space-y-2 px-3 py-3 text-sm">
                  <p className="text-[var(--muted)]">
                    Nessuna materia prima disponibile con questo filtro.
                  </p>
                  <Link
                    href={MATERIA_PRIMA_PATH}
                    className="inline-flex font-medium text-[var(--primary)] hover:underline"
                  >
                    Vai a Materia prima e aggiungine una
                  </Link>
                </div>
              ) : (
                <ul>
                  {available.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => addCode(m.codice)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide">
                          {m.codice}
                          {m.isBio && (
                            <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Bio
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[var(--muted)]">
                          {m.nome}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50"
              >
                Chiudi
              </button>
              <Link
                href={MATERIA_PRIMA_PATH}
                className="flex flex-1 items-center justify-center rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Nuova materia prima
              </Link>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
