"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { listImballaggiVociAction } from "@/app/actions/imballaggi-spedizioni";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  createListinoAction,
  listListiniAction,
  listListinoRigheAction,
  setListinoStatoAction,
  softDeleteListinoRigaAction,
  softDeleteListinoRigaCondizioneAction,
  upsertListinoRigaAction,
  upsertListinoRigaCondizioneAction,
} from "@/app/actions/listini";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import {
  imballaggiPerCondizioneListino,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  LISTINO_RIGA_UM,
  type Listino,
  type ListinoRiga,
  type ListinoRigaCondizione,
  type ListinoRigaUm,
} from "@/lib/ecosystem/listini";
import type { ListinoStato } from "@/types/database";

const STATO_LABEL: Record<ListinoStato, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  pubblicato: "Pubblicato",
  chiuso: "Chiuso",
};

type DeleteTarget =
  | { kind: "riga"; riga: ListinoRiga }
  | { kind: "condizione"; riga: ListinoRiga; condizione: ListinoRigaCondizione };

type CondDraft = {
  qtyDa: string;
  qtyA: string;
  imballaggioVoceId: string;
  scontoPct: string;
};

const emptyCond: CondDraft = {
  qtyDa: "0",
  qtyA: "",
  imballaggioVoceId: "",
  scontoPct: "0",
};

