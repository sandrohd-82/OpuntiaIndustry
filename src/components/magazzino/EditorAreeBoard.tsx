"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  creaMappaBozzaAction,
  listMappeEditorAction,
} from "@/app/actions/magazzino-mappa";
import {
  MAPPA_STATO_LABEL,
  etichettaMappaCollegata,
  type MappaElencoItem,
} from "@/lib/magazzino/mappa";

export function EditorAreeBoard() {
  const router = useRouter();
  const [items, setItems] = useState<MappaElencoItem[]>([]);
  const [canDesign, setCanDesign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const res = await listMappeEditorAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
    setCanDesign(res.canDesign);
    setError(null);
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
  }, []);

  async function nuovaBozza() {
    setCreating(true);
    setError(null);
    const res = await creaMappaBozzaAction();
    setCreating(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.push(`/app/strumenti/editor-aree/${res.mappa.id}`);
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento elenco bozze…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Le bozze restano in elenco. Collega ad area, poi Approva per renderle
          definitive in Magazzino → Mappa Magazzino.
        </p>
        {canDesign ? (
          <button
            type="button"
            disabled={creating}
            onClick={() => void nuovaBozza()}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creazione…" : "Nuova bozza"}
          </button>
        ) : (
          <p className="text-sm text-amber-800">
            Solo il Super Admin può disegnare e collegare le piante.
          </p>
        )}
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nessuna bozza. Crea la prima pianta.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Nome Area</th>
                <th className="px-3 py-2 font-medium">Stato</th>
                <th className="px-3 py-2 font-medium">Collegamento</th>
                <th className="px-3 py-2 font-medium">v</th>
                <th className="px-3 py-2 font-medium">Aggiornata</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">
                    {it.luogoNome || it.nome}
                  </td>
                  <td className="px-3 py-2">
                    {MAPPA_STATO_LABEL[it.documentoStato]}
                  </td>
                  <td className="px-3 py-2">
                    {it.luogoNome && it.vistaEtichetta
                      ? etichettaMappaCollegata(it.luogoNome, it.vistaEtichetta)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{it.versione}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {new Date(it.updatedAt).toLocaleString("it-IT")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/app/strumenti/editor-aree/${it.id}`}
                      className="text-sm font-medium text-teal-800 hover:underline"
                    >
                      Apri
                    </Link>
                    {it.documentoStato === "approvato" &&
                    (it.luogoSlug || it.slug) ? (
                      <Link
                        href={`/app/pianta/${it.luogoSlug || it.slug}`}
                        className="ml-3 text-sm text-slate-600 hover:underline"
                      >
                        Vedi area
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
