"use client";

import { useEffect, useMemo, useState } from "react";
import { FaLink, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  createCatalogoProdottoFornitoreAction,
  createCatalogoServizioAction,
  listCatalogoProdottiFornitoreAction,
  listCatalogoServiziAction,
  softDeleteCatalogoProdottoFornitoreAction,
  softDeleteCatalogoServizioAction,
} from "@/app/actions/catalogo-offerta";
import { ArticoloCollegatiManageModal } from "@/components/amministrazione/ArticoloCollegatiManageModal";
import { CatalogoOffertaFormModal } from "@/components/amministrazione/CatalogoOffertaFormModal";
import { CodificaArticoloRevisioneModal } from "@/components/amministrazione/CodificaArticoloRevisioneModal";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { DocumentiCatalogoQueueModal } from "@/components/amministrazione/DocumentiCatalogoQueueModal";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { listFattureDaAggiornareCatalogoAction } from "@/app/actions/catalogo-collega";
import type { Fattura } from "@/lib/amministrazione/fatture";
import type {
  CatalogoOffertaInput,
  CatalogoOffertaItem,
  CatalogoOffertaKind,
} from "@/lib/amministrazione/catalogo-offerta";
import { catalogoPrefix } from "@/lib/amministrazione/catalogo-offerta";

type Props = {
  kind: CatalogoOffertaKind;
};

export function CatalogoOffertaBoard({ kind }: Props) {
  const [items, setItems] = useState<CatalogoOffertaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CatalogoOffertaItem | null>(null);
  const [deleting, setDeleting] = useState<CatalogoOffertaItem | null>(null);
  const [linking, setLinking] = useState<CatalogoOffertaItem | null>(null);
  const [codaFatture, setCodaFatture] = useState<Fattura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const prefix = catalogoPrefix(kind);
  const title = kind === "servizio" ? "Servizi" : "Prodotti";
  const entityLabel = kind === "servizio" ? "servizio" : "prodotto";

  async function refresh() {
    const result =
      kind === "servizio"
        ? await listCatalogoServiziAction()
        : await listCatalogoProdottiFornitoreAction();
    if (result.success) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, [kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.codice.toLowerCase().includes(q) ||
        i.nome.toLowerCase().includes(q) ||
        i.note.toLowerCase().includes(q)
    );
  }, [items, query]);

  async function handleCreate(values: CatalogoOffertaInput) {
    setError(null);
    const result =
      kind === "servizio"
        ? await createCatalogoServizioAction(values)
        : await createCatalogoProdottoFornitoreAction(values);
    if (!result.success) {
      setError(result.error);
      throw new Error(result.error);
    }
    setItems((prev) =>
      [...prev, result.item].sort((a, b) =>
        a.codice.localeCompare(b.codice, "it")
      )
    );
  }

  async function openCodaSeServe() {
    const res = await listFattureDaAggiornareCatalogoAction();
    if (res.success && res.count > 0) {
      setCodaFatture(res.fatture);
    }
  }

  async function handleDelete(confermaTestuale: string) {
    if (!deleting) return { success: false as const, error: "Nessuna voce." };
    setError(null);
    setInfo(null);
    const result =
      kind === "servizio"
        ? await softDeleteCatalogoServizioAction({
            id: deleting.id,
            confermaTestuale,
          })
        : await softDeleteCatalogoProdottoFornitoreAction({
            id: deleting.id,
            confermaTestuale,
          });
    if (!result.success) {
      setError(result.error);
      return { success: false as const, error: result.error };
    }
    if (result.deleted) {
      setItems((prev) => prev.filter((i) => i.id !== deleting.id));
      setDeleting(null);
      return { success: true as const };
    }
    setInfo(result.message);
    await refresh();
    setDeleting(null);
    await openCodaSeServe();
    return { success: true as const };
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento catalogo {title.toLowerCase()}…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Catalogo {title.toLowerCase()} con targa {prefix}. Modifica aggiorna
          fatture e schede collegate; eliminazione richiede documenti aggiornati.
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo {entityLabel}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {info}
        </p>
      ) : null}

      {items.length > 0 ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per codice o nome…"
          className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun {entityLabel}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggiungi la prima voce con targa {prefix}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodiceTargaBadge
                        code={item.codice}
                        fixedPrefix={catalogoPrefix(kind)}
                      />
                      {item.pendingDeleteAt ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          In eliminazione
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{item.nome}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {item.isBio ? "Bio" : "Convenzionale"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--muted)]">
                    {item.note || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setLinking(item);
                        }}
                        className="rounded p-2 text-violet-700 hover:bg-violet-50"
                        aria-label={`Articoli collegati a ${item.codice}`}
                        title="Articoli collegati"
                      >
                        <FaLink size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setEditing(item);
                        }}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100"
                        aria-label={`Modifica ${item.codice}`}
                      >
                        <FaPen size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setInfo(null);
                          setDeleting(item);
                        }}
                        className="rounded p-2 text-red-600 hover:bg-red-50"
                        aria-label={`Elimina ${item.codice}`}
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">
              Nessun risultato per la ricerca.
            </p>
          ) : null}
        </div>
      )}

      {creating ? (
        <CatalogoOffertaFormModal
          kind={kind}
          mode="create"
          catalog={items}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      ) : null}

      {editing ? (
        <CodificaArticoloRevisioneModal
          mode="rename"
          lockKind
          renameId={editing.id}
          renameNote={editing.note}
          renameIsBio={editing.isBio}
          initialText={editing.nome}
          initialKind={kind}
          onClose={() => setEditing(null)}
          onConfirmed={async (result) => {
            setInfo(
              result.renamed
                ? `Targa aggiornata: ${result.codice}`
                : `Associato: ${result.codice}`
            );
            await refresh();
            setEditing(null);
          }}
        />
      ) : null}

      {linking ? (
        <ArticoloCollegatiManageModal
          kind={kind}
          id={linking.id}
          codice={linking.codice}
          nome={linking.nome}
          onClose={() => setLinking(null)}
        />
      ) : null}

      {codaFatture ? (
        <DocumentiCatalogoQueueModal
          fatture={codaFatture}
          onFinished={(n) => {
            setCodaFatture(null);
            setInfo(
              n > 0
                ? `Coda completata (${n} documenti). Puoi riprovare l'eliminazione del codice.`
                : "Coda chiusa."
            );
            void refresh();
          }}
          onPaused={() => {
            setCodaFatture(null);
            setInfo(
              "Coda in pausa. I documenti restano in bozza da aggiornare."
            );
          }}
        />
      ) : null}

      {deleting ? (
        <SoftDeleteConfirmModal
          entityLabel={entityLabel}
          confirmCode={deleting.codice}
          onClose={() => setDeleting(null)}
          onConfirm={async (conferma) => {
            const res = await handleDelete(conferma);
            if (!res.success) throw new Error(res.error);
          }}
        />
      ) : null}
    </div>
  );
}