export function ListiniB2bBoard() {
  const [items, setItems] = useState<Listino[]>([]);
  const [righe, setRighe] = useState<ListinoRiga[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prodotti, setProdotti] = useState<
    Array<{ id: string; codice: string; nome: string }>
  >([]);
  const [imballaggi, setImballaggi] = useState<ImballaggioVoce[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [codice, setCodice] = useState("B2B-");
  const [nome, setNome] = useState("");
  const [validoDal, setValidoDal] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [prodottoId, setProdottoId] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [unitaMisura, setUnitaMisura] = useState<ListinoRigaUm>("kg");
  const [drafts, setDrafts] = useState<Record<string, CondDraft>>({});
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const confezioni = useMemo(
    () => imballaggiPerCondizioneListino(imballaggi),
    [imballaggi]
  );

  function reloadListini() {
    startTransition(async () => {
      const res = await listListiniAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  async function reloadRighe(listinoId: string) {
    const res = await listListinoRigheAction(listinoId);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setRighe(res.items);
  }

  useEffect(() => {
    reloadListini();
    void listProdottiPropriAction().then((r) => {
      if (r.success) {
        setProdotti(
          r.prodotti.map((p) => ({ id: p.id, codice: p.codice, nome: p.nome }))
        );
      }
    });
    void listImballaggiVociAction().then((r) => {
      if (r.success) setImballaggi(r.items);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRighe([]);
      return;
    }
    startTransition(async () => {
      await reloadRighe(selectedId);
    });
  }, [selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const prodottiInListino = new Set(righe.map((r) => r.prodottoId));

  function condDraft(rigaId: string): CondDraft {
    return drafts[rigaId] ?? emptyCond;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold">Nuovo listino B2B</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Bozza v1. Poi aggiungi le righe: prodotto, prezzo €/kg o €/lt,
              condizioni di sconto per quantità e confezione.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Codice"
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
              />
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <input
                type="date"
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={validoDal}
                onChange={(e) => setValidoDal(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={pending}
              className="mt-3 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                startTransition(async () => {
                  const res = await createListinoAction({
                    codice,
                    nome,
                    validoDal,
                  });
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setNome("");
                  reloadListini();
                  setSelectedId(res.item.id);
                })
              }
            >
              Crea bozza
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Codice</th>
                  <th className="px-3 py-2">Stato</th>
                  <th className="px-3 py-2">Validità</th>
                  <th className="px-3 py-2">v</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-t border-[var(--border)] ${
                      selectedId === item.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td className="px-3 py-2 font-medium">{item.codice}</td>
                    <td className="px-3 py-2">{STATO_LABEL[item.stato]}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.validoDal}
                      {item.validoAl ? ` → ${item.validoAl}` : ""}
                    </td>
                    <td className="px-3 py-2">{item.versione}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un listino. Le righe si compilano come un foglio:
              prodotto, prezzo, poi sconti per quantità e confezione.
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold">{selected.nome}</h2>
              <p className="text-xs text-[var(--muted)]">
                {selected.codice} · {STATO_LABEL[selected.stato]} · v
                {selected.versione}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["approvato", "pubblicato", "chiuso"] as ListinoStato[]).map(
                  (stato) => (
                    <button
                      key={stato}
                      type="button"
                      disabled={pending}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await setListinoStatoAction({
                            id: selected.id,
                            stato,
                          });
                          if (!res.success) setError(res.error);
                          else reloadListini();
                        })
                      }
                    >
                      → {STATO_LABEL[stato]}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Prodotto</th>
                  <th className="px-3 py-2">Prezzo</th>
                  <th className="px-3 py-2">UM</th>
                  <th className="px-3 py-2">Qty da</th>
                  <th className="px-3 py-2">Qty a</th>
                  <th className="px-3 py-2">Confezionamento</th>
                  <th className="px-3 py-2">Sconto %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <RigaBlock
                    key={r.id}
                    riga={r}
                    pending={pending}
                    confezioni={confezioni}
                    draft={condDraft(r.id)}
                    onDraftChange={(next) =>
                      setDrafts((prev) => ({ ...prev, [r.id]: next }))
                    }
                    onSaved={() => {
                      if (selectedId) void reloadRighe(selectedId);
                    }}
                    onError={setError}
                    onDeleteRiga={() => setDeleting({ kind: "riga", riga: r })}
                    onDeleteCond={(c) =>
                      setDeleting({ kind: "condizione", riga: r, condizione: c })
                    }
                    startTransition={startTransition}
                  />
                ))}
                <tr className="border-t border-[var(--border)] bg-slate-50/80">
                  <td className="px-3 py-2">
                    <select
                      className="w-full min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                      value={prodottoId}
                      onChange={(e) => setProdottoId(e.target.value)}
                    >
                      <option value="">Prodotto da prezzare…</option>
                      {prodotti
                        .filter((p) => !prodottiInListino.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codice} — {p.nome}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-24 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={prezzo}
                      onChange={(e) => setPrezzo(e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                      value={unitaMisura}
                      onChange={(e) =>
                        setUnitaMisura(e.target.value as ListinoRigaUm)
                      }
                    >
                      {LISTINO_RIGA_UM.map((u) => (
                        <option key={u} value={u}>
                          €/{u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td colSpan={4} className="px-3 py-2 text-xs text-[var(--muted)]">
                    Dopo il salvataggio aggiungi gli sconti (quantità + confezione).
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending || !prodottoId || !Number(prezzo)}
                      className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await upsertListinoRigaAction({
                            listinoId: selected.id,
                            prodottoId,
                            prezzo: Number(prezzo),
                            unitaMisura,
                          });
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setProdottoId("");
                          setPrezzo("");
                          await reloadRighe(selected.id);
                        })
                      }
                    >
                      Aggiungi riga
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          title={
            deleting.kind === "riga"
              ? "Rimuovi riga listino"
              : "Rimuovi condizione sconto"
          }
          message={
            deleting.kind === "riga"
              ? `Rimuovere ${deleting.riga.prodottoCodice} ${deleting.riga.prodottoNome} e le sue condizioni? Soft delete: resta in archivio.`
              : `Rimuovere lo sconto ${deleting.condizione.scontoPct}% su ${deleting.condizione.imballaggioCodice}? Soft delete: resta in archivio.`
          }
          confirmLabel="Rimuovi"
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            startTransition(async () => {
              const res =
                deleting.kind === "riga"
                  ? await softDeleteListinoRigaAction(deleting.riga.id)
                  : await softDeleteListinoRigaCondizioneAction(
                      deleting.condizione.id
                    );
              if (!res.success) {
                setError(res.error);
                return;
              }
              if (selectedId) await reloadRighe(selectedId);
              setDeleting(null);
            })
          }
        />
      ) : null}
    </div>
  );
}

function RigaBlock({
  riga,
  pending,
  confezioni,
  draft,
  onDraftChange,
  onSaved,
  onError,
  onDeleteRiga,
  onDeleteCond,
  startTransition,
}: {
  riga: ListinoRiga;
  pending: boolean;
  confezioni: ImballaggioVoce[];
  draft: CondDraft;
  onDraftChange: (d: CondDraft) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
  onDeleteRiga: () => void;
  onDeleteCond: (c: ListinoRigaCondizione) => void;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const [prezzo, setPrezzo] = useState(String(riga.prezzo));
  const [um, setUm] = useState<ListinoRigaUm>(riga.unitaMisura);

  useEffect(() => {
    setPrezzo(String(riga.prezzo));
    setUm(riga.unitaMisura);
  }, [riga.id, riga.prezzo, riga.unitaMisura]);

  return (
    <>
      <tr className="border-t border-[var(--border)] bg-white">
        <td className="px-3 py-2 font-medium">
          {riga.prodottoCodice} {riga.prodottoNome}
        </td>
        <td className="px-3 py-2">
          <input
            className="w-24 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            type="number"
            min={0}
            step="0.01"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
          />
        </td>
        <td className="px-3 py-2">
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            value={um}
            onChange={(e) => setUm(e.target.value as ListinoRigaUm)}
          >
            {LISTINO_RIGA_UM.map((u) => (
              <option key={u} value={u}>
                €/{u}
              </option>
            ))}
          </select>
        </td>
        <td colSpan={4} className="px-3 py-2 text-xs text-[var(--muted)]">
          Prezzo base. Le righe sotto sono sconti per scaglione e confezione.
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="text-xs font-medium text-emerald-800 underline"
              onClick={() =>
                startTransition(async () => {
                  const res = await upsertListinoRigaAction({
                    listinoId: riga.listinoId,
                    prodottoId: riga.prodottoId,
                    prezzo: Number(prezzo),
                    unitaMisura: um,
                  });
                  if (!res.success) {
                    onError(res.error);
                    return;
                  }
                  onSaved();
                })
              }
            >
              Salva
            </button>
            <button
              type="button"
              className="text-xs text-red-700 underline"
              onClick={onDeleteRiga}
            >
              Rimuovi
            </button>
          </div>
        </td>
      </tr>
      {riga.condizioni.map((c) => (
        <tr key={c.id} className="border-t border-dashed border-slate-200 bg-slate-50/50">
          <td className="px-3 py-1.5 pl-8 text-xs text-[var(--muted)]">
            condizione
          </td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 tabular-nums">{c.qtyDa}</td>
          <td className="px-3 py-1.5 tabular-nums">{c.qtyA ?? "∞"}</td>
          <td className="px-3 py-1.5 text-xs">
            {c.imballaggioCodice} {c.imballaggioNome}
          </td>
          <td className="px-3 py-1.5 tabular-nums">{c.scontoPct}</td>
          <td className="px-3 py-1.5">
            <button
              type="button"
              className="text-xs text-red-700 underline"
              onClick={() => onDeleteCond(c)}
            >
              Rimuovi
            </button>
          </td>
        </tr>
      ))}
      <tr className="border-t border-dashed border-slate-200 bg-slate-50/30">
        <td className="px-3 py-1.5 pl-8 text-xs text-[var(--muted)]">
          + sconto
        </td>
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            value={draft.qtyDa}
            onChange={(e) => onDraftChange({ ...draft, qtyDa: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            placeholder="∞"
            value={draft.qtyA}
            onChange={(e) => onDraftChange({ ...draft, qtyA: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <select
            className="w-full min-w-[180px] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            value={draft.imballaggioVoceId}
            onChange={(e) =>
              onDraftChange({ ...draft, imballaggioVoceId: e.target.value })
            }
          >
            <option value="">Confezione / C&I…</option>
            {confezioni.map((v) => (
              <option key={v.id} value={v.id}>
                {v.codice} — {v.nome}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={draft.scontoPct}
            onChange={(e) =>
              onDraftChange({ ...draft, scontoPct: e.target.value })
            }
          />
        </td>
        <td className="px-3 py-1.5">
          <button
            type="button"
            disabled={pending || !draft.imballaggioVoceId}
            className="text-xs font-medium text-emerald-800 underline disabled:opacity-40"
            onClick={() =>
              startTransition(async () => {
                const qtyA = draft.qtyA.trim() === "" ? null : Number(draft.qtyA);
                const res = await upsertListinoRigaCondizioneAction({
                  listinoRigaId: riga.id,
                  qtyDa: Number(draft.qtyDa),
                  qtyA,
                  imballaggioVoceId: draft.imballaggioVoceId,
                  scontoPct: Number(draft.scontoPct),
                });
                if (!res.success) {
                  onError(res.error);
                  return;
                }
                onDraftChange(emptyCond);
                onSaved();
              })
            }
          >
            Aggiungi
          </button>
        </td>
      </tr>
    </>
  );
}
