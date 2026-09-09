"use client";

import { useEffect, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  bulkSetWebmailMessaggiCategoriaAction,
  createWebmailCategoriaAction,
  setWebmailMessaggioCategoriaAction,
} from "@/app/actions/webmail";
import { normalizeSenderEmail } from "@/lib/webmail/category-learn";
import type { WebmailCategoria } from "@/lib/webmail/types";

type Props = {
  open: boolean;
  messaggioIds: string[];
  categorie: WebmailCategoria[];
  currentCategoriaId: string | null;
  fromAddresses: string[];
  onClose: () => void;
  onDone: (categoriaId: string, learnMode: string) => void;
  onCategoriaCreated: (c: WebmailCategoria) => void;
};

export function WebmailCategoriaModal({
  open,
  messaggioIds,
  categorie,
  currentCategoriaId,
  fromAddresses,
  onClose,
  onDone,
  onCategoriaCreated,
}: Props) {
  const [selected, setSelected] = useState(currentCategoriaId ?? "");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#0ea5e9");
  const [moveAllFromAddress, setMoveAllFromAddress] = useState(false);
  const [autoMoveNew, setAutoMoveNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const uniqueAddresses = [
    ...new Set(
      fromAddresses
        .map((a) => normalizeSenderEmail(a))
        .filter((a) => a.includes("@"))
    ),
  ];
  const addressLabel =
    uniqueAddresses.length === 1
      ? uniqueAddresses[0]
      : uniqueAddresses.length > 1
        ? uniqueAddresses.join(", ")
        : null;

  useEffect(() => {
    if (open) {
      setSelected(currentCategoriaId ?? "");
      setNewName("");
      setMoveAllFromAddress(false);
      setAutoMoveNew(false);
      setError(null);
      setPending(false);
    }
  }, [open, currentCategoriaId]);

  if (!open) return null;

  const senderOptions = {
    moveAllFromAddress,
    autoMoveNew,
  };

  async function saveExisting() {
    if (messaggioIds.length === 0) {
      setError("Nessuna mail selezionata.");
      return;
    }
    if (!selected) {
      setError("Seleziona una categoria.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await assignCategoria(selected);
      if (!res.success) {
        setError(res.error);
        setPending(false);
        return;
      }
      onDone(selected, res.learnMode);
      onClose();
    } catch {
      setError("Spostamento non riuscito.");
      setPending(false);
    }
  }

  async function assignCategoria(
    categoriaId: string
  ): Promise<
    { success: true; learnMode: string } | { success: false; error: string }
  > {
    if (messaggioIds.length === 1 && messaggioIds[0]) {
      const res = await setWebmailMessaggioCategoriaAction({
        messaggioId: messaggioIds[0],
        categoriaId,
        ...senderOptions,
      });
      if (!res.success) return res;
      return { success: true, learnMode: res.learnMode };
    }
    const res = await bulkSetWebmailMessaggiCategoriaAction({
      messaggioIds,
      categoriaId,
      ...senderOptions,
    });
    if (!res.success) return res;
    return { success: true, learnMode: res.learnMode };
  }

  async function createAndAssign() {
    if (newName.trim().length < 2) {
      setError("Nome categoria troppo corto.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await createWebmailCategoriaAction({
        nome: newName.trim(),
        colore: newColor,
      });
      if (!created.success) {
        setError(created.error);
        setPending(false);
        return;
      }
      onCategoriaCreated(created.item);
      const res = await assignCategoria(created.item.id);
      if (!res.success) {
        setError(res.error);
        setPending(false);
        return;
      }
      onDone(created.item.id, res.learnMode);
      onClose();
    } catch {
      setError("Creazione categoria non riuscita.");
      setPending(false);
    }
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
        {addressLabel ? (
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Indirizzo:{" "}
            <span className="font-semibold break-all text-slate-900">
              {addressLabel}
            </span>
          </p>
        ) : (
          <p className="mb-3 text-xs text-slate-500">
            Indirizzo mittente non disponibile.
          </p>
        )}
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
        {addressLabel ? (
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={moveAllFromAddress}
                onChange={(e) => setMoveAllFromAddress(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Sposta tutte le mail già presenti con questo indirizzo in questa
                categoria
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={autoMoveNew}
                onChange={(e) => setAutoMoveNew(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Sposta automaticamente tutte le nuove mail in ingresso con questo
                indirizzo
              </span>
            </label>
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending || !selected}
          onClick={() => void saveExisting()}
          className="mt-3 w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Spostamento…" : "Sposta qui"}
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
            onClick={() => void createAndAssign()}
            className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Crea e sposta
          </button>
        </div>
      </div>
    </div>
  );
}
