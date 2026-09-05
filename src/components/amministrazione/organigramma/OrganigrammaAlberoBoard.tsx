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

function initials(p: OrganigrammaPersona): string {
  return `${p.nome.slice(0, 1)}${p.cognome.slice(0, 1)}`.toUpperCase();
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
        Organigramma a cascata: foto, nome e collegamenti verso i collaboratori.
        {isAdmin
          ? " Trascina una scheda su un’altra per creare il collegamento, oppure su «Primo livello» per toglierla dalla gerarchia."
          : ""}
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isAdmin ? (
        <button
          type="button"
          disabled={busy}
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
      ) : null}

      {tree.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nessun operatore. Aggiungili da Elenco e mansioni, poi collegali
          trascinando le schede.
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
                setDragId={setDragId}
                setOverId={setOverId}
                onDrop={onDropTarget}
              />
            ))}
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
  const dropping = overId === node.id && dragId && overId !== dragId;

  return (
    <div className="flex flex-col items-center">
      <PersonaCard
        node={node}
        isAdmin={isAdmin}
        dragging={dragId === node.id}
        dropping={Boolean(dropping)}
        setDragId={setDragId}
        setOverId={setOverId}
        onDrop={onDrop}
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
                  setDragId={setDragId}
                  setOverId={setOverId}
                  onDrop={onDrop}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PersonaCard({
  node,
  isAdmin,
  dragging,
  dropping,
  setDragId,
  setOverId,
  onDrop,
}: {
  node: OrganigrammaPersona;
  isAdmin: boolean;
  dragging: boolean;
  dropping: boolean;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | "root" | null) => void;
  onDrop: (id: string) => void;
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
        dropping
          ? "border-emerald-500 bg-emerald-50 shadow-md"
          : "border-slate-200"
      } ${dragging ? "opacity-40" : ""} ${
        isAdmin ? "cursor-grab active:cursor-grabbing" : ""
      } ${node.inForza ? "" : "opacity-70"}`}
    >
      <Link
        href={`/app/amministrazione/organigramma/elenco-e-mansioni/${node.id}`}
        className="block"
        onClick={(e) => {
          if (dragging) e.preventDefault();
        }}
      >
        {node.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.fotoUrl}
            alt={personaLabel(node)}
            className="mx-auto h-16 w-16 rounded-full object-cover ring-2 ring-slate-200"
          />
        ) : (
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-2 ring-slate-200">
            {initials(node)}
          </span>
        )}
        <span className="mt-2 block text-sm font-semibold leading-tight text-slate-900">
          {node.cognome} {node.nome}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
          {ruolo}
        </span>
        {!node.inForza ? (
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
            Non in forza
          </span>
        ) : null}
      </Link>
    </div>
  );
}
