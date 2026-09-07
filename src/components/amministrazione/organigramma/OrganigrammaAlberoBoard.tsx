"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listPersoneAction,
  movePersonaTreeAction,
  movePersoneTreeBatchAction,
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
  const [superioreId, setSuperioreId] = useState<string | null>(null);
  const [sottoIds, setSottoIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
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
  const superiore = superioreId ? byId.get(superioreId) ?? null : null;
  const sotto = sottoIds
    .map((id) => byId.get(id))
    .filter((p): p is OrganigrammaPersona => Boolean(p));

  function clearSelezione() {
    setSuperioreId(null);
    setSottoIds([]);
    setPickerOpen(false);
    setPickerQ("");
  }

  function toggleSotto(id: string) {
    setSottoIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function applicaGerarchia() {
    if (!superioreId || !sottoIds.length) {
      setError("Seleziona il superiore e almeno un operatore da mettere sotto.");
      return;
    }
    for (const childId of sottoIds) {
      if (wouldCycle(childId, superioreId, byId)) {
        setError("Il collegamento creerebbe un ciclo. Cambia la selezione.");
        return;
      }
    }
    setBusy(true);
    const res = await movePersoneTreeBatchAction({
      parentId: superioreId,
      childIds: sottoIds,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    clearSelezione();
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
    clearSelezione();
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
        "Il trascinamento cambia solo la posizione. Per la gerarchia: clicca il superiore, poi gli operatori, infine Metti sotto gerarchia."
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
        "Il trascinamento cambia solo la posizione. Per la gerarchia: clicca il superiore, poi gli operatori, infine Metti sotto gerarchia."
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
    setError(null);
    if (!superioreId) {
      setSuperioreId(id);
      setSottoIds((cur) => cur.filter((x) => x !== id));
      return;
    }
    if (superioreId === id) {
      clearSelezione();
      return;
    }
    toggleSotto(id);
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
          ? "Clicca la foto del superiore, poi una o più foto degli operatori da mettere sotto. Conferma con Metti sotto gerarchia. Trascina una scheda solo per lo spostamento a sinistra/destra nello stesso livello."
          : "Clicca il nome per aprire la scheda operatore."}
      </p>
      {isAdmin && (superiore || sotto.length) ? (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
          <p>
            {superiore ? (
              <>
                Superiore: <strong>{personaLabel(superiore)}</strong>
                {sotto.length
                  ? `. Da mettere sotto: ${sotto.map(personaLabel).join(", ")}.`
                  : ". Clicca una o più altre foto (secondo, terzo operatore…)."}
              </>
            ) : (
              "Clicca la foto del superiore."
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !superioreId || sotto.length === 0}
              onClick={() => void applicaGerarchia()}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Collegamento…" : "Metti sotto gerarchia"}
            </button>
            <button
              type="button"
              className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-medium"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={!superioreId || busy}
            >
              Aggiungi altri operatori
            </button>
            {superiore ? (
              <button
                type="button"
                className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-medium"
                onClick={() => void unlink(superiore.id)}
              >
                Porta superiore a primo livello
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-sky-800 hover:underline"
              onClick={clearSelezione}
            >
              Annulla
            </button>
          </div>
          {pickerOpen && superioreId ? (
            <OperatorePicker
              items={items}
              superioreId={superioreId}
              sottoIds={sottoIds}
              query={pickerQ}
              onQuery={setPickerQ}
              onToggle={toggleSotto}
            />
          ) : null}
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
                superioreId={superioreId}
                sottoIds={sottoIds}
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
  superioreId,
  sottoIds,
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
  superioreId: string | null;
  sottoIds: string[];
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
        role={
          superioreId === node.id
            ? "superiore"
            : sottoIds.includes(node.id)
              ? "sotto"
              : null
        }
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
                  superioreId={superioreId}
                  sottoIds={sottoIds}
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
  role,
  setDragId,
  setOverId,
  onDrop,
  onPhotoClick,
}: {
  node: OrganigrammaPersona;
  isAdmin: boolean;
  dragging: boolean;
  dropping: boolean;
  role: "superiore" | "sotto" | null;
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
        role === "superiore"
          ? "border-sky-500 ring-2 ring-sky-300"
          : role === "sotto"
            ? "border-emerald-500 ring-2 ring-emerald-300"
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
        title={
          isAdmin
            ? "Clicca: prima il superiore, poi gli operatori da mettere sotto"
            : personaLabel(node)
        }
      >
        {node.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.fotoUrl}
            alt={personaLabel(node)}
            draggable={false}
            className={`h-16 w-16 rounded-full object-cover ring-2 ${
              role === "superiore"
                ? "ring-sky-500"
                : role === "sotto"
                  ? "ring-emerald-500"
                  : "ring-slate-200"
            }`}
          />
        ) : (
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-2 ${
              role === "superiore"
                ? "ring-sky-500"
                : role === "sotto"
                  ? "ring-emerald-500"
                  : "ring-slate-200"
            }`}
          >
            {initials(node)}
          </span>
        )}
      </button>
      {role === "superiore" ? (
        <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
          Superiore
        </span>
      ) : role === "sotto" ? (
        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          Sotto gerarchia
        </span>
      ) : null}
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

function OperatorePicker({
  items,
  superioreId,
  sottoIds,
  query,
  onQuery,
  onToggle,
}: {
  items: OrganigrammaPersona[];
  superioreId: string;
  sottoIds: string[];
  query: string;
  onQuery: (q: string) => void;
  onToggle: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const list = items
    .filter((p) => p.id !== superioreId)
    .filter((p) => {
      if (!q) return true;
      return `${p.cognome} ${p.nome} ${p.repartoNome}`.toLowerCase().includes(q);
    })
    .sort((a, b) => a.cognome.localeCompare(b.cognome, "it"));
  return (
    <div className="rounded-lg border border-sky-200 bg-white p-2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Cerca operatore…"
        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
      />
      <ul className="mt-2 max-h-48 overflow-y-auto text-sm">
        {list.length === 0 ? (
          <li className="px-2 py-1 text-slate-500">Nessun operatore.</li>
        ) : (
          list.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={sottoIds.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                />
                <span>
                  {personaLabel(p)}
                  {p.repartoNome ? (
                    <span className="text-xs text-slate-500"> · {p.repartoNome}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
