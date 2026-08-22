"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FaCircleInfo, FaPen } from "react-icons/fa6";
import {
  listMagazzinoProdottiAction,
  updateMagazzinoProdottoAction,
} from "@/app/actions/magazzino";
import { resolveSchedaProvvisoriaOnceAction } from "@/app/actions/magazzino-barcode";
import { AssociaBarcodeModal } from "@/components/magazzino/AssociaBarcodeModal";
import { AssociaFotoModal } from "@/components/magazzino/AssociaFotoModal";
import { getMagazzinoFotoUrlAction } from "@/app/actions/magazzino-foto";
import {
  CATEGORIA_UTILIZZO_OPTIONS,
  categoriaRequiresMagazzino,
  labelCategoriaUtilizzo,
  labelMagazzinoArticolo,
  type CategoriaUtilizzo,
  type MagazzinoCatalogKind,
  type MagazzinoProdottoRiga,
  type MagazzinoUnita,
  type ScorteSemaforo,
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

function RiservaInfoTip() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Spiegazione quantità minima di riserva"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
      >
        <FaCircleInfo size={11} />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-lg"
        >
          <span className="block font-semibold text-slate-900">
            Quantità minima di riserva
          </span>
          <span className="mt-1.5 block leading-relaxed">
            È la scorta minima che vuoi mantenere in magazzino. Il sistema
            confronta la <strong>giacenza attuale</strong> con questo valore:
          </span>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed">
            <li>
              <strong>Sotto riserva</strong> (giacenza &lt; minimo): semaforo
              rosso e l’articolo viene proposto in una{" "}
              <strong>nota di acquisto</strong> aperta.
            </li>
            <li>
              <strong>Soglia</strong> (giacenza = minimo): semaforo ambra; vale
              comunque come livello critico e può finire in nota d’acquisto.
            </li>
            <li>
              <strong>Ok</strong> (giacenza &gt; minimo): scorta sufficiente,
              nessuna segnalazione automatica.
            </li>
          </ul>
        </span>
      ) : null}
    </span>
  );
}

