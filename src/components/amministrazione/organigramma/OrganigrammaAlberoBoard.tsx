"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listPersoneAction,
  movePersonaTreeAction,
  movePersoneTreeBatchAction,
  reorderPersoneAction,
  setAlberoLayoutAction,
} from "@/app/actions/organigramma";
import {
  collegamentoCreaCiclo,
  nestAlbero,
  personaLabel,
  superioriDi,
  type AlberoNodo,
  type OrganigrammaPersona,
} from "@/lib/amministrazione/organigramma";

function wouldCycle(
  personaId: string,
  newParentId: string | null,
  byId: Map<string, OrganigrammaPersona>
): boolean {
  return collegamentoCreaCiclo(personaId, newParentId, (id) => {
    const persona = byId.get(id);
    return persona ? superioriDi(persona) : [];
  });
}

function initials(p: OrganigrammaPersona): string {
  return `${p.nome.slice(0, 1)}${p.cognome.slice(0, 1)}`.toUpperCase();
}

const GAP_UNIT_PX = 96;
const LINE = "border-slate-400";

export function OrganigrammaAlberoBoard() {
  const [items, setItems] = useState<OrganigrammaPersona[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [gerarchiaIds, setGerarchiaIds] = useState<string[]>([]);
  const [daInserireIds, setDaInserireIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [impostazioni, setImpostazioni] = useState(false);

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

  const tree = useMemo(() => nestAlbero(items), [items]);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const etichetteSuggerite = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      if (p.alberoEtichetta.trim()) set.add(p.alberoEtichetta.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "it"));
  }, [items]);
  const gerarchia = useMemo(
    () =>
      gerarchiaIds
        .map((id) => byId.get(id))
        .filter((p): p is OrganigrammaPersona => Boolean(p)),
    [gerarchiaIds, byId]
  );
  const daInserire = useMemo(
    () =>
      daInserireIds
        .map((id) => byId.get(id))
        .filter((p): p is OrganigrammaPersona => Boolean(p)),
    [daInserireIds, byId]
  );
  function clearSelezione() {
    setGerarchiaIds([]);
    setDaInserireIds([]);
    setPickerOpen(false);
    setPickerQ("");
    setError(null);
  }

  function entraImpostazioni() {
    clearSelezione();
    setDragId(null);
    setOverId(null);
    setImpostazioni(true);
  }

  function esciImpostazioni() {
    setDragId(null);
    setOverId(null);
    setImpostazioni(false);
  }

  function tornaIndietro() {
    setDaInserireIds([]);
    setPickerOpen(false);
    setPickerQ("");
    setError(null);
  }

  function toggleGerarchia(id: string) {
    setGerarchiaIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
    setDaInserireIds((cur) => cur.filter((x) => x !== id));
    setPickerOpen(false);
    setPickerQ("");
  }

  function toggleDaInserire(id: string) {
    if (gerarchiaIds.includes(id)) return;
    setDaInserireIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function applicaInserimento() {
    if (!gerarchiaIds.length) {
      setError("Seleziona almeno un operatore.");
      return;
    }
    if (!daInserireIds.length) {
      setError("Seleziona almeno un operatore da inserire sotto gerarchia.");
      return;
    }
    for (const parentId of gerarchiaIds) {
      for (const childId of daInserireIds) {
        if (childId === parentId) continue;
        if (wouldCycle(childId, parentId, byId)) {
          setError("Il collegamento creerebbe un ciclo. Cambia la selezione.");
          return;
        }
      }
    }
    setBusy(true);
    const res = await movePersoneTreeBatchAction({
      parentIds: gerarchiaIds,
      childIds: daInserireIds,
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
        "In impostazioni puoi solo riordinare le schede nello stesso livello. Per la gerarchia esci dalle impostazioni e seleziona gli operatori."
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
        "In impostazioni puoi solo riordinare le schede nello stesso livello. Per la gerarchia esci dalle impostazioni e seleziona gli operatori."
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
    if (!isAdmin || busy || impostazioni) return;
    setError(null);
    if (pickerOpen) {
      if (gerarchiaIds.includes(id)) return;
      toggleDaInserire(id);
      return;
    }
    toggleGerarchia(id);
  }

  function onDropCard(targetId: string) {
    if (!dragId || !isAdmin || !impostazioni || busy || dragId === targetId) {
      return;
    }
    void reorderBefore(dragId, targetId);
    setDragId(null);
    setOverId(null);
  }

  function onDropEnd(parentId: string | null) {
    if (!dragId || !isAdmin || !impostazioni || busy) return;
    void reorderAtEnd(dragId, parentId);
    setDragId(null);
    setOverId(null);
  }

  function patchLayout(id: string, etichetta: string, gapDopo: number) {
    setItems((cur) =>
      cur.map((p) =>
        p.id === id ? { ...p, alberoEtichetta: etichetta, alberoGapDopo: gapDopo } : p
      )
    );
  }

  async function saveLayout(
    personaId: string,
    patch: { etichetta?: string; gapDelta?: number; gapDopo?: number }
  ) {
    if (!isAdmin || busy) return;
    setBusy(true);
    const res = await setAlberoLayoutAction({ personaId, ...patch });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      await reload();
      return;
    }
    setError(null);
    patchLayout(personaId, res.etichetta, res.gapDopo);
  }

  const layoutEdit = isAdmin && impostazioni;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          {layoutEdit
            ? "Impostazioni layout: trascina le schede per riordinarle nello stesso livello. Sulla linea puoi aggiungere solo le targhette che servono (vuoto = nessuna scritta). Usa +/− per le distanze tra parigrado."
            : isAdmin
              ? "Seleziona un operatore (foto) e, se vuoi, altri a scelta. Poi inserisci operatori sotto gerarchia. Per spostare le schede e le targhette entra in Impostazioni."
              : "Clicca il nome per aprire la scheda operatore."}
        </p>
        {isAdmin ? (
          layoutEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={esciImpostazioni}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Chiudi impostazioni
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={entraImpostazioni}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Impostazioni
            </button>
          )
        ) : null}
      </div>
      {isAdmin && !layoutEdit && gerarchia.length ? (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
          <p>
            Selezionati: <strong>{gerarchia.map(personaLabel).join(", ")}</strong>
            {daInserire.length ? (
              <>
                . Da inserire sotto: {daInserire.map(personaLabel).join(", ")}.
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!pickerOpen ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPickerOpen(true);
                  setError(null);
                }}
                className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Seleziona Operatore/i da inserire sotto Gerarchia
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || daInserire.length === 0}
                onClick={() => void applicaInserimento()}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? "Inserimento…" : "Concludi"}
              </button>
            )}
            {pickerOpen ? (
              <button
                type="button"
                disabled={busy}
                onClick={tornaIndietro}
                className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium"
              >
                Indietro
              </button>
            ) : null}
            {gerarchia.length === 1 && !pickerOpen ? (
              <button
                type="button"
                className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-medium"
                onClick={() => void unlink(gerarchia[0].id)}
              >
                Porta a primo livello
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium"
              onClick={clearSelezione}
            >
              Annulla
            </button>
          </div>
          {pickerOpen ? (
            <OperatorePicker
              items={items}
              excludeIds={gerarchiaIds}
              parentIds={gerarchiaIds}
              byId={byId}
              selectedIds={daInserireIds}
              query={pickerQ}
              onQuery={setPickerQ}
              onToggle={toggleDaInserire}
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
        <div
          className={`overflow-x-auto rounded-2xl border px-6 py-8 ${
            layoutEdit
              ? "border-amber-300 bg-amber-50/40"
              : "border-[var(--border)] bg-gradient-to-b from-slate-50 to-white"
          }`}
        >
          <SiblingRow
            nodi={tree}
            parentId={null}
            showIngresso
            isAdmin={isAdmin}
            layoutEdit={layoutEdit}
            dragId={dragId}
            overId={overId}
            gerarchiaIds={gerarchiaIds}
            daInserireIds={daInserireIds}
            etichetteSuggerite={etichetteSuggerite}
            setDragId={setDragId}
            setOverId={setOverId}
            onDrop={onDropCard}
            onDropEnd={onDropEnd}
            onPhotoClick={onPhotoClick}
            onSaveLayout={saveLayout}
          />
        </div>
      )}
    </div>
  );
}

