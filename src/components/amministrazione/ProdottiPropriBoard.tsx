"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import {
  FaChevronDown,
  FaChevronUp,
  FaFilePdf,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { ProdottiPropriLottiExpand } from "@/components/amministrazione/ProdottiPropriLottiExpand";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { ProdottiPropriFiltersPanel } from "@/components/amministrazione/ProdottiPropriFiltersPanel";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { setProdottiPropriAttivitaAction } from "@/app/actions/attivita";
import { listCatalogoSettoriAction } from "@/app/actions/prodotti-settori";
import { listProdottiPropriMagazzinoAction } from "@/app/actions/magazzino";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  emptyProdottiPropriFilters,
  filterProdottiPropri,
  hasActiveProdottiPropriFilters,
  type ProdottoProprio,
  type ProdottiPropriFilters,
} from "@/lib/amministrazione/prodotti-propri";
import { exportProdottiPropriPdf } from "@/lib/amministrazione/prodotti-propri-pdf";
import type { CatalogoSettore } from "@/lib/amministrazione/prodotti-settori";
import {
  hrefInserisciQuantita,
  quantitaInputDaStock,
} from "@/lib/magazzino/inserisci-quantita-href";
import {
  formatQuantitaCarico,
  unitaStockDaCarico,
  type MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";

type GiacenzaRiga = {
  giacenzaKg: number;
  unitaScheda: MagazzinoCaricoUnita;
};

function formatGiacenzaElenco(row: GiacenzaRiga): string {
  return formatQuantitaCarico(
    row.giacenzaKg,
    unitaStockDaCarico(row.unitaScheda)
  );
}

function GiacenzaCell({ row }: { row?: GiacenzaRiga }) {
  const qty = row?.giacenzaKg ?? 0;
  return (
    <span
      className={
        qty > 0 ? "font-semibold text-slate-900" : "text-[var(--muted)]"
      }
    >
      {row ? formatGiacenzaElenco(row) : "0 kg"}
    </span>
  );
}

export function ProdottiPropriBoard({
  showGiacenza = false,
}: {
  showGiacenza?: boolean;
}) {
  const pathname = usePathname();
  const nuovoProprioKey = pathname.startsWith("/app/magazzino")
    ? AZ.nuovoProdottoProprioMag
    : AZ.nuovoProdottoProprio;
  const searchParams = useSearchParams();
  const {
    prodotti,
    ready,
    error,
    addProdotto,
    updateProdotto,
    removeProdotto,
  } = useProdottiPropri();
  const [giacenze, setGiacenze] = useState<Record<string, GiacenzaRiga>>({});
  const [giacenzeReady, setGiacenzeReady] = useState(!showGiacenza);
  const [giacenzaError, setGiacenzaError] = useState<string | null>(null);
  const [settoriCatalog, setSettoriCatalog] = useState<CatalogoSettore[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProdottoProprio | null>(null);
  const [deleting, setDeleting] = useState<ProdottoProprio | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ProdottiPropriFilters>(
    emptyProdottiPropriFilters()
  );
  const [lottiAperti, setLottiAperti] = useState<Record<string, boolean>>({});
  const filtersActive = hasActiveProdottiPropriFilters(filters);
  const elencoColSpan = showGiacenza ? 8 : 6;

  useEffect(() => {
    if (searchParams.get("nuovo") === "1") {
      setCreating(true);
    }
  }, [searchParams]);

  function refreshSettori() {
    void listCatalogoSettoriAction().then((res) => {
      if (res.success) setSettoriCatalog(res.settori);
    });
  }

  useEffect(() => {
    refreshSettori();
  }, []);

  useEffect(() => {
    if (!showGiacenza) {
      setGiacenzeReady(true);
      return;
    }
    let cancelled = false;
    void listProdottiPropriMagazzinoAction().then((res) => {
      if (cancelled) return;
      if (res.success) {
        const next: Record<string, GiacenzaRiga> = {};
        for (const p of res.prodotti) {
          next[p.id] = {
            giacenzaKg: p.giacenzaKg,
            unitaScheda: p.unitaScheda,
          };
        }
        setGiacenze(next);
        setGiacenzaError(null);
      } else {
        setGiacenzaError(res.error);
      }
      setGiacenzeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [showGiacenza]);

  const filtered = useMemo(
    () => filterProdottiPropri(prodotti, filters),
    [prodotti, filters]
  );

  if (!ready || !giacenzeReady) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento prodotti Agrinsicilia
        {showGiacenza ? " e quantità in magazzino" : ""}…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {showGiacenza
            ? "Elenco prodotti Agrinsicilia con la quantità in magazzino. La freccia a destra apre i lotti del prodotto."
            : "Elenco prodotti Agrinsicilia con targa libera, filtri e controllo anti-duplicato sul nome."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {prodotti.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
                filtersOpen || filtersActive
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <FaMagnifyingGlass size={14} />
              Ricerca
              {filtersActive && !filtersOpen ? (
                <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ON
                </span>
              ) : null}
            </button>
          )}
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportProdottiPropriPdf(filtered, filters, {
                  giacenze: showGiacenza ? giacenze : undefined,
                })
              }
              title={
                filtersActive
                  ? `Esporta PDF dei ${filtered.length} prodotti filtrati`
                  : `Esporta PDF dell’elenco completo (${filtered.length})`
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <FaFilePdf size={14} className="text-red-600" />
              Esporta PDF
              {filtersActive ? (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  {filtered.length}
                </span>
              ) : null}
            </button>
          )}
          <ActionGate actionKey={nuovoProprioKey}>
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <FaPlus size={14} />
            Nuovo prodotto proprio
          </button>
          </ActionGate>
        </div>
      </div>

      {(error || saveError || giacenzaError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error || giacenzaError}
        </p>
      )}

      {prodotti.length > 0 && filtersOpen && (
        <ProdottiPropriFiltersPanel
          value={filters}
          onChange={setFilters}
          resultCount={filtered.length}
          totalCount={prodotti.length}
          onCollapse={() => setFiltersOpen(false)}
          settori={settoriCatalog}
        />
      )}

      {prodotti.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun prodotto proprio</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggiungi il primo codice interno per usarlo nei fornitori.
          </p>
          <ActionGate actionKey={nuovoProprioKey}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo prodotto proprio
          </button>
          </ActionGate>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-medium">Nessun risultato con questi filtri</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Modifica i criteri oppure azzera i filtri.
          </p>
          <button
            type="button"
            onClick={() => setFilters(emptyProdottiPropriFilters())}
            className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Settori</th>
                {showGiacenza ? (
                  <th className="px-4 py-3 font-medium">Quantità in magazzino</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Tipologia</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 text-right font-medium" />
                {showGiacenza ? (
                  <th className="px-2 py-3 text-right font-medium">Lotti</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <Fragment key={m.id}>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-semibold tracking-wide text-slate-800">
                      {m.codice}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.nome}</td>
                  <td className="px-4 py-3">
                    {(m.settori ?? []).length === 0 ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {m.settori.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800"
                          >
                            {s.nome}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  {showGiacenza ? (
                    <td className="px-4 py-3 tabular-nums">
                      <GiacenzaCell row={giacenze[m.id]} />
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-xs">
                    {m.isBio ? (
                      <span className="font-medium text-emerald-700">
                        Prodotto bio
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">
                        Prodotto convenzionale
                      </span>
                    )}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-[var(--muted)]">
                    {m.note || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                      {showGiacenza ? (
                        <ActionGate actionKey={AZ.inserisciQuantitaAgrinsicilia}>
                          <Link
                            href={hrefInserisciQuantita({
                              prodottoId: m.id,
                              unita: giacenze[m.id]?.unitaScheda,
                              quantita: giacenze[m.id]
                                ? quantitaInputDaStock(
                                    giacenze[m.id].giacenzaKg,
                                    giacenze[m.id].unitaScheda
                                  )
                                : null,
                            })}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                          >
                            Modifica quantità
                          </Link>
                        </ActionGate>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setSaveError(null);
                          setEditing(m);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
                      >
                        <FaPen size={11} />
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSaveError(null);
                          setDeleting(m);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <FaTrash size={11} />
                        Elimina
                      </button>
                    </div>
                  </td>
                  {showGiacenza ? (
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        aria-expanded={Boolean(lottiAperti[m.id])}
                        aria-label={
                          lottiAperti[m.id]
                            ? "Chiudi lotti"
                            : "Apri lotti del prodotto"
                        }
                        onClick={() =>
                          setLottiAperti((prev) => ({
                            ...prev,
                            [m.id]: !prev[m.id],
                          }))
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                      >
                        {lottiAperti[m.id] ? (
                          <FaChevronUp size={14} />
                        ) : (
                          <FaChevronDown size={14} />
                        )}
                      </button>
                    </td>
                  ) : null}
                </tr>
                {showGiacenza && lottiAperti[m.id] ? (
                  <ProdottiPropriLottiExpand
                    prodottoId={m.id}
                    prodottoCodice={m.codice}
                    colSpan={elencoColSpan}
                  />
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ProdottoProprioFormModal
          mode="create"
          catalog={prodotti}
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addProdotto(values);
            if (created.success) {
              const link = await setProdottiPropriAttivitaAction({
                prodottoId: created.prodotto.id,
                links:
                  values.attivitaLinks ??
                  (values.attivitaIds ?? []).map((id) => ({
                    attivitaId: id,
                    obbligatoria: true,
                  })),
              });
              if (!link.success) {
                setSaveError(link.error);
                return;
              }
              setSaveError(null);
              refreshSettori();
              setCreating(false);
            } else {
              setSaveError(created.error);
            }
          }}
        />
      )}

      {editing && (
        <ProdottoProprioFormModal
          mode="edit"
          initial={editing}
          catalog={prodotti}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const updated = await updateProdotto(editing.id, values);
            if (updated.success) {
              const link = await setProdottiPropriAttivitaAction({
                prodottoId: editing.id,
                links:
                  values.attivitaLinks ??
                  (values.attivitaIds ?? []).map((id) => ({
                    attivitaId: id,
                    obbligatoria: true,
                  })),
              });
              if (!link.success) {
                setSaveError(link.error);
                return;
              }
              setSaveError(null);
              refreshSettori();
              setEditing(null);
            } else {
              setSaveError(updated.error);
            }
          }}
        />
      )}

      {deleting && (
        <SoftDeleteConfirmModal
          entityLabel="prodotto"
          confirmCode={deleting.codice}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const result = await removeProdotto(deleting.id, confermaTestuale);
            if (!result.success) {
              throw new Error(result.error);
            }
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
