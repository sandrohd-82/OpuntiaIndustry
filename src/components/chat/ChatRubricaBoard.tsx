"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaCircle, FaComments } from "react-icons/fa6";
import { ensureConversationWithPeer } from "@/lib/chat/messages";
import { listChatContacts, listPeerCandidates } from "@/lib/chat/queries";
import type { ChatContact, ChatStatus } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function statusColor(s: ChatStatus) {
  if (s === "available") return "text-emerald-500";
  if (s === "away") return "text-amber-500";
  return "text-slate-400";
}

type Props = {
  userId: string;
  mode: "rubrica" | "nuova";
};

export function ChatRubricaBoard({ userId, mode }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [peers, setPeers] = useState<
    { id: string; name: string; email: string; chatStatus: ChatStatus }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      try {
        if (mode === "rubrica") {
          setContacts(await listChatContacts(supabase, userId));
        } else {
          setPeers(await listPeerCandidates(supabase, userId));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    })();
  }, [userId, mode]);

  async function openChat(peerId: string) {
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const id = await ensureConversationWithPeer(supabase, peerId);
      router.push(`/app/chat/thread/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile aprire chat");
      setPending(false);
    }
  }

  const rows =
    mode === "rubrica"
      ? contacts.map((c) => ({
          id: c.peerId,
          name: c.peerName ?? c.peerId,
          email: c.peerEmail ?? "",
          chatStatus: c.peerChatStatus ?? ("offline" as ChatStatus),
        }))
      : peers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          {mode === "rubrica"
            ? "Contatti con cui hai già interagito."
            : "Scegli un utente attivo per avviare una conversazione."}
        </p>
        <Link href="/app/chat/dirette/elenco" className="text-sm text-[var(--primary)]">
          ← Elenco chat
        </Link>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Nessun contatto.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FaCircle
                    size={10}
                    className={statusColor(r.chatStatus)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {r.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void openChat(r.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  <FaComments size={11} /> Chat
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