export function MagazzinoProdottiBoard({
  catalogKind,
}: {
  catalogKind: MagazzinoCatalogKind;
}) {
  const [items, setItems] = useState<MagazzinoProdottoRiga[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<MagazzinoProdottoRiga | null>(null);
  const [categoria, setCategoria] = useState<CategoriaUtilizzo | "">("");
  const [titolo, setTitolo] = useState("");
  const [confermaTitolo, setConfermaTitolo] = useState("");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [schedaProvvisoria, setSchedaProvvisoria] = useState(false);
  const [associaOpen, setAssociaOpen] = useState(false);
  const [associaFotoOpen, setAssociaFotoOpen] = useState(false);
  const [quantita, setQuantita] = useState(0);
  const [riserva, setRiserva] = useState<number | "">("");
  const [unita, setUnita] = useState<MagazzinoUnita>("kg");
  const [q, setQ] = useState("");

  const kindLabel =
    catalogKind === "materia_prima"
      ? "materie prime acquistate"
      : "prodotti fornitore acquistati (Pr)";

  const needsRiserva =
    categoria !== "" && categoriaRequiresMagazzino(categoria);

  const titoloGiaImpostato = Boolean(editing?.titoloMagazzino?.trim());
  const titoloModificato =
    titoloGiaImpostato &&
    titolo.trim() !== (editing?.titoloMagazzino ?? "").trim();

  function load() {
    startTransition(async () => {
      const prod = await listMagazzinoProdottiAction(catalogKind);
      if (!prod.success) {
        setError(prod.error);
        setReady(true);
        return;
      }
      setItems(prod.items);
      setError(null);
      setReady(true);
    });
  }

  useEffect(() => {
    setReady(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on catalogKind
  }, [catalogKind]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.codice.toLowerCase().includes(t) ||
        i.nome.toLowerCase().includes(t) ||
        (i.titoloMagazzino ?? "").toLowerCase().includes(t) ||
        labelCategoriaUtilizzo(i.categoriaUtilizzo).toLowerCase().includes(t)
    );
  }, [items, q]);

  function openEdit(row: MagazzinoProdottoRiga) {
    setEditing(row);
    setCategoria(row.categoriaUtilizzo ?? "");
    setTitolo(row.titoloMagazzino ?? "");
    setConfermaTitolo("");
    setBarcode(row.barcode);
    setFotoPath(row.fotoPath);
    setFotoUrl(null);
    setSchedaProvvisoria(row.schedaProvvisoria);
    setQuantita(row.quantita);
    setRiserva(row.quantitaRiserva ?? "");
    setUnita(row.unita);
    setError(null);
    setAssociaOpen(false);
    setAssociaFotoOpen(false);

    if (row.fotoPath) {
      startTransition(async () => {
        const res = await getMagazzinoFotoUrlAction({
          catalogKind,
          prodottoId: row.prodottoId,
        });
        if (res.success) setFotoUrl(res.url);
      });
    }

    if (row.schedaProvvisoria) {
      startTransition(async () => {
        const res = await resolveSchedaProvvisoriaOnceAction({
          catalogKind,
          prodottoId: row.prodottoId,
        });
        if (!res.success) return;
        if (res.cleared) {
          setSchedaProvvisoria(false);
          setItems((prev) =>
            prev.map((i) =>
              i.prodottoId === row.prodottoId
                ? { ...i, schedaProvvisoria: false }
                : i
            )
          );
          setEditing((cur) =>
            cur && cur.prodottoId === row.prodottoId
              ? { ...cur, schedaProvvisoria: false }
              : cur
          );
        }
      });
    }
  }

  function saveEdit() {
    if (!editing) return;
    if (!categoria) {
      setError("Seleziona la categoria di utilizzo.");
      return;
    }
    if (!titolo.trim()) {
      setError("Inserisci il titolo magazzino.");
      return;
    }
    if (
      titoloModificato &&
      confermaTitolo.trim() !== (editing.titoloMagazzino ?? "").trim()
    ) {
      setError(
        "Per modificare il titolo ricopia esattamente il titolo attuale nella conferma."
      );
      return;
    }
    if (needsRiserva && riserva === "") {
      setError("Imposta la quantità minima di riserva.");
      return;
    }
    startTransition(async () => {
      const res = await updateMagazzinoProdottoAction({
        catalogKind,
        prodottoId: editing.prodottoId,
        categoriaUtilizzo: categoria,
        titoloMagazzino: titolo.trim(),
        confermaTitoloAttuale: titoloModificato
          ? confermaTitolo.trim()
          : undefined,
        quantita: needsRiserva ? quantita : 0,
        quantitaRiserva: needsRiserva
          ? riserva === ""
            ? null
            : Number(riserva)
          : null,
        unita,
        repartoId: null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const item = {
        ...res.item,
        barcode,
        fotoPath,
        schedaProvvisoria,
      };
      if (!categoriaRequiresMagazzino(item.categoriaUtilizzo)) {
        setItems((prev) =>
          prev.filter(
            (i) =>
              !(
                i.prodottoId === item.prodottoId &&
                i.catalogKind === item.catalogKind
              )
          )
        );
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.prodottoId === item.prodottoId &&
            i.catalogKind === item.catalogKind
              ? item
              : i
          )
        );
      }
      setEditing(null);
      setError(null);
    });
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento {kindLabel}…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Solo articoli con scorta:{" "}
            <strong>Mat. Consumo</strong> e{" "}
            <strong>Mat. Poco Consumo</strong>. Il{" "}
            <strong>titolo magazzino</strong> rende l’articolo leggibile in
            deposito; la modifica successiva richiede conferma testuale.
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Cerca</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca codice, titolo, nome…"
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Titolo magazzino *</span>
              <input
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Es. Folcone legno 80 cm"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Nome catalogo: {editing.nome}
                {titoloGiaImpostato
                  ? " · Per cambiarlo ricopia il titolo attuale sotto."
                  : " · Prima impostazione libera."}
              </span>
            </label>
            {titoloModificato ? (
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-amber-900">
                  Conferma: ricopia il titolo attuale
                </span>
                <input
                  value={confermaTitolo}
                  onChange={(e) => setConfermaTitolo(e.target.value)}
                  placeholder={editing.titoloMagazzino ?? ""}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
                />
              </label>
            ) : null}
            <label className="text-sm sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block font-medium">
                Categoria utilizzo *
              </span>
              <select
                value={categoria}
                onChange={(e) =>
                  setCategoria(e.target.value as CategoriaUtilizzo | "")
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">— seleziona —</option>
                {CATEGORIA_UTILIZZO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {!o.requiresMagazzino ? " (no magazzino)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Barcode</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-slate-700">
                  {barcode || "— non associato —"}
                </span>
                <button
                  type="button"
                  onClick={() => setAssociaOpen(true)}
                  className="text-sm font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900"
                >
                  Associa barcode
                </button>
              </div>
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Foto prodotto</span>
              <div className="flex flex-wrap items-center gap-3">
                {fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotoUrl}
                    alt="Foto prodotto"
                    className="h-16 w-16 rounded-lg border border-[var(--border)] object-cover"
                  />
                ) : (
                  <span className="text-xs text-slate-600">
                    {fotoPath ? "Foto presente" : "— nessuna foto —"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAssociaFotoOpen(true)}
                  className="text-sm font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900"
                >
                  Associa foto
                </button>
              </div>
            </div>
            {schedaProvvisoria ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:col-span-2">
                Scheda provvisoria: non risulta ancora collegata a una fattura
                ricevuta. Se compare in una fattura, lo stato si aggiorna
                automaticamente (una sola volta).
              </p>
            ) : null}
            {needsRiserva ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">
                    Giacenza attuale
                  </span>
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
                  <span className="mb-1 flex items-center gap-1.5 font-medium">
                    Quantità minima di riserva
                    <RiservaInfoTip />
                  </span>
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
                    placeholder="Minimo da mantenere in magazzino"
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
              </>
            ) : categoria === "acquisti_occasionali" ? (
              <p className="text-sm text-[var(--muted)] sm:col-span-2">
                Acquisti Occasionali: l’articolo uscirà dall’elenco magazzino
                (nessuna giacenza/riserva).
              </p>
            ) : null}
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

      {associaOpen && editing ? (
        <AssociaBarcodeModal
          catalogKind={catalogKind}
          prodottoId={editing.prodottoId}
          prodottoLabel={`${editing.codice} — ${labelMagazzinoArticolo({ titoloMagazzino: titolo || editing.titoloMagazzino, nome: editing.nome })}`}
          barcodeAttuale={barcode}
          onClose={() => setAssociaOpen(false)}
          onSaved={(b) => {
            setBarcode(b);
            setItems((prev) =>
              prev.map((i) =>
                i.prodottoId === editing.prodottoId ? { ...i, barcode: b } : i
              )
            );
          }}
        />
      ) : null}

      {associaFotoOpen && editing ? (
        <AssociaFotoModal
          catalogKind={catalogKind}
          prodottoId={editing.prodottoId}
          prodottoLabel={`${editing.codice} — ${labelMagazzinoArticolo({ titoloMagazzino: titolo || editing.titoloMagazzino, nome: editing.nome })}`}
          fotoPath={fotoPath}
          onClose={() => setAssociaFotoOpen(false)}
          onSaved={(path, url) => {
            setFotoPath(path);
            setFotoUrl(url);
            setItems((prev) =>
              prev.map((i) =>
                i.prodottoId === editing.prodottoId
                  ? { ...i, fotoPath: path }
                  : i
              )
            );
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Codice</th>
              <th className="px-4 py-3">Titolo</th>
              <th className="px-4 py-3">Utilizzo</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3">Giacenza attuale</th>
              <th className="px-4 py-3">Riserva min.</th>
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
                  {row.schedaProvvisoria ? (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-950">
                      provv.
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[24vw] px-4 py-3 font-medium">
                  <span className="line-clamp-2">
                    {labelMagazzinoArticolo(row)}
                  </span>
                  {row.titoloMagazzino ? (
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-[var(--muted)]">
                      {row.nome}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] font-normal text-amber-800">
                      Titolo da impostare
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.categoriaUtilizzo ? (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                      {labelCategoriaUtilizzo(row.categoriaUtilizzo)}
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-950">
                      Da classificare
                    </span>
                  )}
                </td>
                <td className="max-w-[8rem] truncate px-4 py-3 font-mono text-[11px] text-[var(--muted)]">
                  {row.barcode || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.quantita.toLocaleString("it-IT")} {row.unita}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.quantitaRiserva != null
                    ? `${row.quantitaRiserva.toLocaleString("it-IT")} ${row.unita}`
                    : "—"}
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
                  colSpan={8}
                  className="px-4 py-10 text-center text-[var(--muted)]"
                >
                  Nessun articolo in magazzino (o tutti classificaati come
                  Acquisti Occasionali).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
