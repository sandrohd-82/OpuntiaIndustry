"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { FaArrowsRotate, FaPlus } from "react-icons/fa6";
import {
  getFatturaByIdAction,
  listFattureAction,
  rinumeraTutteFattureEmesseAction,
} from "@/app/actions/fatture";
import {
  startFattureEmesseSyncAction,
  startFattureRicevuteSyncAction,
} from "@/app/actions/fatture-sync";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import { FatturaSyncQueueModal } from "@/components/amministrazione/FatturaSyncQueueModal";
import { SortableTh } from "@/components/ui/SortableTh";
import {
  formatDateIt,
  formatEuro,
  labelStatoPagamento,
  type Fattura,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import {
  buildTrimestreOptions,
  isoInDateRange,
  labelTrimestreKey,
  trimestreFromIsoDate,
  type TrimestreKey,
} from "@/lib/amministrazione/trimestre-commerciale";
import {
  compareSortValues,
  nextSortState,
  type SortState,
} from "@/lib/ui/list-sort";
import Link from "next/link";

type Props = {
  kind: FatturaKind;
};

type SortKey =
  | "numeroInterno"
  | "dataEmissione"
  | "anagrafica"
  | "docEsterno"
  | "rifFattura"
  | "imponibile"
  | "totale"
  | "stato";

function docLabel(kind: FatturaKind): string {
  if (kind === "nota_credito") return "nota di credito";
  if (kind === "emessa") return "fattura emessa";
  return "fattura ricevuta";
}

function prodottoMatch(f: Fattura, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return f.righe.some((r) => {
    const codice = (r.codice ?? "").toLowerCase();
    const desc = (r.descrizione ?? "").toLowerCase();
    return codice.includes(q) || desc.includes(q);
  });
}

function sortValue(f: Fattura, key: SortKey): string | number {
  switch (key) {
    case "numeroInterno":
      return f.numeroInterno;
    case "dataEmissione":
      return f.dataEmissione;
    case "anagrafica":
      return `${f.anagraficaCodiceTarga} ${f.anagraficaRagioneSociale}`;
    case "docEsterno":
      return f.numeroDocumentoEsterno || "";
    case "rifFattura":
      return f.riferimentoFatturaEsterno || "";
    case "imponibile":
      return f.imponibile;
    case "totale":
      return f.totale;
    case "stato":
      return f.statoPagamento;
    default:
      return "";
  }
}

export function FattureInterneBoard({ kind }: Props) {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Fattura | null>(null);
  const [syncItems, setSyncItems] = useState<FatturaSyncQueueItem[] | null>(
    null
  );
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [syncPending, startSyncTransition] = useTransition();

  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: "dataEmissione",
    dir: "desc",
  });
  const [filtroDal, setFiltroDal] = useState("");
  const [filtroAl, setFiltroAl] = useState("");
  const [filtroTrimestre, setFiltroTrimestre] = useState<TrimestreKey | "">(
    ""
  );
  const [filtroAziendaId, setFiltroAziendaId] = useState("");
  const [filtroProdotto, setFiltroProdotto] = useState("");

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await listFattureAction(kind);
      if (!result.success) {
        setError(result.error);
        setFatture([]);
        setReady(true);
        return;
      }
      setError(null);
      setFatture(result.fatture);
      setReady(true);
    });
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setFiltroDal("");
    setFiltroAl("");
    setFiltroTrimestre("");
    setFiltroAziendaId("");
    setFiltroProdotto("");
    setSort({ key: "dataEmissione", dir: "desc" });
  }, [kind]);

  function handleSync() {
    setError(null);
    setSyncInfo(null);
    startSyncTransition(async () => {
      const result =
        kind === "ricevuta"
          ? await startFattureRicevuteSyncAction()
          : await startFattureEmesseSyncAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const parts: string[] = [];
      if (result.skippedAlreadyRegistered > 0) {
        parts.push(
          `${result.skippedAlreadyRegistered} documenti già registrati saltati.`
        );
      }
      if (result.autoLinkedCount > 0) {
        parts.push(
          `${result.autoLinkedCount} documenti manuali collegati automaticamente a FiC.`
        );
      }
      if (result.creditNotesPending > 0) {
        parts.push(
          `${result.creditNotesPending} note di credito da registrare.`
        );
      }
      parts.push(
        "Coda in ordine cronologico (dalla data più lontana a oggi); i progressivi interni vengono riallineati per azienda."
      );
      setSyncInfo(parts.join(" "));
      setSyncItems(result.items);
    });
  }

  const entityLabel = kind === "ricevuta" ? "Fornitore" : "Cliente";
  const titleHint =
    kind === "nota_credito"
      ? "Storico note di credito. Sync dalla fattura più vecchia; i numeri interni (targa) si riorganizzano sempre per data."
      : kind === "emessa"
        ? "Storico fatture emesse. Sync cronologica (vecchie → recenti); i progressivi Ft/Nc si riallineano per azienda a ogni sync."
        : "Storico fatture ricevute. Sincronizza = stesso flusso della pagina Fornitori.";

  const emptyLabel =
    kind === "nota_credito"
      ? "Nessuna nota di credito registrata"
      : "Nessuna fattura registrata";

  const aziendeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fatture) {
      const id = f.anagraficaId || f.anagraficaCodiceTarga;
      if (!id) continue;
      if (!map.has(id)) {
        map.set(
          id,
          `${f.anagraficaCodiceTarga} — ${f.anagraficaRagioneSociale}`
        );
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "it", { sensitivity: "base" }))
      .map(([id, label]) => ({ id, label }));
  }, [fatture]);

  const trimestreOptions = useMemo(
    () => buildTrimestreOptions(fatture.map((f) => f.dataEmissione)),
    [fatture]
  );

  const filteredSorted = useMemo(() => {
    let list = fatture.filter((f) => {
      if (!isoInDateRange(f.dataEmissione, filtroDal, filtroAl)) return false;
      if (filtroTrimestre) {
        const t = trimestreFromIsoDate(f.dataEmissione);
        if (!t || t.key !== filtroTrimestre) return false;
      }
      if (filtroAziendaId) {
        const id = f.anagraficaId || f.anagraficaCodiceTarga;
        if (id !== filtroAziendaId) return false;
      }
      if (!prodottoMatch(f, filtroProdotto)) return false;
      return true;
    });

    if (sort) {
      list = [...list].sort((a, b) =>
        compareSortValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir)
      );
    }
    return list;
  }, [
    fatture,
    filtroDal,
    filtroAl,
    filtroTrimestre,
    filtroAziendaId,
    filtroProdotto,
    sort,
  ]);

  const filtriAttivi =
    Boolean(filtroDal) ||
    Boolean(filtroAl) ||
    Boolean(filtroTrimestre) ||
    Boolean(filtroAziendaId) ||
    Boolean(filtroProdotto.trim());

  function clearFiltri() {
    setFiltroDal("");
    setFiltroAl("");
    setFiltroTrimestre("");
    setFiltroAziendaId("");
    setFiltroProdotto("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{titleHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncPending}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <FaArrowsRotate
              size={14}
              className={syncPending ? "animate-spin" : ""}
            />
            {syncPending ? "Preparazione sync…" : "Sincronizza"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <FaPlus size={12} />
            {kind === "nota_credito"
              ? "Registra nota di credito"
              : "Registra fattura"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Filtri
          </p>
          {filtriAttivi ? (
            <button
              type="button"
              onClick={clearFiltri}
              className="text-xs font-medium text-[var(--primary)] hover:underline"
            >
              Azzera filtri
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Data da
            </span>
            <input
              type="date"
              value={filtroDal}
              onChange={(e) => setFiltroDal(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Data a
            </span>
            <input
              type="date"
              value={filtroAl}
              onChange={(e) => setFiltroAl(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Trimestre commerciale
            </span>
            <select
              value={filtroTrimestre}
              onChange={(e) =>
                setFiltroTrimestre(e.target.value as TrimestreKey | "")
              }
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Tutti</option>
              {trimestreOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Azienda ({entityLabel.toLowerCase()})
            </span>
            <select
              value={filtroAziendaId}
              onChange={(e) => setFiltroAziendaId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Tutte</option>
              {aziendeOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Contiene prodotto
            </span>
            <input
              type="search"
              value={filtroProdotto}
              onChange={(e) => setFiltroProdotto(e.target.value)}
              placeholder="Es. Agrinsicilia, ODR…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
        </div>
        {ready && fatture.length > 0 ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Mostrate {filteredSorted.length} di {fatture.length}
            {filtroTrimestre
              ? ` · ${labelTrimestreKey(filtroTrimestre)}`
              : ""}
          </p>
        ) : null}
      </div>

      {syncInfo ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {syncInfo}
        </p>
      ) : null}

      {syncItems && syncItems.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Nessun documento da registrare da Fatture in Cloud.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {syncItems && syncItems.length > 0 ? (
        <FatturaSyncQueueModal
          items={syncItems}
          onFinished={(n) => {
            void (async () => {
              if (kind === "emessa" || kind === "nota_credito") {
                await rinumeraTutteFattureEmesseAction();
              }
              setSyncItems(null);
              setSyncInfo(
                n > 0
                  ? `Sync completata: ${n} documenti registrati. Progressivi riallineati per data.`
                  : "Sync completata senza nuove registrazioni. Progressivi riallineati per data."
              );
              load();
            })();
          }}
          onPaused={() => {
            void (async () => {
              if (kind === "emessa" || kind === "nota_credito") {
                await rinumeraTutteFattureEmesseAction();
              }
              setSyncItems(null);
              setSyncInfo(
                "Sync in pausa. Progressivi riallineati. Al prossimo Sincronizza riparti dai documenti non ancora registrati."
              );
              load();
            })();
          }}
        />
      ) : null}

      {creating ? (
        <FatturaRegistrazioneModal
          kind={kind}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <FatturaRegistrazioneModal
          kind={editing.kind}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {!ready || pending ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : fatture.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm font-medium">{emptyLabel}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Usa «Registra» oppure «Sincronizza» da Fatture in Cloud.
          </p>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm font-medium">Nessun documento con questi filtri</p>
          <button
            type="button"
            onClick={clearFiltri}
            className="mt-3 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh
                  label="N. interno"
                  sortKey="numeroInterno"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Data"
                  sortKey="dataEmissione"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label={entityLabel}
                  sortKey="anagrafica"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Doc. esterno"
                  sortKey="docEsterno"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                {kind === "nota_credito" ? (
                  <SortableTh
                    label="Rif. fattura"
                    sortKey="rifFattura"
                    sort={sort}
                    onSort={(k) => setSort((s) => nextSortState(s, k))}
                  />
                ) : null}
                <SortableTh
                  label="Imponibile"
                  sortKey="imponibile"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Totale"
                  sortKey="totale"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Stato"
                  sortKey="stato"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  FiC
                </th>
                <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredSorted.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={fatturaDetailPath(f.kind, f.id)}
                      className="font-mono text-sm font-medium text-[var(--primary)] hover:underline"
                    >
                      {f.numeroInterno}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatDateIt(f.dataEmissione)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {f.anagraficaCodiceTarga}
                    </span>
                    <span className="text-[var(--muted)]">
                      {" "}
                      — {f.anagraficaRagioneSociale}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {f.numeroDocumentoEsterno || "—"}
                  </td>
                  {kind === "nota_credito" ? (
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono">
                        {f.riferimentoFatturaEsterno || "—"}
                      </span>
                      {f.modalitaCollegamento === "sostituzione" ? (
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-indigo-800">
                          Sostituzione gestionale
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(f.imponibile)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatEuro(f.totale)}
                  </td>
                  <td className="px-4 py-3">
                    {f.statoPagamento === "annullata" ? (
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="inline-flex w-fit rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                          Annullata
                        </span>
                        {f.annullataDaNcNumeroInterno ? (
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            {f.annullataDaNcNumeroInterno}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      labelStatoPagamento(f.statoPagamento, f.kind, {
                        annullataDaNcNumeroInterno: f.annullataDaNcNumeroInterno,
                      })
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ApriFatturaFicButton
                      kind={f.kind}
                      ficId={f.ficId}
                      label={
                        kind === "nota_credito" ? "Apri NC" : "Apri fattura"
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          setError(null);
                          const res = await getFatturaByIdAction(f.kind, f.id);
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setEditing(res.fattura);
                        })();
                      }}
                      className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Modifica
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sr-only">{docLabel(kind)}</p>
    </div>
  );
}
