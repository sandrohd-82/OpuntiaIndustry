"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  archiveRicercaAction,
  createRicercaAction,
  listRicercheAction,
} from "@/app/actions/ricerca-sviluppo";
import {
  creaTipoVoceAction,
  listProdottiRicercaAction,
  listTipiVoceAction,
} from "@/app/actions/ricerca-sviluppo-note";
import type {
  RsProdottoScelta,
  RsRicerca,
  RsTipo,
  RsTipoVoce,
} from "@/lib/ricerca-sviluppo/types";

type Props = {
  /** Se null: archivio unificato (tutte le tipologie). */
  tipo: RsTipo | null;
  mode: "nuova" | "elenco" | "archivio";
};

const STATO_LABEL: Record<RsRicerca["stato"], string> = {
  bozza: "Bozza",
  in_corso: "In corso",
  approvato: "Approvato",
  archiviato: "Archiviato",
};

const TIPO_LABEL: Record<RsTipo, string> = {
  processo: "Processo",
  materia_prima: "Materia prima",
};

export function RsRicercheBoard({ tipo, mode }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RsRicerca[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [tipi, setTipi] = useState<RsTipoVoce[]>([]);
  const [tipoVoceId, setTipoVoceId] = useState("");
  const [nuovoTipo, setNuovoTipo] = useState("");
  const [prodotti, setProdotti] = useState<RsProdottoScelta[]>([]);
  const [soggettoModo, setSoggettoModo] = useState<"catalogo" | "libero" | "nuovo">(
    "catalogo"
  );
  const [prodottoId, setProdottoId] = useState("");
  const [soggettoLibero, setSoggettoLibero] = useState("");
  const [versione, setVersione] = useState(1);
  const [dataInizio, setDataInizio] = useState("");
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await listRicercheAction({
        tipo: tipo ?? null,
        archivio: mode === "archivio",
      });
      if (!res.success) {
        setError(res.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    if (mode !== "nuova") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, mode]);

  useEffect(() => {
    if (mode !== "nuova" || !tipo) return;
    startTransition(async () => {
      const [tipiRes, prodRes] = await Promise.all([
        listTipiVoceAction(tipo),
        listProdottiRicercaAction(),
      ]);
      if (!tipiRes.success) {
        setError(tipiRes.error);
        return;
      }
      if (!prodRes.success) {
        setError(prodRes.error);
        return;
      }
      setTipi(tipiRes.items);
      setProdotti(prodRes.items);
      setTipoVoceId((prev) => prev || tipiRes.items[0]?.id || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, mode]);

  function aggiungiTipo() {
    if (!tipo || !nuovoTipo.trim()) return;
    startTransition(async () => {
      const res = await creaTipoVoceAction({ ambito: tipo, nome: nuovoTipo });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTipi((prev) =>
        [...prev, res.item].sort((a, b) => a.nome.localeCompare(b.nome, "it"))
      );
      setTipoVoceId(res.item.id);
      setNuovoTipo("");
      setError(null);
    });
  }

  function create() {
    if (!tipo) {
      setError("Tipologia ricerca non specificata.");
      return;
    }
    startTransition(async () => {
      const res = await createRicercaAction({
        tipo,
        tipoVoceId,
        soggettoModo,
        prodottoProprioId: soggettoModo === "catalogo" ? prodottoId : null,
        soggettoLibero: soggettoModo === "catalogo" ? "" : soggettoLibero,
        titolo,
        descrizione,
        versione,
        dataInizioPresunta: dataInizio,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push(`/app/ricerca-sviluppo/ricerca/${res.item.id}`);
    });
  }

  function archive(id: string) {
    startTransition(async () => {
      const res = await archiveRicercaAction(id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      reload();
    });
  }

  if (mode === "nuova") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Nuova ricerca</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Stato iniziale: Bozza. La versione la imposti tu.
          </p>
          <label className="mt-3 block text-xs font-medium">Tipo di ricerca</label>
          <select
            value={tipoVoceId}
            onChange={(e) => setTipoVoceId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Scegli…</option>
            {tipi.map((voce) => (
              <option key={voce.id} value={voce.id}>
                {voce.nome}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              value={nuovoTipo}
              onChange={(e) => setNuovoTipo(e.target.value.slice(0, 80))}
              maxLength={80}
              placeholder="Nuova voce, es. essiccazione"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={pending || !nuovoTipo.trim()}
              onClick={aggiungiTipo}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
            >
              Aggiungi
            </button>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="text-xs font-medium">Soggetto</legend>
            {(
              [
                ["catalogo", "Prodotto Agrinsicilia da catalogo"],
                ["libero", "Non riguarda un prodotto specifico"],
                ["nuovo", "Nuovo prodotto, non ancora a catalogo"],
              ] as const
            ).map(([valore, etichetta]) => (
              <label key={valore} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="soggetto"
                  checked={soggettoModo === valore}
                  onChange={() => setSoggettoModo(valore)}
                />
                {etichetta}
              </label>
            ))}
          </fieldset>
          {soggettoModo === "catalogo" ? (
            <select
              value={prodottoId}
              onChange={(e) => setProdottoId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Scegli il prodotto…</option>
              {prodotti.map((prodotto) => (
                <option key={prodotto.id} value={prodotto.id}>
                  {prodotto.codice} — {prodotto.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={soggettoLibero}
              onChange={(e) => setSoggettoLibero(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder={
                soggettoModo === "nuovo"
                  ? "Nome del prodotto nuovo"
                  : "Di che cosa tratta la ricerca"
              }
              className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          )}

          <label className="mt-3 block text-xs font-medium">Titolo</label>
          <input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value.slice(0, 200))}
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="Es. Ottimizzazione essiccazione lotto X"
          />
          <label className="mt-3 block text-xs font-medium">Descrizione</label>
          <textarea
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value.slice(0, 5000))}
            rows={4}
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium">
              Versione
              <input
                type="number"
                min={1}
                max={999}
                value={versione}
                onChange={(e) => setVersione(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              Data presunta inizio
              <input
                type="date"
                value={dataInizio}
                onChange={(e) => setDataInizio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={
              pending ||
              !titolo.trim() ||
              !tipoVoceId ||
              !dataInizio ||
              (soggettoModo === "catalogo" ? !prodottoId : !soggettoLibero.trim())
            }
            onClick={create}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Creazione…" : "Crea e apri timeline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {pending && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : null}
      {items.length === 0 && !pending ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nessuna ricerca in questa sezione.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/ricerca-sviluppo/ricerca/${r.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {r.titolo}
                </Link>
                <p className="text-xs text-[var(--muted)]">
                  {!tipo ? `${TIPO_LABEL[r.tipo]} · ` : null}
                  {r.tipoVoceNome ? `${r.tipoVoceNome} · ` : null}
                  {STATO_LABEL[r.stato]} · v{r.versione}
                  {r.dataInizioPresunta
                    ? ` · inizio ${new Date(r.dataInizioPresunta + "T12:00:00").toLocaleDateString("it-IT")}`
                    : null}
                </p>
              </div>
              {mode === "elenco" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => archive(r.id)}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-slate-50"
                >
                  Archivia
                </button>
              ) : null}
              <Link
                href={`/app/ricerca-sviluppo/ricerca/${r.id}`}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
              >
                Apri
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