type LayoutHandlers = {
  etichetteSuggerite: string[];
  layoutEdit: boolean;
  onSaveLayout: (
    personaId: string,
    patch: { etichetta?: string; gapDelta?: number; gapDopo?: number }
  ) => void;
};

type BranchProps = {
  node: AlberoNodo;
  ingresso?: boolean;
  isAdmin: boolean;
  dragId: string | null;
  overId: string | null;
  gerarchiaIds: string[];
  daInserireIds: string[];
  setDragId: (id: string | null) => void;
  setOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onDropEnd: (parentId: string | null) => void;
  onPhotoClick: (id: string) => void;
} & LayoutHandlers;

function SiblingRow({
  nodi,
  parentId,
  showIngresso,
  isAdmin,
  layoutEdit,
  dragId,
  overId,
  gerarchiaIds,
  daInserireIds,
  etichetteSuggerite,
  setDragId,
  setOverId,
  onDrop,
  onDropEnd,
  onPhotoClick,
  onSaveLayout,
}: Omit<BranchProps, "node" | "ingresso"> & {
  nodi: AlberoNodo[];
  parentId: string | null;
  showIngresso: boolean;
}) {
  if (!nodi.length) return null;
  return (
    <div className="flex items-start justify-center">
      {nodi.map((n, i) => {
        const persona = n.membri[0] ?? null;
        const gapOwner = n.membri[n.membri.length - 1] ?? persona;
        const gap = gapOwner?.alberoGapDopo ?? 0;
        return (
          <div key={n.id} className="flex items-start">
            <div className="flex min-w-44 flex-col items-center">
              {showIngresso ? (
                <ConnectorCap
                  index={i}
                  total={nodi.length}
                  persona={n.kind === "gruppo" ? null : persona}
                  layoutEdit={layoutEdit && n.kind !== "gruppo"}
                  suggestions={etichetteSuggerite}
                  onSaveEtichetta={(text) => {
                    if (persona && n.kind !== "gruppo") {
                      onSaveLayout(persona.id, { etichetta: text });
                    }
                  }}
                />
              ) : null}
              <AlberoBranch
                node={n}
                ingresso={n.kind === "gruppo"}
                isAdmin={isAdmin}
                layoutEdit={layoutEdit}
                dragId={dragId}
                overId={overId}
                gerarchiaIds={gerarchiaIds}
                daInserireIds={daInserireIds}
                etichetteSuggerite={etichetteSuggerite}
                setDragId={setDragId}
                setOverId={setOverId}
                onDrop={onDrop}
                onDropEnd={onDropEnd}
                onPhotoClick={onPhotoClick}
                onSaveLayout={onSaveLayout}
              />
            </div>
            <DistanzaCoda
              persona={gapOwner}
              gap={gap}
              layoutEdit={layoutEdit}
              onGapDelta={(delta) => {
                if (gapOwner) onSaveLayout(gapOwner.id, { gapDelta: delta });
              }}
            />
          </div>
        );
      })}
      <EndSlot
        parentId={parentId}
        layoutEdit={layoutEdit}
        dragId={dragId}
        overId={overId}
        siblingCount={nodi.length}
        setOverId={setOverId}
        onDropEnd={onDropEnd}
      />
    </div>
  );
}

