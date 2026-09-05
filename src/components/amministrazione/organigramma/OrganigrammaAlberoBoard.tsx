"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listPersoneAction,
  movePersonaTreeAction,
  reorderPersoneAction,
} from "@/app/actions/organigramma";
import {
  nestPersone,
  personaLabel,
  type OrganigrammaPersona,
} from "@/lib/amministrazione/organigramma";

function wouldCycle(
  personaId: string,
  newParentId: string | null,
  byId: Map<string, OrganigrammaPersona>
): boolean {
  if (!newParentId) return false;
  if (newParentId === personaId) return true;
  const seen = new Set<string>([personaId]);
  let cursor: string | null = newParentId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

function initials(p: OrganigrammaPersona): string {
  return `${p.nome.slice(0, 1)}${p.cognome.slice(0, 1)}`.toUpperCase();
}

export function OrganigrammaAlberoBoard() {
  const [items, setItems] = useState<OrganigrammaPersona[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await listPersoneAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.items);
    setIsAdmin(res.isAdmin);
  }

  useEffect(() => {
    void reload();
  }, []);

  const tree = useMemo(() => nestPersone(items), [items]);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  async function linkTo(parentId: string, childId: string) {
    if (wouldCycle(childId, parentId, byId)) {
      setError("Il collegamento creerebbe un ciclo.");
      return;
    }
    const siblings = items.filter(
      (p) => p.parentId === parentId && p.id !== childId
    );
    const sortOrder =
      siblings.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10;
    setBusy(true);
    const res = await movePersonaTreeAction({
      personaId: childId,
      parentId,
      sortOrder,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSelectedId(null);
    setError(null);
    await reload();
  }

  async function unlink(personaId: string) {
    setBusy(true);
    const res = await movePersonaTreeAction({
      personaId,
      parentId: null,
      sortOrder: 10,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSelectedId(null);
    setError(null);
    await reload();
  }

  async function applyOrder(parentId: string | null, orderedIds: string[]) {
    if (orderedIds.length < 2) return;
    setBusy(true);
    const res = await reorderPersoneAction({ parentId, orderedIds });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setError(null);
    await reload();
  }

  function siblingsOf(parentId: string | null) {
    return items
      .filter((p) => p.parentId === parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.cognome.localeCompare(b.cognome, "it")
      );
  }

  async function reorderBefore(dragPersonaId: string, targetId: string) {
    const drag = byId.get(dragPersonaId);
    const target = byId.get(targetId);
    if (!drag || !target || drag.parentId !== target.parentId) {
      setError(
        "Il trascinamento cambia solo la posizione. Per collegare due operatori clicca prima una foto e poi l’altra."
      );
      return;
    }
    const siblings = siblingsOf(drag.parentId);
    const without = siblings.filter((p) => p.id !== dragPersonaId);
    const idx = without.findIndex((p) => p.id === targetId);
    if (idx < 0) return;
    without.splice(idx, 0, drag);
    await applyOrder(
      drag.parentId,
      without.map((p) => p.id)
    );
  }

  async function reorderAtEnd(dragPersonaId: string, parentId: string | null) {
    const drag = byId.get(dragPersonaId);
    if (!drag || drag.parentId !== parentId) {
      setError(
        "Il trascinamento cambia solo la posizione. Per collegare due operatori clicca prima una foto e poi l’altra."
      );
      return;
    }
    const siblings = siblingsOf(parentId);
    const without = siblings.filter((p) => p.id !== dragPersonaId);
    without.push(drag);
    await applyOrder(
      parentId,
      without.map((p) => p.id)
    );
  }

  function onPhotoClick(id: string) {
    if (!isAdmin || busy) return;
    if (!selectedId) {
      setSelectedId(id);
      setError(null);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    void linkTo(selectedId, id);
  }

  function onDropCard(targetId: string) {
    if (!dragId || !isAdmin || busy || dragId === targetId) return;
    void reorderBefore(dragId, targetId);
    setDragId(null);
    setOverId(null);
  }

  function onDropEnd(parentId: string | null) {
    if (!dragId || !isAdmin || busy) return;
    void reorderAtEnd(dragId, parentId);
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Organigramma a cascata.{" "}
        {isAdmin
          ? "Clicca una foto e poi un’altra per creare la linea di collegamento (la prima è il superiore). Trascina una scheda per cambiare solo la posizione a sinistra/destra nello stesso livello."
          : "Clicca il nome per aprire la scheda operatore."}
      </p>
      {selected && isAdmin ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <span>
            Selezionato: <strong>{personaLabel(selected)}</strong>. Clicca la
            foto di un collaboratore per collegarlo sotto.
          </span>
          <button
            type="button"
            className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-medium"
            onClick={() => void unlink(selected.id)}
          >
            Porta a primo livello
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-sky-800 hover:underline"
            onClick={() => setSelectedId(null)}
          >
            Annulla
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {tree.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nessun operatore. Aggiungili da Elenco e mansioni, poi collega le foto.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-gradient-to-b from-slate-50 to-white px-6 py-8">
          <div className="flex min-w-max items-start justify-center gap-8">
            {tree.map((n) => (
              <OrgNode
                key={n.id}
                node={n}
                isAdmin={isAdmin}
                dragId={dragId}
                overId={overId}
                selectedId={selectedId}
                setDragId={setDragId}
                setOverId={setOverId}
                onDrop={onDropCard}
                onDropEnd={onDropEnd}
                onPhotoClick={onPhotoClick}
              />
            ))}
            <EndSlot
              parentId={null}
              isAdmin={isAdmin}
              dragId={dragId}
              overId={overId}
              siblingCount={tree.length}
              setOverId={setOverId}
              onDropEnd={onDropEnd}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OrgNode({
  node,
  isAdmin,
  dragId,
  overId,
  selectedId,
  setDragId,
  setOverId,
  onDrop,
  onDropEnd,
  onPhotoClick,
}: {
  node: OrganigrammaPersona;
  isAdmin: boolean;
  dragId: string | null;
  overId: string | null;
  selectedId: string | null;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onDropEnd: (parentId: string | null) => void;
  onPhotoClick: (id: string) => void;
}) {
  const figli = node.figli ?? [];
  const dropping = overId === node.id && dragId && overId !== dragId;

  return (
    <div className="flex flex-col items-center">
      <PersonaCard
        node={node}
        isAdmin={isAdmin}
        dragging={dragId === node.id}
        dropping={Boolean(dropping)}
        selected={selectedId === node.id}
        setDragId={setDragId}
        setOverId={setOverId}
        onDrop={onDrop}
        onPhotoClick={onPhotoClick}
      />
      {figli.length ? (
        <>
          <div className="h-6 w-px bg-slate-300" />
          <div className="flex items-start">
            {figli.map((c, i) => (
              <div key={c.id} className="relative flex flex-col items-center px-4">
                {figli.length > 1 ? (
                  <span
                    className={`absolute top-0 h-px bg-slate-300 ${
                      i === 0
                        ? "left-1/2 right-0"
                        : i === figli.length - 1
                          ? "left-0 right-1/2"
                          : "left-0 right-0"
                    }`}
                  />
                ) : null}
                <div className="h-6 w-px bg-slate-300" />
                <OrgNode
                  node={c}
                  isAdmin={isAdmin}
                  dragId={dragId}
                  overId={overId}
                  selectedId={selectedId}
                  setDragId={setDragId}
                  setOverId={setOverId}
                  onDrop={onDrop}
                  onDropEnd={onDropEnd}
                  onPhotoClick={onPhotoClick}
                />
              </div>
            ))}
            <EndSlot
              parentId={node.id}
              isAdmin={isAdmin}
              dragId={dragId}
              overId={overId}
              siblingCount={figli.length}
              setOverId={setOverId}
              onDropEnd={onDropEnd}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function EndSlot({
  parentId,
  isAdmin,
  dragId,
  overId,
  siblingCount,
  setOverId,
  onDropEnd,
}: {
  parentId: string | null;
  isAdmin: boolean;
  dragId: string | null;
  overId: string | null;
  siblingCount: number;
  setOverId: (id: string | null) => void;
  onDropEnd: (parentId: string | null) => void;
}) {
  if (!isAdmin || siblingCount < 2) return null;
  const slotId = `end:${parentId ?? "root"}`;
  const active = Boolean(dragId) && overId === slotId;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOverId(slotId);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropEnd(parentId);
      }}
      className={`mt-8 flex h-24 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed transition ${
        active
          ? "border-amber-400 bg-amber-50"
          : dragId
            ? "border-slate-300 bg-slate-50"
            : "border-transparent"
      }`}
      title="Rilascia qui per spostare in fondo"
    >
      {dragId ? <span className="text-xs text-slate-400">Fine</span> : null}
    </div>
  );
}

function PersonaCard({
  node,
  isAdmin,
  dragging,
  dropping,
  selected,
  setDragId,
  setOverId,
  onDrop,
  onPhotoClick,
}: {
  node: OrganigrammaPersona;
  isAdmin: boolean;
  dragging: boolean;
  dropping: boolean;
  selected: boolean;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onPhotoClick: (id: string) => void;
}) {
  const ruolo =
    [node.repartoNome, node.mansioni.map((m) => m.nome).join(", ")]
      .filter(Boolean)
      .join(" · ") || "Senza mansione";

  return (
    <div
      draggable={isAdmin}
      onDragStart={(e) => {
        if (!isAdmin) return;
        const target = e.target as HTMLElement;
        if (target.closest("[data-link-photo]")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(node.id);
      }}
      onDragEnd={() => {
        setDragId(null);
        setOverId(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOverId(node.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(node.id);
      }}
      className={`w-44 rounded-2xl border bg-white p-3 text-center shadow-sm transition ${
        selected
          ? "border-sky-500 ring-2 ring-sky-300"
          : dropping
            ? "border-amber-400 bg-amber-50 shadow-md"
            : "border-slate-200"
      } ${dragging ? "opacity-40" : ""} ${
        isAdmin ? "cursor-grab active:cursor-grabbing" : ""
      } ${node.inForza ? "" : "opacity-70"}`}
    >
      <button
        type="button"
        data-link-photo
        disabled={!isAdmin}
        onClick={(e) => {
          e.stopPropagation();
          onPhotoClick(node.id);
        }}
        className="mx-auto block cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        title={isAdmin ? "Clicca la foto per collegare" : personaLabel(node)}
      >
        {node.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.fotoUrl}
            alt={personaLabel(node)}
            draggable={false}
            className={`h-16 w-16 rounded-full object-cover ring-2 ${
              selected ? "ring-sky-500" : "ring-slate-200"
            }`}
          />
        ) : (
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-2 ${
              selected ? "ring-sky-500" : "ring-slate-200"
            }`}
          >
            {initials(node)}
          </span>
        )}
      </button>
      <Link
        href={`/app/amministrazione/organigramma/elenco-e-mansioni/${node.id}`}
        className="mt-2 block text-sm font-semibold leading-tight text-slate-900 hover:underline"
        onClick={(e) => {
          if (dragging) e.preventDefault();
        }}
      >
        {node.cognome} {node.nome}
      </Link>
      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
        {ruolo}
      </span>
      {!node.inForza ? (
        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
          Non in forza
        </span>
      ) : null}
    </div>
  );
}
