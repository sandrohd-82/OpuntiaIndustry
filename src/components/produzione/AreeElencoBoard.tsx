"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { FaPlus, FaXmark } from "react-icons/fa6";
import {
  createProduzioneAreaAction,
  listProduzioneAreeAction,
} from "@/app/actions/produzione-aree";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import { slugArea, type ProduzioneArea } from "@/lib/produzione/aree-posti";
import { labelDocumentoStato } from "@/lib/produzione/processi";

function notifyAreeNav() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
  }
}

export function AreeElencoBoard() {
  const titleId = useId();
  const [items, setItems] = useState<ProduzioneArea[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [codiceTouched, setCodiceTouched] = useState(false);
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [richiedeBilancioMassa, setRichiedeBilancioMassa] = useState(false);
  const [mostraInMenu, setMostraInMenu] = useState(true);

  function load() {
    startTransition(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setError(null);
      setItems(res.items);
      setReady(true);
    });
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setNome("");
    setCodice("");
    setCodiceTouched(false);
    setDescrizione("");
    setNote("");
    setRichiedeBilancioMassa(false);
    setMostraInMenu(true);
    setError(null);
    setOpen(true);
  }

  function closeCreate() {
    setOpen(false);
  }

  function saveCreate() {
    startTransition(async () => {
      const res = await createProduzioneAreaAction({
        nome,
        codice: codice || slugArea(nome),
        descrizione,
        note,
        richiedeBilancioMassa,
        mostraInMenu,
        attivo: true,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOpen(false);
      notifyAreeNav();
      load();
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCreate();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento elenco aree…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Catalogo aree produttive. Da qui aggiungi una nuova area: comparirà
          nel menu Gestione Aree.
        </p>
        <ActionGate actionKey={AZ.nuovaArea}>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuova area
        </button>
        </ActionGate>
      </div>

      {error && !open ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Codice</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Doc.</th>
              <th className="px-4 py-3">Postazioni</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono font-semibold">{a.codice}</td>
                <td className="px-4 py-3">
                  <div>{a.nome}</div>
                  {a.descrizione ? (
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {a.descrizione}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {labelDocumentoStato(a.documentoStato)}
                  <span className="ml-1 text-xs text-[var(--muted)]">
                    v{a.versione}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {a.posti.filter((p) => p.attivo).length}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.mostraInMenu ? (
                    <Link
                      href={`/app/produzione/gestione-aree/${a.codice}`}
                      className="text-sm font-medium text-[var(--primary)] hover:underline"
                    >
                      Apri area
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">
                      Nascosta dal menu
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Nessuna area. Creane una con Nuova area.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          role="presentation"
          onClick={closeCreate}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-lg font-semibold">
                  Nuova area
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Documento in bozza. Dopo il salvataggio l’area compare nel
                  menu se “Mostra in menu” è attivo.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                className="rounded p-1 text-[var(--muted)] hover:bg-slate-50"
                aria-label="Chiudi"
              >
                <FaXmark size={14} />
              </button>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Nome</span>
                <input
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    if (!codiceTouched) setCodice(slugArea(e.target.value));
                  }}
                  placeholder="es. Estrazione"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Codice</span>
                <input
                  value={codice}
                  onChange={(e) => {
                    setCodiceTouched(true);
                    setCodice(slugArea(e.target.value));
                  }}
                  placeholder="es. estrazione"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Descrizione</span>
                <textarea
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mostraInMenu}
                  onChange={(e) => setMostraInMenu(e.target.checked)}
                />
                Mostra in menu
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={richiedeBilancioMassa}
                  onChange={(e) => setRichiedeBilancioMassa(e.target.checked)}
                />
                Richiede bilancio di massa
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreate}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || !nome.trim() || !codice.trim()}
                onClick={saveCreate}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Crea area"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
