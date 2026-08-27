"use client";

import { useEffect, useMemo, useState } from "react";
import { FaUserMinus, FaUserPlus, FaXmark } from "react-icons/fa6";
import {
  addChatTopicMembersAction,
  countTopicMessagesAction,
  listTopicMembersAction,
  removeChatTopicMemberAction,
  type TopicMemberListItem,
} from "@/app/actions/chat-topic-members";
import { listPeerCandidates } from "@/lib/chat/queries";
import type { ChatStatus } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";

type Peer = {
  id: string;
  name: string;
  email: string;
  chatStatus: ChatStatus;
};

type InviteDecision = {
  userId: string;
  name: string;
  seeHistory: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  topicId: string;
  onDone: (added: number) => void;
  onError: (msg: string) => void;
  /** Dopo rimozione (anche se self → parent può redirect). */
  onMemberRemoved?: (removedUserId: string) => void;
};

type Phase = "pick" | "history" | "saving";

/**
 * Gestisce membri argomento: aggiunta (con scelta storia) e rimozione soft-delete.
 */
export function ChatAddTopicMembersModal({
  open,
  onClose,
  userId,
  topicId,
  onDone,
  onError,
  onMemberRemoved,
}: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [members, setMembers] = useState<TopicMemberListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasHistory, setHasHistory] = useState(false);
  const [queue, setQueue] = useState<Peer[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [decisions, setDecisions] = useState<InviteDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function refreshMembers() {
    const membersRes = await listTopicMembersAction(topicId);
    if (membersRes.success) setMembers(membersRes.members);
    else onError(membersRes.error);
  }

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setSelected(new Set());
    setQueue([]);
    setQueueIdx(0);
    setDecisions([]);
    setLoading(true);
    const supabase = createClient();
    void (async () => {
      try {
        const [peerList, membersRes, countRes] = await Promise.all([
          listPeerCandidates(supabase, userId),
          listTopicMembersAction(topicId),
          countTopicMessagesAction(topicId),
        ]);
        setPeers(peerList);
        if (membersRes.success) {
          setMembers(membersRes.members);
        } else {
          onError(membersRes.error);
        }
        if (countRes.success) {
          setHasHistory(countRes.count > 0);
        } else {
          onError(countRes.error);
        }
      } catch (e) {
        onError(e instanceof Error ? e.message : "Caricamento fallito");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId, topicId, onError]);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );

  const candidates = useMemo(
    () => peers.filter((p) => !memberIds.has(p.id)),
    [peers, memberIds]
  );

  const current = queue[queueIdx] ?? null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startInvite() {
    const picked = candidates.filter((p) => selected.has(p.id));
    if (picked.length === 0) {
      onError("Seleziona almeno un utente da aggiungere.");
      return;
    }
    if (!hasHistory) {
      void save(
        picked.map((p) => ({
          userId: p.id,
          name: p.name,
          seeHistory: true,
        }))
      );
      return;
    }
    setQueue(picked);
    setQueueIdx(0);
    setDecisions([]);
    setPhase("history");
  }

  function answerHistory(seeHistory: boolean) {
    if (!current) return;
    const nextDecisions = [
      ...decisions,
      { userId: current.id, name: current.name, seeHistory },
    ];
    const nextIdx = queueIdx + 1;
    if (nextIdx >= queue.length) {
      void save(nextDecisions);
      return;
    }
    setDecisions(nextDecisions);
    setQueueIdx(nextIdx);
  }

  async function save(list: InviteDecision[]) {
    setPhase("saving");
    setBusy(true);
    const res = await addChatTopicMembersAction({
      topicId,
      members: list.map((d) => ({
        userId: d.userId,
        seeHistory: d.seeHistory,
        displayName: d.name,
      })),
    });
    setBusy(false);
    if (!res.success) {
      setPhase("pick");
      onError(res.error);
      return;
    }
    onDone(res.added);
    onClose();
  }

  async function removeMember(member: TopicMemberListItem) {
    const isSelf = member.userId === userId;
    const ok = window.confirm(
      isSelf
        ? "Vuoi uscire da questo argomento? Non avrai più accesso alla chat."
        : `Rimuovere ${member.name} dall’argomento? Non avrà più accesso alla chat.`
    );
    if (!ok) return;
    setRemovingId(member.userId);
    const res = await removeChatTopicMemberAction({
      topicId,
      userId: member.userId,
    });
    setRemovingId(null);
    if (!res.success) {
      onError(res.error);
      return;
    }
    onMemberRemoved?.(member.userId);
    if (isSelf) {
      onClose();
      return;
    }
    await refreshMembers();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FaUserPlus size={14} className="text-[var(--primary)]" />
            {phase === "history"
              ? "Cronologia chat"
              : phase === "saving"
                ? "Invito in corso…"
                : "Gestisci utenti"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-xs text-slate-500">Caricamento…</p>
          ) : null}

          {phase === "pick" && !loading ? (
            <div className="space-y-4">
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Membri attivi
                </p>
                <p className="text-[11px] text-slate-500">
                  Rimuovendo un utente perde subito l’accesso a questa chat.
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="text-xs text-slate-400">Nessun membro.</p>
                  ) : (
                    members.map((m) => (
                      <div
                        key={m.userId}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {m.name}
                            {m.userId === userId ? " (tu)" : ""}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {m.email || m.ruolo}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={busy || removingId === m.userId}
                          onClick={() => void removeMember(m)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                          title={
                            m.userId === userId
                              ? "Esci dall’argomento"
                              : "Rimuovi dall’argomento"
                          }
                        >
                          <FaUserMinus size={11} />
                          {removingId === m.userId
                            ? "…"
                            : m.userId === userId
                              ? "Esci"
                              : "Rimuovi"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Aggiungi utenti
                </p>
                <p className="text-[11px] text-slate-500">
                  Seleziona uno o più utenti da aggiungere.
                  {hasHistory
                    ? " Per ciascuno chiederemo se può vedere la chat precedente."
                    : " Non ci sono ancora messaggi: vedranno la conversazione da subito."}
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {candidates.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nessun altro utente disponibile da aggiungere.
                    </p>
                  ) : (
                    candidates.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {p.name}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {p.email}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {phase === "history" && current ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Utente {queueIdx + 1} di {queue.length}
              </p>
              <p className="text-sm">
                Vuoi concedere a{" "}
                <span className="font-semibold">{current.name}</span> di
                visualizzare la chat antecedente al suo ingresso in questo
                gruppo?
              </p>
            </div>
          ) : null}

          {phase === "saving" ? (
            <p className="text-xs text-slate-500">Salvataggio inviti…</p>
          ) : null}
        </div>

        {phase === "pick" && !loading ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Chiudi
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={startInvite}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              Aggiungi ({selected.size})
            </button>
          </div>
        ) : null}

        {phase === "history" && current ? (
          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] px-4 py-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => answerHistory(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              No — solo messaggi da ora
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => answerHistory(true)}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white"
            >
              Sì — vede la cronologia
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
