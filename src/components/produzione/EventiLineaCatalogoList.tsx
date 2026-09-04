"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  createEventoLineaCatalogoAction,
  listEventiLineaCatalogoAction,
} from "@/app/actions/produzione-macchinari";
import type { EventoLineaCatalogo } from "@/lib/produzione/macchinari";

const INFO_TESTO =
  "Un evento di linea è una procedura ufficiale della produzione (pausa caffè, pausa pranzo, fine turno, ripresa o altre definite dall’amministratore). Il responsabile lo avvia dalla panoramica: se l’evento richiede lo spegnimento, tutte le macchine accese devono andare Off (dichiarazione operatore o comando IoT). Ogni avvio e ogni On/Off restano nel registro per la tracciabilità ISO 9001.";

export function EventiLineaCatalogoList() {
  const infoId = useId();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<EventoLineaCatalogo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [sintesi, setSintesi] = useState("");
  const [dettagli, setDettagli] = useState("");
  const [richiedeOff, setRichiedeOff] = useState(true);

  function load() {
    start(async () => {
      const res = await listEventiLineaCatalogoAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
      setIsAdmin(res.isAdmin);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!infoOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setInfoOpen(false);
    }
    function onDoc(e: MouseEvent) {
      const root = document.getElementById(infoId);
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setInfoOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [infoOpen, infoId]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Eventi di linea</h3>
          <div id={infoId} className="relative">
            <button
              type="button"
              aria-label="Che cosa sono gli eventi di linea"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((v) => !v)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              i
            </button>
            {infoOpen ? (
              <div
                role="tooltip"
                className="absolute left-0 top-7 z-20 w-80 max-w-[min(20rem,calc(100vw-3rem))] rounded-lg border border-[var(--border)] bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg"
              >
                {INFO_TESTO}
              </div>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            {formOpen ? "Annulla" : "Aggiungi evento"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isAdmin && formOpen ? (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-slate-50 p-3">
          <p className="text-xs text-[var(--muted)]">
            Nuovo evento ufficiale. Verrà approvato subito e visibile in tutte le
            aree.
          </p>
          <label className="block text-xs text-[var(--muted)]">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Riga riassuntiva
            <input
              value={sintesi}
              onChange={(e) => setSintesi(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Dettagli e spiegazione
            <textarea
              value={dettagli}
              onChange={(e) => setDettagli(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={richiedeOff}
              onChange={(e) => setRichiedeOff(e.target.checked)}
            />
            Richiede spegnimento delle macchine accese
          </label>
          <button
            type="button"
            disabled={pending || !nome.trim() || !sintesi.trim() || !dettagli.trim()}
            onClick={() =>
              start(async () => {
                const res = await createEventoLineaCatalogoAction({
                  nome: nome.trim(),
                  sintesi: sintesi.trim(),
                  dettagli: dettagli.trim(),
                  richiedeSpegnimento: richiedeOff,
                });
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                setNome("");
                setSintesi("");
                setDettagli("");
                setRichiedeOff(true);
                setFormOpen(false);
                setOpenId(res.item.id);
                load();
              })
            }
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva evento
          </button>
        </div>
      ) : null}

      <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-sm text-[var(--muted)]">
            {pending ? "Caricamento catalogo…" : "Nessun evento di linea in catalogo."}
          </li>
        ) : (
          items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.nome}</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {item.sintesi}
                    </span>
                  </span>
                  <span className="mt-0.5 shrink-0 text-xs text-[var(--muted)]">
                    {open ? "▲" : "▼"}
                  </span>
                </button>
                {open ? (
                  <div className="space-y-2 border-t border-[var(--border)] bg-slate-50 px-3 py-3">
                    <p className="text-sm leading-relaxed text-slate-700">
                      {item.dettagli}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {item.richiedeSpegnimento
                        ? "All’avvio: le macchine accese devono andare Off."
                        : "All’avvio: non richiede spegnimento. Si documenta la ripresa."}
                      {" · "}
                      Versione {item.versione} · {item.documentoStato}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
