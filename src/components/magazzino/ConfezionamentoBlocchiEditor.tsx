"use client";

import { useEffect } from "react";
import { FaLink, FaPlus, FaTrash } from "react-icons/fa6";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import {
  draftFromBlocchi,
  emptyBlocco,
  emptyBloccoVoce,
  filterVociForMagazzinoStadio,
  formatBloccoRiepilogo,
  labelImballaggioVoce,
  nodiToBlocchi,
  type ConfezionamentoBlocco,
  type ConfezionamentoBloccoVoce,
  type ConfezionamentoDraft,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  pesiAllineatiAQty,
  qtyElementiPianta,
} from "@/lib/magazzino/occupazione-da-carico";

type ProdottoMini = { id: string; codice: string; nome: string };

function applyVoceCatalogo(
  voce: ConfezionamentoBloccoVoce,
  catalogo: ImballaggioVoce[],
  voceId: string
): ConfezionamentoBloccoVoce {
  const found = catalogo.find((v) => v.id === voceId);
  if (!found) {
    return { ...voce, catalogoId: null, nome: "", codice: "" };
  }
  return {
    ...voce,
    catalogoId: found.id,
    nome: found.nome,
    codice: found.codice,
  };
}

function RigaVoce({
  label,
  voce,
  opzioni,
  rimanda,
  hideQty,
  onChange,
  onRemove,
}: {
  label: string;
  voce: ConfezionamentoBloccoVoce;
  opzioni: ImballaggioVoce[];
  rimanda: boolean;
  hideQty?: boolean;
  onChange: (next: ConfezionamentoBloccoVoce) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[200px] flex-1 text-xs">
        {label}
        <select
          disabled={rimanda}
          value={voce.catalogoId ?? ""}
          onChange={(e) =>
            onChange(applyVoceCatalogo(voce, opzioni, e.target.value))
          }
          className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="">Seleziona da catalogo…</option>
          {opzioni.map((v) => (
            <option key={v.id} value={v.id}>
              {labelImballaggioVoce(v)}
            </option>
          ))}
        </select>
      </label>
      {hideQty ? null : (
        <label className="text-xs">
          N. elementi
          <ClearableNumberInput
            min={0}
            value={voce.quantita}
            onValueChange={(v) => onChange({ ...voce, quantita: v })}
            className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
      )}
      {!rimanda ? (
        <button
          type="button"
          className="rounded p-1.5 text-red-600 hover:bg-red-50"
          aria-label={`Rimuovi ${label}`}
          onClick={onRemove}
        >
          <FaTrash size={11} />
        </button>
      ) : null}
    </div>
  );
}

