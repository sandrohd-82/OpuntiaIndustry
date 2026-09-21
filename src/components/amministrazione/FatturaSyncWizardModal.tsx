"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaSpinner } from "react-icons/fa6";
import {
  countFattureSyncPeriodoAction,
  finalizeFattureSyncRunAction,
  prepareFattureSyncPrecisaAction,
  previewFattureSyncAction,
  runFattureSyncVeloceAction,
  type FattureSyncPreview,
} from "@/app/actions/fatture-sync-keep";
import { FatturaSyncQueueModal } from "@/components/amministrazione/FatturaSyncQueueModal";
import {
  filterFromStopMonth,
  labelMeseIt,
  raggruppaFatturePerAzienda,
  splitForwardRetro,
  type FattureSyncAnagraficaCreata,
  type FattureSyncFatturaRegistrata,
  type FattureSyncKeepKind,
  type FattureSyncPendingMeta,
} from "@/lib/amministrazione/fatture-sync-keep";
import { formatEuro } from "@/lib/amministrazione/fatture";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";

type Step =
  | "load"
  | "mesi"
  | "forward"
  | "avviso"
  | "precisa"
  | "veloce"
  | "resoconto";

type Props = {
  kind: FattureSyncKeepKind;
  onClose: () => void;
  onDone: () => void;
};

function LoadLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <FaSpinner className="shrink-0 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

