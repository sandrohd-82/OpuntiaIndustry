"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FaPen } from "react-icons/fa6";
import {
  listMagazzinoProdottiAction,
  updateMagazzinoProdottoAction,
} from "@/app/actions/magazzino";
import { listRepartiAttiviAction } from "@/app/actions/reparti";
import type {
  MagazzinoProdottoRiga,
  MagazzinoUnita,
  Reparto,
  ScorteSemaforo,
} from "@/lib/magazzino/types";

function SemaforoBadge({ s }: { s: ScorteSemaforo }) {
  if (s === "sotto") {
    return (
      <span className="inline-flex rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">
        Sotto riserva
      </span>
    );
  }
  if (s === "soglia") {
    return (
      <span className="inline-flex rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
        Soglia
      </span>
    );
  }
  if (s === "ok") {
    return (
      <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Ok
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
      Da impostare
    </span>
  );
}

function rowClass(s: ScorteSemaforo): string {
  if (s === "sotto") return "bg-red-50/80";
  if (s === "soglia") return "bg-amber-50/80";
  return "";
}

export function MagazzinoProdottiBoard() {
  const [items, setItems] = useState<MagazzinoProdottoRiga[]>([]);
  const [reparti, setReparti] = useState<Reparto[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<MagazzinoProdottoRiga | null>(null);
  const [quantita, setQuantita] = useState(0);
  const [riserva, setRiserva] = useState<number | "">("");
  const [unita, setUnita] = useState<MagazzinoUnita>("kg");
  const [repartoId, setRepartoId] = useState("");
  const [q, setQ] = useState("");

  function load() {
    startTransition(async () => {
      const [prod, rep] = await Promise.all([
        listMagazzinoProdottiAction(),
        listRepartiAttiviAction(),
      ]);
      if (!prod.success) {
        setError(prod.error);
        setReady(true);
        return;
      }
      setItems(prod.items);
      if (rep.success) setReparti(rep.items);
      setError(null);
      setReady(true);
    });
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.codice.toLowerCase().includes(t) ||
        i.nome.toLowerCase().includes(t) ||
        (i.repartoNome ?? "").toLowerCase().includes(t)
    );
  }, [items, q]);

  function openEdit(row: MagazzinoProdottoRiga) {
    setEditing(row);
    setQuantita(row.quantita);
    setRiserva(row.quantitaRiserva ?? "");
    setUnita(row.unita);
    setRepartoId(row.repartoId ?? "");
  }

  function saveEdit() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateMagazzinoProdottoAction({
        prodottoId: editing.prodottoId,
        quantita,
        quantitaRiserva: riserva === "" ? null : Number(riserva),
        unita,
        repartoId: repartoId || null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.prodottoId === res.item.prodottoId ? res.item : i
        )
      );
      setEditing(null);
    });
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento prodotti…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Tutti i prodotti Agrinsicilia. Imposta quantità, riserva e reparto
            con Modifica. Giallo = soglia, rosso = sotto riserva (genera nota di
            acquisto).
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Cerca</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca codice, nome, reparto…"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">
            Modifica {editing.codice} — {editing.nome}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Giacenza</span>
              <input
                type="number"
                min={0}
                step="any"
                value={quantita}
                onChange={(e) => setQuantita(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Quantità riserva</span>
              <input
                type="number"
                min={0}
                step="any"
                value={riserva}
                onChange={(e) =>
                  setRiserva(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                placeholder="Minimo in magazzino"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Unità</span>
              <select
                value={unita}
                onChange={(e) => setUnita(e.target.value as MagazzinoUnita)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="kg">kg</option>
                <option value="pz">pz</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Reparto</span>
              <select
                value={repartoId}
                onChange={(e) => setRepartoId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">— nessuno —</option>
                {reparti.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codice} — {r.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={saveEdit}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Codice</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Giacenza</th>
              <th className="px-4 py-3">Riserva</th>
              <th className="px-4 py-3">Reparto</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.prodottoId}
                className={`border-t border-[var(--border)] ${rowClass(row.semaforo)}`}
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                  {row.codice}
                </td>
                <td className="max-w-[30vw] px-4 py-3 font-medium">
                  <span className="line-clamp-2">{row.nome}</span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.quantita.toLocaleString("it-IT")} {row.unita}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.quantitaRiserva != null
                    ? `${row.quantitaRiserva.toLocaleString("it-IT")} ${row.unita}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {row.repartoNome ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <SemaforoBadge s={row.semaforo} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-white/80"
                  >
                    <FaPen size={11} /> Modifica
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--muted)]"
                >
                  Nessun prodotto.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
