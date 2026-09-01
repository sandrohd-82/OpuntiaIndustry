"use client";

import { useEffect, useState, useTransition } from "react";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  createListinoAction,
  listListiniAction,
  listListinoRigheAction,
  setListinoStatoAction,
  softDeleteListinoRigaAction,
  upsertListinoRigaAction,
} from "@/app/actions/listini";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import type { Listino, ListinoRiga } from "@/lib/ecosystem/listini";
import type { ListinoStato } from "@/types/database";

const STATO_LABEL: Record<ListinoStato, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  pubblicato: "Pubblicato",
  chiuso: "Chiuso",
};

export function ListiniB2bBoard() {
  const [items, setItems] = useState<Listino[]>([]);
  const [righe, setRighe] = useState<ListinoRiga[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prodotti, setProdotti] = useState<
    Array<{ id: string; codice: string; nome: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [codice, setCodice] = useState("B2B-");
  const [nome, setNome] = useState("");
  const [validoDal, setValidoDal] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [prodottoId, setProdottoId] = useState("");
  const [prezzo, setPrezzo] = useState("0");
  const [deletingRiga, setDeletingRiga] = useState<ListinoRiga | null>(null);

  function reload() {
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

  useEffect(() => {
    reload();
    void listProdottiPropriAction().then((r) => {
      if (r.success) {
        setProdotti(r.prodotti.map((p) => ({ id: p.id, codice: p.codice, nome: p.nome })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRighe([]);
      return;
    }
    startTransition(async () => {
      const res = await listListinoRigheAction(selectedId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRighe(res.items);
    });
  }, [selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Nuovo listino B2B</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Bozza v1. OpuntiaItalia legge solo listini pubblicati in validità.
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
                reload();
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

      <div className="space-y-3">
        {!selected ? (
          <p className="text-sm text-[var(--muted)]">
            Seleziona un listino per gestire le righe.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
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
                          else reload();
                        })
                      }
                    >
                      → {STATO_LABEL[stato]}
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h3 className="text-sm font-semibold">Aggiungi / aggiorna prezzo</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={prodottoId}
                  onChange={(e) => setProdottoId(e.target.value)}
                >
                  <option value="">Prodotto…</option>
                  {prodotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  step="0.01"
                  value={prezzo}
                  onChange={(e) => setPrezzo(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={pending || !prodottoId}
                className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    const res = await upsertListinoRigaAction({
                      listinoId: selected.id,
                      prodottoId,
                      prezzo: Number(prezzo),
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    const next = await listListinoRigheAction(selected.id);
                    if (next.success) setRighe(next.items);
                  })
                }
              >
                Salva riga
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Prodotto</th>
                    <th className="px-3 py-2">Prezzo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        {r.prodottoCodice} {r.prodottoNome}
                      </td>
                      <td className="px-3 py-2">
                        {r.prezzo.toFixed(2)} EUR
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-red-700 underline"
                          onClick={() => setDeletingRiga(r)}
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {deletingRiga ? (
        <ConfirmDeleteModal
          title="Rimuovi riga listino"
          message={`Rimuovere ${deletingRiga.prodottoCodice} ${deletingRiga.prodottoNome} da questo listino? Soft delete: resta in archivio.`}
          confirmLabel="Rimuovi"
          onClose={() => setDeletingRiga(null)}
          onConfirm={() =>
            startTransition(async () => {
              const res = await softDeleteListinoRigaAction(deletingRiga.id);
              if (!res.success) {
                setError(res.error);
                return;
              }
              if (selectedId) {
                const next = await listListinoRigheAction(selectedId);
                if (next.success) setRighe(next.items);
              }
              setDeletingRiga(null);
            })
          }
        />
      ) : null}
    </div>
  );
}