function FigliRow({
  figli,
  parentId,
  isAdmin,
  layoutEdit,
  dragId,
  overId,
  gerarchiaIds,
  daInserireIds,
  etichetteSuggerite,
  setDragId,
  setOverId,
  onDrop,
  onDropEnd,
  onPhotoClick,
  onSaveLayout,
}: Omit<BranchProps, "node"> & { figli: AlberoNodo[]; parentId: string | null }) {
  if (!figli.length) return null;
  return (
    <div className="flex w-full flex-col items-stretch">
      <div className="flex justify-center">
        <div className={`h-6 w-0 border-l-2 ${LINE}`} />
      </div>
      <SiblingRow
        nodi={figli}
        parentId={parentId}
        showIngresso
        isAdmin={isAdmin}
        layoutEdit={layoutEdit}
        dragId={dragId}
        overId={overId}
        gerarchiaIds={gerarchiaIds}
        daInserireIds={daInserireIds}
        etichetteSuggerite={etichetteSuggerite}
        setDragId={setDragId}
        setOverId={setOverId}
        onDrop={onDrop}
        onDropEnd={onDropEnd}
        onPhotoClick={onPhotoClick}
        onSaveLayout={onSaveLayout}
      />
    </div>
  );
}

function AlberoBranch(props: BranchProps) {
  const { node } = props;
  if (node.kind === "gruppo") {
    return <OrgGruppo {...props} />;
  }
  const persona = node.membri[0];
  if (!persona) return null;
  const dropping = props.overId === persona.id && props.dragId && props.overId !== props.dragId;
  return (
    <div className="flex w-full flex-col items-center">
      <PersonaCard
        node={persona}
        isAdmin={props.isAdmin}
        layoutEdit={props.layoutEdit}
        dragging={props.dragId === persona.id}
        dropping={Boolean(dropping)}
        role={
          props.gerarchiaIds.includes(persona.id)
            ? "gerarchia"
            : props.daInserireIds.includes(persona.id)
              ? "inserire"
              : null
        }
        setDragId={props.setDragId}
        setOverId={props.setOverId}
        onDrop={props.onDrop}
        onPhotoClick={props.onPhotoClick}
      />
      <FigliRow {...props} figli={node.figli} parentId={persona.id} />
    </div>
  );
}