export function ConfezionamentoBlocchiEditor({
  conf,
  onChange,
  catalogo,
  prodotto: _prodotto,
  kgCarico,
  rimanda,
  onRimandaChange,
  showRimanda = true,
  alignPianta = false,
}: {
  conf: ConfezionamentoDraft;
  onChange: (next: ConfezionamentoDraft) => void;
  catalogo: ImballaggioVoce[];
  prodotto: ProdottoMini | null;
  kgCarico: number;
  rimanda: boolean;
  onRimandaChange: (v: boolean) => void;
  showRimanda?: boolean;
  /** Stessi campi della pianta: movimentazione, elementi, pesi. */
  alignPianta?: boolean;
}) {
  const blocchi = nodiToBlocchi(conf.nodi);
  const qtyPianta = qtyElementiPianta(conf);
  const pesoModo = conf.pesoModo === "complessivo" ? "complessivo" : "per_elemento";
  const pesi = conf.pesiElementiKg ?? [];

  useEffect(() => {
    if (!alignPianta || rimanda) return;
    const next = pesiAllineatiAQty(qtyPianta, conf.pesiElementiKg, kgCarico);
    const same =
      next.length === (conf.pesiElementiKg?.length ?? 0) &&
      next.every((v, i) => v === (conf.pesiElementiKg ?? [])[i]);
    if (same && conf.pesoModo) return;
    onChange({
      ...conf,
      pesoModo: conf.pesoModo ?? "per_elemento",
      pesiElementiKg: next,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignPianta, rimanda, qtyPianta, kgCarico]);
  const movVoci = filterVociForMagazzinoStadio(catalogo, "movimentazione");
  const confVoci = filterVociForMagazzinoStadio(catalogo, "confezione");
  const isoVoci = filterVociForMagazzinoStadio(catalogo, "isolamento");

  function commit(next: ConfezionamentoBlocco[]) {
    onChange(draftFromBlocchi(conf, next));
  }

  function patchBlocco(
    id: string,
    patch: Partial<ConfezionamentoBlocco>
  ) {
    commit(blocchi.map((b) => (b.localId === id ? { ...b, ...patch } : b)));
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-slate-50/70 p-4">
      <legend className="px-1 text-sm font-medium">
        Confezionamento a blocchi
      </legend>
      <p className="text-xs text-[var(--muted)]">
        {alignPianta
          ? "Stessi dati della pianta: un blocco con movimentazione (es. pallet), confezione o isolamento, quantità e pesi. Il posto scelto risulterà occupato."
          : "Ogni blocco è autonomo. Aggiungi movimentazione (una sola, es. pallet), confezione e isolamento con le quantità. «Collega» = le confezioni hanno l’isolamento dentro (es. 4 cartoni × 4 sacchi = 4 colli). Senza collega restano elementi separati sullo stesso blocco."}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Blocchi</p>
        <button
          type="button"
          disabled={rimanda}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          onClick={() => commit([...blocchi, emptyBlocco()])}
        >
          <FaPlus size={11} />
          Aggiungi blocco
        </button>
      </div>

      {blocchi.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nessun blocco. Aggiungine uno e poi movimentazione, confezione o
          isolamento.
        </p>
      ) : (
        <div className="space-y-3">
          {blocchi.map((b, i) => {
            const puoCollegare = Boolean(b.confezionamento && b.isolamento);
            return (
              <div
                key={b.localId}
                className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Blocco {i + 1}</p>
                  {!rimanda ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      onClick={() =>
                        commit(blocchi.filter((x) => x.localId !== b.localId))
                      }
                    >
                      <FaTrash size={11} />
                      Rimuovi blocco
                    </button>
                  ) : null}
                </div>

                {b.movimentazione ? (
                  <RigaVoce
                    label="Movimentazione (una per blocco)"
                    voce={b.movimentazione}
                    opzioni={movVoci}
                    rimanda={rimanda}
                    hideQty
                    onChange={(v) =>
                      patchBlocco(b.localId, { movimentazione: v })
                    }
                    onRemove={() =>
                      patchBlocco(b.localId, { movimentazione: null })
                    }
                  />
                ) : (
                  <button
                    type="button"
                    disabled={rimanda}
                    className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() =>
                      patchBlocco(b.localId, {
                        movimentazione: emptyBloccoVoce(),
                      })
                    }
                  >
                    <FaPlus size={10} className="mr-1 inline" />
                    Aggiungi movimentazione
                  </button>
                )}

                {b.confezionamento ? (
                  <RigaVoce
                    label="Confezionamento"
                    voce={b.confezionamento}
                    opzioni={confVoci}
                    rimanda={rimanda}
                    onChange={(v) => {
                      const iso =
                        b.collegato && b.isolamento
                          ? { ...b.isolamento, quantita: v.quantita }
                          : b.isolamento;
                      patchBlocco(b.localId, {
                        confezionamento: v,
                        isolamento: iso,
                      });
                    }}
                    onRemove={() =>
                      patchBlocco(b.localId, {
                        confezionamento: null,
                        collegato: false,
                      })
                    }
                  />
                ) : (
                  <button
                    type="button"
                    disabled={rimanda}
                    className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() =>
                      patchBlocco(b.localId, {
                        confezionamento: emptyBloccoVoce(),
                      })
                    }
                  >
                    <FaPlus size={10} className="mr-1 inline" />
                    Aggiungi confezionamento
                  </button>
                )}

                {b.isolamento ? (
                  <RigaVoce
                    label="Isolamento"
                    voce={b.isolamento}
                    opzioni={isoVoci}
                    rimanda={rimanda}
                    hideQty={b.collegato}
                    onChange={(v) =>
                      patchBlocco(b.localId, { isolamento: v })
                    }
                    onRemove={() =>
                      patchBlocco(b.localId, {
                        isolamento: null,
                        collegato: false,
                      })
                    }
                  />
                ) : (
                  <button
                    type="button"
                    disabled={rimanda}
                    className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() =>
                      patchBlocco(b.localId, {
                        isolamento: emptyBloccoVoce(),
                      })
                    }
                  >
                    <FaPlus size={10} className="mr-1 inline" />
                    Aggiungi isolamento
                  </button>
                )}

                {puoCollegare ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={rimanda}
                      onClick={() => {
                        const next = !b.collegato;
                        const iso =
                          next && b.isolamento && b.confezionamento
                            ? {
                                ...b.isolamento,
                                quantita: b.confezionamento.quantita,
                              }
                            : b.isolamento;
                        patchBlocco(b.localId, {
                          collegato: next,
                          isolamento: iso,
                        });
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                        b.collegato
                          ? "border-teal-600 bg-teal-50 text-teal-900"
                          : "border-[var(--border)] bg-white hover:bg-slate-50"
                      }`}
                    >
                      <FaLink size={11} />
                      {b.collegato ? "Collegati" : "Collega"}
                    </button>
                    <p className="text-xs text-[var(--muted)]">
                      {b.collegato
                        ? `${typeof b.confezionamento?.quantita === "number" ? b.confezionamento.quantita : 0} confezioni con l’isolamento dentro.`
                        : "Separati: confezioni e isolamenti sullo stesso blocco, non uno dentro l’altro."}
                    </p>
                  </div>
                ) : null}

                <p className="text-xs text-slate-600">
                  {formatBloccoRiepilogo(b, i + 1)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {blocchi.length > 0 ? (
        <p className="text-xs text-slate-700">
          <span className="font-medium">Riepilogo: </span>
          {blocchi.map((b, i) => formatBloccoRiepilogo(b, i + 1)).join(" · ")}
        </p>
      ) : null}

      {alignPianta && !rimanda ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-sm font-medium text-emerald-950">
            Peso in pianta (come occupazione posto)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...conf, pesoModo: "per_elemento" })}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                pesoModo === "per_elemento"
                  ? "border-emerald-900 bg-emerald-800 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              Peso per elemento
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...conf, pesoModo: "complessivo" })}
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                pesoModo === "complessivo"
                  ? "border-emerald-900 bg-emerald-800 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              Peso complessivo movimentazione
            </button>
          </div>
          {pesoModo === "per_elemento" ? (
            qtyPianta < 1 ? (
              <p className="text-xs text-amber-900">
                Aggiungi movimentazione e il numero di confezioni o isolamenti:
                compariranno i pesi elemento.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: qtyPianta }, (_, i) => (
                  <label key={i} className="text-xs">
                    Peso elemento {i + 1} (kg)
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={pesi[i] ?? ""}
                      onChange={(e) => {
                        const next = [...pesi];
                        while (next.length < qtyPianta) next.push("");
                        next[i] =
                          e.target.value === "" ? "" : Number(e.target.value);
                        onChange({ ...conf, pesiElementiKg: next });
                      }}
                      className="mt-0.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Peso complessivo (kg)
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  value={conf.pesoComplessivoKg ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...conf,
                      pesoComplessivoKg:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                Motivazione (obbligatoria)
                <input
                  value={conf.pesoMotivazione ?? ""}
                  onChange={(e) =>
                    onChange({ ...conf, pesoMotivazione: e.target.value })
                  }
                  className="mt-0.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                />
              </label>
            </div>
          )}
        </div>
      ) : null}

      {showRimanda ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={rimanda}
            onChange={(e) => onRimandaChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>Completa in un secondo momento (non blocca il carico)</span>
        </label>
      ) : null}
    </fieldset>
  );
}
