"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listProdottiCanaliAction,
  updateProdottoCanaleAction,
  type ProdottoCanale,
} from "@/app/actions/listini";
import type { StatoPubblicazioneCanale } from "@/types/database";

export function CanaliPubblicazioneBoard() {
  const [items, setItems] = useState<ProdottoCanale[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProdottoCanale>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await listProdottiCanaliAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
      setDrafts(Object.fromEntries(res.items.map((i) => [i.id, i])));
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(id: string, next: Partial<ProdottoCanale>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        Un prodotto compare su OpuntiaItalia solo se ha slug, flag B2B e stato{" "}
        <strong>pubblicato</strong>. I prezzi restano nei listini, non qui.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Prodotto</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">B2B</th>
              <th className="px-3 py-2">Wiki</th>
              <th className="px-3 py-2">B2C</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const d = drafts[item.id] ?? item;
              return (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.codice}</div>
                    <div className="text-xs text-[var(--muted)]">{item.nome}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-40 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                      value={d.slugPubblico}
                      onChange={(e) =>
                        patch(item.id, { slugPubblico: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={d.visibileB2b}
                      onChange={(e) =>
                        patch(item.id, { visibileB2b: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={d.visibileWiki}
                      onChange={(e) =>
                        patch(item.id, { visibileWiki: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={d.visibileB2c}
                      onChange={(e) =>
                        patch(item.id, { visibileB2c: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                      value={d.statoPubblicazione}
                      onChange={(e) =>
                        patch(item.id, {
                          statoPubblicazione: e.target
                            .value as StatoPubblicazioneCanale,
                        })
                      }
                    >
                      <option value="bozza">Bozza</option>
                      <option value="approvato">Approvato</option>
                      <option value="pubblicato">Pubblicato</option>
                      <option value="ritirato">Ritirato</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs underline"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await updateProdottoCanaleAction({
                            id: d.id,
                            slugPubblico: d.slugPubblico,
                            nomePubblico: d.nomePubblico || item.nome,
                            descrizionePubblica: d.descrizionePubblica,
                            unitaMisura: d.unitaMisura,
                            visibileB2b: d.visibileB2b,
                            visibileB2c: d.visibileB2c,
                            visibileWiki: d.visibileWiki,
                            statoPubblicazione: d.statoPubblicazione,
                          });
                          if (!res.success) setError(res.error);
                          else reload();
                        })
                      }
                    >
                      Salva
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
