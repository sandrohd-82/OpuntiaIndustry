"use client";

import { FaPlus, FaTrash } from "react-icons/fa6";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import {
  addChildToNode,
  childStadioFor,
  emptyNodo,
  filterVociForMagazzinoStadio,
  formatConfezionamentoRiepilogo,
  labelImballaggioVoce,
  labelStadioConfezionamento,
  removeNodoFromTree,
  totaleKgConfezionati,
  updateNodoInTree,
  type ConfezionamentoDraft,
  type ConfezionamentoNodoDraft,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";

type ProdottoMini = { id: string; codice: string; nome: string };

export function ConfezionamentoBlocchiEditor({
  conf,
  onChange,
  catalogo,
  prodotto,
  kgCarico,
  rimanda,
  onRimandaChange,
  showRimanda = true,
}: {
  conf: ConfezionamentoDraft;
  onChange: (next: ConfezionamentoDraft) => void;
  catalogo: ImballaggioVoce[];
  prodotto: ProdottoMini | null;
  kgCarico: number;
  rimanda: boolean;
  onRimandaChange: (v: boolean) => void;
  showRimanda?: boolean;
}) {
  const palletVoci = filterVociForMagazzinoStadio(catalogo, "movimentazione");
  const kgConf = totaleKgConfezionati(conf.nodi);
  const kgDelta = Math.round((kgCarico - kgConf) * 1000) / 1000;

  function applyCatalogToNodo(
    localId: string,
    voceId: string,
    stadio: ConfezionamentoNodoDraft["stadio"]
  ) {
    const voce = catalogo.find((v) => v.id === voceId);
    if (!voce) {
      onChange({
        ...conf,
        nodi: updateNodoInTree(conf.nodi, localId, {
          catalogoId: null,
          nome: "",
          codice: "",
        }),
      });
      return;
    }
    onChange({
      ...conf,
      nodi: updateNodoInTree(conf.nodi, localId, {
        catalogoId: voce.id,
        nome: voce.nome,
        codice: voce.codice,
        stadio: stadio === "prodotto_kg" ? "prodotto_kg" : voce.stadio,
      }),
    });
  }

  function renderNodo(nodo: ConfezionamentoNodoDraft, depth: number) {
    const parentVoce = catalogo.find((v) => v.id === nodo.catalogoId) ?? null;
    const nextStadio = childStadioFor(
      nodo.stadio,
      conf.movimentazioneModo,
      parentVoce
    );
    const options =
      nodo.stadio === "prodotto_kg"
        ? []
        : filterVociForMagazzinoStadio(catalogo, nodo.stadio);
    return (
      <div
        key={nodo.localId}
        className="rounded-lg border border-[var(--border)] bg-white p-3"
        style={{ marginLeft: depth * 12 }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {labelStadioConfezionamento(nodo.stadio)}
          </span>
          {nodo.stadio !== "prodotto_kg" ? (
            <select
              disabled={rimanda}
              value={nodo.catalogoId ?? ""}
              onChange={(e) =>
                applyCatalogToNodo(nodo.localId, e.target.value, nodo.stadio)
              }
              className="min-w-[180px] flex-1 rounded border border-[var(--border)] px-2 py-1.5 text-sm disabled:opacity-60"
            >
              <option value="">Seleziona da catalogo…</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {labelImballaggioVoce(v)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-700">
              {prodotto ? `${prodotto.codice} — ${prodotto.nome}` : "Prodotto"}
            </span>
          )}
          <label className="text-xs">
            N
            <ClearableNumberInput
              min={0}
              value={nodo.quantita}
              onValueChange={(v) =>
                onChange({
                  ...conf,
                  nodi: updateNodoInTree(conf.nodi, nodo.localId, {
                    quantita: v,
                  }),
                })
              }
              className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          {nodo.stadio === "prodotto_kg" ? (
            <label className="text-xs">
              kg
              <ClearableNumberInput
                min={0}
                value={nodo.kgProdotto ?? ""}
                onValueChange={(v) =>
                  onChange({
                    ...conf,
                    nodi: updateNodoInTree(conf.nodi, nodo.localId, {
                      kgProdotto: v,
                      nome: prodotto?.nome ?? "Prodotto",
                      codice: prodotto?.codice ?? "",
                    }),
                  })
                }
                className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          {nextStadio && !rimanda ? (
            <button
              type="button"
              className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => {
                const child = emptyNodo(nextStadio);
                if (nextStadio === "prodotto_kg" && prodotto) {
                  child.nome = prodotto.nome;
                  child.codice = prodotto.codice;
                  child.kgProdotto = kgCarico > 0 ? kgCarico : 20;
                }
                onChange({
                  ...conf,
                  nodi: addChildToNode(conf.nodi, nodo.localId, child),
                });
              }}
            >
              + {nextStadio === "prodotto_kg" ? "kg prodotto" : nextStadio}
            </button>
          ) : null}
          {!rimanda ? (
            <button
              type="button"
              className="rounded p-1.5 text-red-600 hover:bg-red-50"
              aria-label="Rimuovi"
              onClick={() =>
                onChange({
                  ...conf,
                  nodi: removeNodoFromTree(conf.nodi, nodo.localId),
                })
              }
            >
              <FaTrash size={11} />
            </button>
          ) : null}
        </div>
        {nodo.stadio !== "prodotto_kg" && nodo.catalogoId ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            1 {nodo.nome} composto da:{" "}
            {nodo.children.length
              ? nodo.children
                  .map((c) => `N${c.quantita} ${c.nome || c.stadio}`)
                  .join(" + ")
              : "— (aggiungi livello successivo)"}
          </p>
        ) : null}
        <div className="mt-2 space-y-2">
          {nodo.children.map((c) => renderNodo(c, depth + 1))}
        </div>
      </div>
    );
  }

  const riepilogo = formatConfezionamentoRiepilogo(conf.nodi);

  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-slate-50/70 p-4">
      <legend className="px-1 text-sm font-medium">
        Confezionamento a blocchi
      </legend>
      <p className="text-xs text-[var(--muted)]">
        Esempio: 1 pallet da 10 sacchi, 2 pallet da 6 e 1 da 2. Oppure 1 pallet
        con 12 cartoni e isolamento a sacco. Obbligatorio per chiudere la
        scheda, rimandabile: la quantità si salva lo stesso.
      </p>

      <fieldset className="space-y-2 rounded-lg border border-[var(--border)] bg-white p-3">
        <legend className="px-1 text-sm font-medium">
          Tipo di movimentazione
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            disabled={rimanda}
            checked={conf.movimentazioneModo === "su_pallet"}
            onChange={() =>
              onChange({
                ...conf,
                movimentazioneModo: "su_pallet",
                nodi: [],
              })
            }
          />
          Su pallet
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            disabled={rimanda}
            checked={conf.movimentazioneModo === "nessun_pallet"}
            onChange={() =>
              onChange({
                ...conf,
                movimentazioneModo: "nessun_pallet",
                palletCatalogoId: null,
                nodi: [],
              })
            }
          />
          Nessun pallet
        </label>
        {conf.movimentazioneModo === "su_pallet" ? (
          <>
            <select
              disabled={rimanda}
              value={conf.palletCatalogoId ?? ""}
              onChange={(e) =>
                onChange({
                  ...conf,
                  palletCatalogoId: e.target.value || null,
                })
              }
              className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">Tipo pallet (catalogo)…</option>
              {palletVoci.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted)]">
                Misure personalizzate (opz.)
              </span>
              <input
                disabled={rimanda}
                value={conf.palletMisureCustom}
                onChange={(e) =>
                  onChange({
                    ...conf,
                    palletMisureCustom: e.target.value,
                  })
                }
                placeholder="es. 1100×900 mm"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
              />
            </label>
          </>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Blocchi</p>
        <button
          type="button"
          disabled={rimanda}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          onClick={() => {
            const rootStadio = childStadioFor(null, conf.movimentazioneModo)!;
            const n = emptyNodo(rootStadio);
            if (
              conf.movimentazioneModo === "su_pallet" &&
              conf.palletCatalogoId
            ) {
              const v = catalogo.find((x) => x.id === conf.palletCatalogoId);
              if (v) {
                n.catalogoId = v.id;
                n.nome = v.nome;
                n.codice = v.codice;
              }
            }
            onChange({ ...conf, nodi: [...conf.nodi, n] });
          }}
        >
          <FaPlus size={11} />
          Aggiungi blocco{" "}
          {conf.movimentazioneModo === "su_pallet" ? "pallet" : "confezione"}
        </button>
      </div>

      {conf.nodi.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nessun blocco. Aggiungi un pallet o una confezione e scendi ai
          livelli (cartone, sacco, kg).
        </p>
      ) : (
        <div className="space-y-2">
          {conf.nodi.map((n) => renderNodo(n, 0))}
        </div>
      )}

      {riepilogo ? (
        <p className="text-xs text-slate-700">
          <span className="font-medium">Riepilogo: </span>
          {riepilogo}
        </p>
      ) : null}

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-[var(--border)] bg-white text-slate-600"
        }`}
      >
        Kg carico {kgCarico.toLocaleString("it-IT")} · kg nei blocchi{" "}
        {kgConf.toLocaleString("it-IT")}
        {Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0
          ? ` · differenza ${kgDelta.toLocaleString("it-IT")} (non blocca il salvataggio)`
          : ""}
      </div>

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