export function FatturaSyncWizardModal({ kind, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>("load");
  const [loadMsg, setLoadMsg] = useState("Cerco le fatture su Fatture in Cloud…");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FattureSyncPreview | null>(null);
  const [stopMonth, setStopMonth] = useState<string | null>(null);
  const [periodCount, setPeriodCount] = useState<number | null>(null);
  const [forwardIds, setForwardIds] = useState<number[]>([]);
  const [retroIds, setRetroIds] = useState<number[]>([]);
  const [precisaItems, setPrecisaItems] = useState<FatturaSyncQueueItem[] | null>(
    null
  );
  const [registered, setRegistered] = useState(0);
  const [anagrafiche, setAnagrafiche] = useState<FattureSyncAnagraficaCreata[]>(
    []
  );
  const [fattureRegistrate, setFattureRegistrate] = useState<
    FattureSyncFatturaRegistrata[]
  >([]);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);

  const entityLabel = kind === "ricevuta" ? "fornitori" : "clienti";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadMsg("Cerco le fatture su Fatture in Cloud…");
      const res = await previewFattureSyncAction(kind);
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setStep("mesi");
        return;
      }
      setPreview(res.preview);
      setStopMonth(res.preview.defaultStopMonth);
      setStep("mesi");
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const inPeriod: FattureSyncPendingMeta[] = useMemo(() => {
    if (!preview || !stopMonth) return [];
    return filterFromStopMonth(preview.pending, stopMonth, preview.today);
  }, [preview, stopMonth]);

  useEffect(() => {
    if (!preview || !stopMonth) {
      setPeriodCount(null);
      return;
    }
    const { forward, retro } = splitForwardRetro(
      inPeriod,
      preview.lastRegisteredDate,
      preview.today
    );
    setPeriodCount(inPeriod.length);
    setForwardIds(forward.map((d) => d.ficId));
    setRetroIds(retro.map((d) => d.ficId));
  }, [preview, stopMonth, inPeriod]);

  async function refreshCount(month: string) {
    setLoadMsg("Conto le fatture del periodo…");
    const res = await countFattureSyncPeriodoAction({ kind, stopMonth: month });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPeriodCount(res.count);
    setError(null);
  }

  function mergeAnag(list: FattureSyncAnagraficaCreata[]) {
    setAnagrafiche((prev) => {
      const seen = new Set(prev.map((a) => `${a.tipo}:${a.codiceTarga}`));
      const next = [...prev];
      for (const a of list) {
        const k = `${a.tipo}:${a.codiceTarga}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(a);
      }
      return next;
    });
  }

  const gruppiAzienda = useMemo(
    () => raggruppaFatturePerAzienda(fattureRegistrate, anagrafiche),
    [fattureRegistrate, anagrafiche]
  );

  async function procedi() {
    if (!stopMonth || !preview) return;
    setError(null);
    const { forward, retro } = splitForwardRetro(
      inPeriod,
      preview.lastRegisteredDate,
      preview.today
    );
    setForwardIds(forward.map((d) => d.ficId));
    setRetroIds(retro.map((d) => d.ficId));

    let tot = registered;
    let anags = [...anagrafiche];
    let fatture = [...fattureRegistrate];

    if (forward.length > 0) {
      setStep("forward");
      setLoadMsg(
        `Registro ${forward.length} fatture dall’ultima registrata a oggi…`
      );
      const res = await runFattureSyncVeloceAction({
        kind,
        ficIds: forward.map((d) => d.ficId),
        stopMonth,
        fase: "prospettiva",
      });
      if (!res.success) {
        setError(res.error);
        setStep("mesi");
        return;
      }
      tot += res.registered;
      anags = [...anags, ...res.anagraficheCreate];
      fatture = [...fatture, ...res.fattureRegistrate];
      setRegistered(tot);
      setAnagrafiche(anags);
      setFattureRegistrate(fatture);
      if (res.skipped.length) {
        setSkippedNote(
          `${res.skipped.length} documenti non registrati nel tratto fino a oggi.`
        );
      }
    }

    if (retro.length === 0) {
      await finalizeFattureSyncRunAction({
        kind,
        modalita: "veloce",
        fase: "prospettiva",
        stopMonth,
        fattureCount: tot,
        anagraficheCreate: anags,
        fattureRegistrate: fatture,
      });
      setStep("resoconto");
      return;
    }

    setStep("avviso");
  }

  async function avviaRetro(mode: "precisa" | "veloce") {
    setError(null);
    if (mode === "veloce") {
      setStep("veloce");
      setLoadMsg(`Registro a ritroso ${retroIds.length} fatture (modalità veloce)…`);
      const res = await runFattureSyncVeloceAction({
        kind,
        ficIds: retroIds,
        stopMonth,
        fase: "retroso",
      });
      if (!res.success) {
        setError(res.error);
        setStep("avviso");
        return;
      }
      const tot = registered + res.registered;
      const anags = [...anagrafiche, ...res.anagraficheCreate];
      const fatture = [...fattureRegistrate, ...res.fattureRegistrate];
      setRegistered(tot);
      setAnagrafiche(anags);
      setFattureRegistrate(fatture);
      if (res.skipped.length) {
        setSkippedNote((prev) =>
          [prev, `${res.skipped.length} documenti saltati a ritroso.`]
            .filter(Boolean)
            .join(" ")
        );
      }
      await finalizeFattureSyncRunAction({
        kind,
        modalita: "veloce",
        fase: retroIds.length && forwardIds.length ? "mista" : "retroso",
        stopMonth,
        fattureCount: tot,
        anagraficheCreate: anags,
        fattureRegistrate: fatture,
      });
      setStep("resoconto");
      return;
    }

    setStep("veloce");
    setLoadMsg("Preparo la coda precisa e registro le anagrafiche…");
    const res = await prepareFattureSyncPrecisaAction({
      kind,
      ficIds: retroIds,
    });
    if (!res.success) {
      setError(res.error);
      setStep("avviso");
      return;
    }
    mergeAnag(res.anagraficheCreate);
    if (res.items.length === 0) {
      await finalizeFattureSyncRunAction({
        kind,
        modalita: "precisa",
        fase: "retroso",
        stopMonth,
        fattureCount: registered,
        anagraficheCreate: [...anagrafiche, ...res.anagraficheCreate],
        fattureRegistrate,
      });
      setStep("resoconto");
      return;
    }
    setPrecisaItems(res.items);
    setStep("precisa");
  }

  const years = useMemo(() => {
    if (!preview) return [] as Array<[number, NonNullable<typeof preview>["months"]]>;
    const map = new Map<number, NonNullable<typeof preview>["months"]>();
    for (const m of preview.months) {
      const list = map.get(m.year) ?? [];
      list.push(m);
      map.set(m.year, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [preview]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal
      aria-label="Sincronizza fatture"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-base font-semibold">
            Sincronizza{" "}
            {kind === "ricevuta" ? "fatture ricevute" : "fatture emesse"}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Prima il tratto fino a oggi, poi a ritroso fino al mese scelto.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {step === "load" || (step === "mesi" && !preview && !error) ? (
            <LoadLine text={loadMsg} />
          ) : null}

          {step === "mesi" && preview ? (
            <>
              <p className="text-sm text-slate-700">
                Seleziona il <strong>mese di arresto</strong> a ritroso. I mesi
                senza fatture da sincronizzare restano spenti.
              </p>
              {preview.lastRegisteredDate ? (
                <p className="text-xs text-[var(--muted)]">
                  Ultima fattura già in gestionale:{" "}
                  <strong>{preview.lastRegisteredDate}</strong>
                </p>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  Nessuna fattura già registrata: si parte a ritroso dalla data
                  odierna.
                </p>
              )}

              {years.length === 0 ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Nessuna fattura da sincronizzare.
                </p>
              ) : (
                years.map(([year, months]) => (
                  <div key={year}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {year}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {months.map((m) => {
                        const selected = stopMonth === m.key;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            disabled={!m.enabled}
                            onClick={() => {
                              setStopMonth(m.key);
                              void refreshCount(m.key);
                            }}
                            className={`rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected
                                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                                : "border-[var(--border)] bg-white hover:bg-slate-50"
                            }`}
                          >
                            <span className="block font-medium">{m.label}</span>
                            <span className="text-xs text-[var(--muted)]">
                              {m.enabled
                                ? `${m.pendingCount} da sincronizzare`
                                : "nessuna da sincronizzare"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {stopMonth && periodCount != null ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Trovate <strong>{periodCount}</strong> fatture da{" "}
                  <strong>{labelMeseIt(stopMonth)}</strong> a oggi
                  {forwardIds.length
                    ? ` · ${forwardIds.length} nel tratto fino a oggi`
                    : ""}
                  {retroIds.length
                    ? ` · ${retroIds.length} a ritroso`
                    : ""}
                  .
                </p>
              ) : null}
            </>
          ) : null}

          {step === "forward" || step === "veloce" ? (
            <LoadLine text={loadMsg} />
          ) : null}

          {step === "avviso" ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                {forwardIds.length > 0
                  ? "Il tratto dall’ultima fattura registrata a oggi è stato elaborato. Ora inizia la sincronizzazione a ritroso."
                  : "Non ci sono fatture nel tratto fino a oggi. Il sistema sta per registrare quelle a ritroso."}
              </p>
              <p className="text-sm text-slate-700">
                Come vuoi registrare le <strong>{retroIds.length}</strong> fatture
                a ritroso fino a {stopMonth ? labelMeseIt(stopMonth) : "—"}?
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>
                  <strong>Precisa</strong>: come oggi, con collegamento prodotti
                  e catalogo magazzino.
                </li>
                <li>
                  <strong>Veloce</strong>: senza prodotti in elenco magazzino;
                  il totale viene allineato all’XML di Fatture in Cloud.
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void avviaRetro("precisa")}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
                >
                  Precisa
                </button>
                <button
                  type="button"
                  onClick={() => void avviaRetro("veloce")}
                  className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium"
                >
                  Veloce
                </button>
              </div>
            </div>
          ) : null}

          {step === "resoconto" ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Sincronizzazione completata: <strong>{registered}</strong> fatture
                registrate.
              </p>
              {skippedNote ? (
                <p className="text-sm text-amber-900">{skippedNote}</p>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-medium">Fatture registrate</p>
                {fattureRegistrate.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nessuna fattura in elenco (registrazione precisa o nessun
                    documento salvato).
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2">N. fattura</th>
                          <th className="px-3 py-2">Ragione sociale</th>
                          <th className="px-3 py-2 text-right">Importo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fattureRegistrate.map((f, i) => (
                          <tr
                            key={`${f.numero}-${f.partitaIva}-${i}`}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {f.numero || "—"}
                            </td>
                            <td className="px-3 py-2">{f.ragioneSociale || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatEuro(f.importo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  {entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)}{" "}
                  registrati
                </p>
                {gruppiAzienda.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nessuna anagrafica in questa sessione.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {gruppiAzienda.map((g) => (
                      <div
                        key={`${g.partitaIva}-${g.ragioneSociale}`}
                        className="overflow-hidden rounded-lg border border-[var(--border)]"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-slate-50 px-3 py-2">
                          <p className="text-sm font-medium text-slate-900">
                            {g.ragioneSociale || "—"}
                            {g.nuova ? (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                                Nuova
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-xs text-slate-600">
                            P. IVA {g.partitaIva || "—"}
                          </p>
                        </div>
                        {g.fatture.length ? (
                          <table className="min-w-full text-left text-sm">
                            <thead className="text-xs uppercase text-[var(--muted)]">
                              <tr>
                                <th className="px-3 py-1.5">N. fattura</th>
                                <th className="px-3 py-1.5 text-right">Importo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.fatture.map((f, i) => (
                                <tr
                                  key={`${f.numero}-${i}`}
                                  className="border-t border-[var(--border)]"
                                >
                                  <td className="px-3 py-1.5 font-mono text-xs">
                                    {f.numero || "—"}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {formatEuro(f.importo)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="px-3 py-2 text-xs text-[var(--muted)]">
                            Nessuna fattura collegata in questo elenco.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          {step === "mesi" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={!stopMonth || !periodCount}
                onClick={() => void procedi()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Procedi
              </button>
            </>
          ) : null}
          {step === "resoconto" ? (
            <button
              type="button"
              onClick={onDone}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
            >
              Chiudi
            </button>
          ) : null}
          {step === "avviso" ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Annulla
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(dialog, document.body)}
      {step === "precisa" && precisaItems && precisaItems.length > 0 ? (
        <FatturaSyncQueueModal
          items={precisaItems}
          onFinished={(n) => {
            void (async () => {
              setRegistered((x) => x + n);
              await finalizeFattureSyncRunAction({
                kind,
                modalita: "precisa",
                fase: forwardIds.length ? "mista" : "retroso",
                stopMonth,
                fattureCount: registered + n,
                anagraficheCreate: anagrafiche,
                fattureRegistrate,
              });
              setPrecisaItems(null);
              setStep("resoconto");
            })();
          }}
          onPaused={() => {
            void (async () => {
              await finalizeFattureSyncRunAction({
                kind,
                modalita: "precisa",
                fase: "retroso",
                stopMonth,
                fattureCount: registered,
                anagraficheCreate: anagrafiche,
                fattureRegistrate,
              });
              setPrecisaItems(null);
              setStep("resoconto");
            })();
          }}
        />
      ) : null}
    </>
  );
}