function OrgGruppo(props: BranchProps) {
  const { node } = props;
  const membri = node.membri;
  const condivisi = node.figli ?? [];
  const ingresso = Boolean(props.ingresso);
  return (
    <div className="flex w-full flex-col items-stretch">
      <div className="flex items-start justify-center">
        {membri.map((m, i) => {
          const dropping = props.overId === m.id && props.dragId && props.overId !== props.dragId;
          const exclusive = node.membriFigli[i] ?? [];
          const innerGap = i < membri.length - 1 ? m.alberoGapDopo : 0;
          return (
            <div key={m.id} className="flex items-start">
              <div className="flex min-w-44 flex-col items-center">
                {ingresso ? (
                  <ConnectorCap
                    index={i}
                    total={membri.length}
                    persona={m}
                    layoutEdit={props.layoutEdit}
                    suggestions={props.etichetteSuggerite}
                    onSaveEtichetta={(text) =>
                      props.onSaveLayout(m.id, { etichetta: text })
                    }
                  />
                ) : null}
                <PersonaCard
                  node={m}
                  isAdmin={props.isAdmin}
                  layoutEdit={props.layoutEdit}
                  dragging={props.dragId === m.id}
                  dropping={Boolean(dropping)}
                  role={
                    props.gerarchiaIds.includes(m.id)
                      ? "gerarchia"
                      : props.daInserireIds.includes(m.id)
                        ? "inserire"
                        : null
                  }
                  setDragId={props.setDragId}
                  setOverId={props.setOverId}
                  onDrop={props.onDrop}
                  onPhotoClick={props.onPhotoClick}
                />
                {exclusive.length ? (
                  <FigliRow {...props} figli={exclusive} parentId={m.id} />
                ) : null}
              </div>
              <DistanzaCoda
                persona={m}
                gap={innerGap}
                layoutEdit={props.layoutEdit}
                onGapDelta={(delta) => props.onSaveLayout(m.id, { gapDelta: delta })}
              />
            </div>
          );
        })}
      </div>
      <FigliRow
        {...props}
        figli={condivisi}
        parentId={membri[0]?.id ?? null}
      />
    </div>
  );
}

