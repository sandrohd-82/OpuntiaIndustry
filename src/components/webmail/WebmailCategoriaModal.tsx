"use client";

import { useEffect, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  createWebmailCategoriaAction,
  setWebmailMessaggioCategoriaAction,
} from "@/app/actions/webmail";
import type { WebmailCategoria } from "@/lib/webmail/types";

type Props = {
  open: boolean;
  messaggioId: string;
  categorie: WebmailCategoria[];
  currentCategoriaId: string | null;
  onClose: () => void;
  onDone: (categoriaId: string, learnMode: string) => void;
  onCategoriaCreated: (c: WebmailCategoria) => void;
};

export function WebmailCategoriaModal({
  open,
  messaggioId,
  categorie,
  currentCategoriaId,
  onClose,
  onDone,
  onCategoriaCreated,
}: Props) {
  const [selected, setSelected] = useState(currentCategoriaId ?? "");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#0ea5e9");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setSelected(currentCategoriaId ?? "");
      setNewName("");
      setError(null);
    }
  }, [open, currentCategoriaId]);

  if (!open) return null;

  function saveExisting() {
    if (!selected) {
      setError("Seleziona una categoria.");
      return;
    }
    startTransition(async () => {
      const res = await setWebmailMessaggioCategoriaAction({
        messaggioId,
        categoriaId: selected,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onDone(selected, res.learnMode);
      onClose();
    });
  }

  function createAndAssign() {
    if (newName.trim().length < 2) {
      setError("Nome categoria troppo corto.");
      return;
    }
    startTransition(async () => {
      const created = await createWebmailCategoriaAction({
        nome: newName.trim(),
        colore: newColor,
      });
      if (!created.success) {
        setError(created.error);
        return;
      }
      onCategoriaCreated(created.item);
      const res = await setWebmailMessaggioCategoriaAction({
        messaggioId,
        categoriaId: created.item.id,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onDone(created.item.id, res.learnMode);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sposta in categoria</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>
        {error ? (
          <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800">
            {error}
          </p>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Categoria esistente</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <option value="">— Seleziona —</option>
            {categorie.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={saveExisting}
          className="mt-3 w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Sposta qui
        </button>
        <div className="my-4 border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-xs font-medium text-slate-700">
            Oppure crea nuova categoria
          </p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-10 w-12 rounded border border-[var(--border)]"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={createAndAssign}
            className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Crea e sposta
          </button>
        </div>
      </div>
    </div>
  );
}
