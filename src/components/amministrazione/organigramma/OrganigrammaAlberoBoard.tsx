"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listPersoneAction,
  movePersonaTreeAction,
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

export function OrganigrammaAlberoBoard() {
  const [items, setItems] = useState<OrganigrammaPersona[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | "root" | null>(null);
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

  async function move(personaId: string, parentId: string | null) {
    if (wouldCycle(personaId, parentId, byId)) {
      setError("Lo spostamento creerebbe un ciclo.");
      return;
    }
    const siblings = items.filter(
      (p) => p.parentId === parentId && p.id !== personaId
    );
    const sortOrder =
      siblings.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10;
    setBusy(true);
    const res = await movePersonaTreeAction({ personaId, parentId, sortOrder });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await reload();
  }

  function onDropTarget(target: string | "root") {
    if (!dragId || !isAdmin || busy) return;
    const parentId = target === "root" ? null : target;
    if (parentId === dragId) return;
    void move(dragId, parentId);
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Trascina una persona su un’altra per farla dipendere da lei, oppure
        sull’area «Primo livello» per toglierla dalla gerarchia.
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!isAdmin || busy}
        onDragOver={(e) => {
          e.preventDefault();
          setOverId("root");
        }}
        onDragLeave={() => {
          if (overId === "root") setOverId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropTarget("root");
        }}
        className={`w-full rounded-xl border border-dashed px-4 py-3 text-left text-sm ${
          overId === "root"
            ? "border-[var(--primary)] bg-emerald-50"
            : "border-[var(--border)] bg-[var(--card)]"
        }`}
      >
        Primo livello (nessun superiore)
      </button>

      {tree.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nessuna persona. Aggiungile da Elenco e mansioni.
        </p>
      ) : (
        <ul className="space-y-2">
          {tree.map((n) => (
            <TreeNode
              key={n.id}
              node={n}
              isAdmin={isAdmin}
              dragId={dragId}
              overId={overId}
              setDragId={setDragId}
              setOverId={setOverId}
              onDrop={onDropTarget}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeNode({
  node,
  isAdmin,
  dragId,
  overId,
  setDragId,
  setOverId,
  onDrop,
}: {
  node: OrganigrammaPersona;
  isAdmin: boolean;
  dragId: string | null;
  overId: string | "root" | null;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | "root" | null) => void;
  onDrop: (id: string) => void;
}) {
  const figli = node.figli ?? [];
  return (
    <li>
      <div
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
        className={`flex items-center gap-2 rounded-xl border bg-[var(--card)] px-3 py-2 ${
          overId === node.id && dragId && overId !== dragId
            ? "border-[var(--primary)] bg-emerald-50"
            : "border-[var(--border)]"
        } ${dragId === node.id ? "opacity-50" : ""}`}
      >
        {isAdmin ? (
          <button
            type="button"
            draggable
            title="Trascina per spostare"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", node.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(node.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className="cursor-grab px-1 text-slate-400 hover:text-slate-600 active:cursor-grabbing"
          >
            ⋮⋮
          </button>
        ) : null}
        <Link
          href={`/app/amministrazione/organigramma/elenco-e-mansioni/${node.id}`}
          className="min-w-0 flex-1"
        >
          <span className="block text-sm font-medium">{personaLabel(node)}</span>
          <span className="block text-xs text-[var(--muted)]">
            {[node.repartoNome, node.mansioni.map((m) => m.nome).join(", ")]
              .filter(Boolean)
              .join(" · ") || "Senza reparto / mansione"}
          </span>
        </Link>
      </div>
      {figli.length ? (
        <ul className="ml-6 mt-2 space-y-2 border-l border-slate-200 pl-3">
          {figli.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              isAdmin={isAdmin}
              dragId={dragId}
              overId={overId}
              setDragId={setDragId}
              setOverId={setOverId}
              onDrop={onDrop}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