function ConnectorCap({
  index,
  total,
  persona,
  layoutEdit,
  suggestions,
  onSaveEtichetta,
}: {
  index: number;
  total: number;
  persona: OrganigrammaPersona | null;
  layoutEdit: boolean;
  suggestions: string[];
  onSaveEtichetta: (text: string) => void;
}) {
  const saved = persona?.alberoEtichetta.trim() ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const listId = persona ? `albero-etichetta-${persona.id}` : undefined;
  const only = total <= 1;
  const first = index === 0;
  const last = index === total - 1;

  useEffect(() => {
    if (!editing) setDraft(saved);
  }, [saved, editing]);

  if (only && !saved && !layoutEdit) {
    return null;
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === saved) return;
    onSaveEtichetta(next);
  }

  return (
    <div className="relative h-7 w-full shrink-0">
      {!only && !first ? (
        <div className={`absolute left-0 right-1/2 top-0 border-t-2 ${LINE}`} />
      ) : null}
      {!only && !last ? (
        <div className={`absolute left-1/2 right-0 top-0 border-t-2 ${LINE}`} />
      ) : null}
      <div
        className={`absolute left-1/2 top-0 h-7 w-0 -translate-x-px border-l-2 ${LINE}`}
      />
      {layoutEdit && persona ? (
        editing ? (
          <form
            className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-2"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input
              autoFocus
              value={draft}
              list={listId}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(saved);
                  setEditing(false);
                }
              }}
              placeholder="Targhetta (vuoto = nessuna)"
              className="w-full rounded border border-sky-300 bg-white px-1 py-0.5 text-center text-[10px] font-semibold text-slate-800 shadow-sm outline-none"
            />
            {listId && suggestions.length ? (
              <datalist id={listId}>
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(saved);
              setEditing(true);
            }}
            className={`absolute left-1/2 top-1/2 z-10 max-w-[10.5rem] -translate-x-1/2 -translate-y-1/2 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
              saved
                ? "bg-white text-slate-700 ring-1 ring-slate-200"
                : "bg-white/95 text-slate-400 ring-1 ring-dashed ring-slate-300"
            }`}
            title="Aggiungi o modifica la targhetta. Lascia vuoto per non mostrarla."
          >
            {saved || "Aggiungi targhetta"}
          </button>
        )
      ) : saved ? (
        <span className="absolute left-1/2 top-1/2 z-10 max-w-[10.5rem] -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
          {saved}
        </span>
      ) : null}
    </div>
  );
}

function DistanzaCoda({
  persona,
  gap,
  layoutEdit,
  onGapDelta,
}: {
  persona: OrganigrammaPersona | null;
  gap: number;
  layoutEdit: boolean;
  onGapDelta: (delta: number) => void;
}) {
  if (!persona) return null;
  if (gap <= 0 && !layoutEdit) return null;
  if (gap <= 0) {
    return (
      <div className="relative w-0 shrink-0">
        <button
          type="button"
          className="absolute left-0 top-0 z-10 -translate-x-1/2 rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          disabled={gap >= 8}
          title="Crea distanza a destra"
          onClick={() => onGapDelta(1)}
        >
          +
        </button>
      </div>
    );
  }
  return (
    <div
      className="relative shrink-0"
      style={{ width: gap * GAP_UNIT_PX }}
    >
      <div className={`absolute left-0 right-0 top-0 border-t-2 ${LINE}`} />
      {layoutEdit ? (
        <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-0.5">
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            disabled={gap >= 8}
            title="Aumenta distanza"
            onClick={() => onGapDelta(1)}
          >
            +
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
            title="Riduci distanza"
            onClick={() => onGapDelta(-1)}
          >
            −
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EndSlot({
  parentId,
  layoutEdit,
  dragId,
  overId,
  siblingCount,
  setOverId,
  onDropEnd,
}: {
  parentId: string | null;
  layoutEdit: boolean;
  dragId: string | null;
  overId: string | null;
  siblingCount: number;
  setOverId: (id: string | null) => void;
  onDropEnd: (parentId: string | null) => void;
}) {
  if (!layoutEdit || siblingCount < 2) return null;
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
  layoutEdit,
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
  layoutEdit: boolean;
  dragging: boolean;
  dropping: boolean;
  role: "gerarchia" | "inserire" | null;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | null) => void;
  onDrop: (id: string) => void;
  onPhotoClick: (id: string) => void;
}) {
  const ruolo =
    [node.repartoNome, node.mansioni.map((m) => m.nome).join(", ")]
      .filter(Boolean)
      .join(" · ") || "Senza mansione";
  const canDrag = isAdmin && layoutEdit;

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return;
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
        if (!canDrag) return;
        e.preventDefault();
        e.stopPropagation();
        setOverId(node.id);
      }}
      onDrop={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop(node.id);
      }}
      className={`w-44 rounded-2xl border bg-white p-3 text-center shadow-sm transition ${
        role === "gerarchia"
          ? "border-sky-500 ring-2 ring-sky-300"
          : role === "inserire"
            ? "border-emerald-500 ring-2 ring-emerald-300"
            : dropping
              ? "border-amber-400 bg-amber-50 shadow-md"
              : "border-slate-200"
      } ${dragging ? "opacity-40" : ""} ${
        canDrag ? "cursor-grab active:cursor-grabbing" : ""
      } ${node.inForza ? "" : "opacity-70"}`}
    >
      <button
        type="button"
        data-link-photo
        disabled={!isAdmin || layoutEdit}
        onClick={(e) => {
          e.stopPropagation();
          onPhotoClick(node.id);
        }}
        className="mx-auto block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default"
        title={
          layoutEdit
            ? "In impostazioni trascina la scheda per spostarla"
            : isAdmin
              ? "Clicca per selezionare l’operatore (poi altri a scelta)"
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
              role === "gerarchia"
                ? "ring-sky-500"
                : role === "inserire"
                  ? "ring-emerald-500"
                  : "ring-slate-200"
            }`}
          />
        ) : (
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-2 ${
              role === "gerarchia"
                ? "ring-sky-500"
                : role === "inserire"
                  ? "ring-emerald-500"
                  : "ring-slate-200"
            }`}
          >
            {initials(node)}
          </span>
        )}
      </button>
      {role === "gerarchia" ? (
        <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
          Gerarchia
        </span>
      ) : role === "inserire" ? (
        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          Da inserire
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
  excludeIds,
  parentIds,
  byId,
  selectedIds,
  query,
  onQuery,
  onToggle,
}: {
  items: OrganigrammaPersona[];
  excludeIds: string[];
  parentIds: string[];
  byId: Map<string, OrganigrammaPersona>;
  selectedIds: string[];
  query: string;
  onQuery: (q: string) => void;
  onToggle: (id: string) => void;
}) {
  const excluded = new Set(excludeIds);
  const q = query.trim().toLowerCase();
  const list = items
    .filter((p) => !excluded.has(p.id))
    .filter((p) =>
      parentIds.every((parentId) => !wouldCycle(p.id, parentId, byId))
    )
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
                  checked={selectedIds.includes(p.id)}
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
