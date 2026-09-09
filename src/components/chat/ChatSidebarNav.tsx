"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FaComments, FaFolderOpen } from "react-icons/fa6";
import {
  listActiveTopics,
  subscribeTopicSidebar,
} from "@/lib/chat/topic-api";
import { listConversationsForUser } from "@/lib/chat/queries";
import { attachChatLifecycleRefresh } from "@/lib/chat/realtime";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_TOPIC_CREATED_EVENT,
  CHAT_TOPIC_OPENED_EVENT,
  type ChatTopic,
  type ChatTopicCreatedDetail,
} from "@/lib/chat/topics";
import type { ConversationListItem } from "@/lib/chat/types";
import { MenuAreaAccessToggle } from "@/components/layout/MenuAreaAccessToggle";
import {
  toneForNavPath,
  toneForSubtreeAccess,
  type AccessTone,
  type PageAccessMap,
} from "@/lib/auth/page-access";

function MixedToneMark() {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full"
      title="Parziale: alcune voci On, altre Off"
      aria-hidden
    >
      <span className="h-2 w-2 bg-emerald-400" />
      <span className="h-2 w-2 bg-red-400" />
    </span>
  );
}

function toneTextClass(tone: AccessTone | null) {
  if (tone === "on") return "text-emerald-400 hover:text-emerald-300";
  if (tone === "off") return "text-red-400 hover:text-red-300";
  if (tone === "mixed") {
    return "bg-gradient-to-r from-emerald-400 to-red-400 bg-clip-text text-transparent hover:from-emerald-300 hover:to-red-300";
  }
  if (tone === "unset") return "text-slate-400 hover:text-slate-300";
  return "";
}

function itemClass(
  active: boolean,
  isNew = false,
  tone: AccessTone | null = null
) {
  if (isNew && !active) {
    return "flex w-full items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-left text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25";
  }
  const toneCls = toneTextClass(tone);
  return `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
    active
      ? `bg-[var(--sidebar-active)] font-medium ${toneCls || "text-[var(--sidebar-foreground)]"}`
      : `${toneCls || "text-[var(--sidebar-muted)]"} hover:bg-[var(--sidebar-active)] ${
          toneCls ? "" : "hover:text-[var(--sidebar-foreground)]"
        }`
  }`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type Props = {
  userId: string;
  pageAccess?: PageAccessMap;
  colorMenu?: boolean;
  branchToggle?: boolean;
};

/** Menu Chat: Per argomento + Fra utenti con elenchi dinamici. */
export function ChatSidebarNav({
  userId,
  pageAccess,
  colorMenu = false,
  branchToggle = false,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(["argomenti", "dirette", "elenco-argomenti", "elenco-dirette"])
  );
  const [topics, setTopics] = useState<ChatTopic[]>([]);
  const [directs, setDirects] = useState<ConversationListItem[]>([]);

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const loadTopics = useCallback(() => {
    const supabase = createClient();
    void listActiveTopics(supabase)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, []);

  const loadDirects = useCallback(() => {
    const supabase = createClient();
    void listConversationsForUser(supabase, userId)
      .then(setDirects)
      .catch(() => setDirects([]));
  }, [userId]);

  useEffect(() => {
    loadTopics();
    loadDirects();
    const supabase = createClient();
    const channel = subscribeTopicSidebar(supabase, userId, () => {
      setOpen((prev) => {
        const next = new Set(prev);
        next.add("argomenti");
        next.add("elenco-argomenti");
        return next;
      });
      loadTopics();
    });
    const detach = attachChatLifecycleRefresh(() => {
      loadTopics();
      loadDirects();
    });

    function onCreated(ev: Event) {
      const detail = (ev as CustomEvent<ChatTopicCreatedDetail>).detail;
      if (!detail?.id) return;
      setOpen((prev) => {
        const next = new Set(prev);
        next.add("argomenti");
        next.add("elenco-argomenti");
        return next;
      });
      setTopics((prev) => {
        if (prev.some((t) => t.id === detail.id)) return prev;
        const now = new Date().toISOString();
        return [
          {
            id: detail.id,
            titolo: detail.titolo,
            stato: "attivo" as const,
            createdAt: now,
            updatedAt: now,
            isNew: detail.isNew,
          },
          ...prev,
        ];
      });
    }

    function onOpened(ev: Event) {
      const id = (ev as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setTopics((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isNew: false } : t))
      );
    }

    window.addEventListener(CHAT_TOPIC_CREATED_EVENT, onCreated);
    window.addEventListener(CHAT_TOPIC_OPENED_EVENT, onOpened);

    return () => {
      detach();
      void supabase.removeChannel(channel);
      window.removeEventListener(CHAT_TOPIC_CREATED_EVENT, onCreated);
      window.removeEventListener(CHAT_TOPIC_OPENED_EVENT, onOpened);
    };
  }, [userId, loadTopics, loadDirects]);

  useEffect(() => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (
        pathname.startsWith("/app/chat/argomenti") ||
        pathname.startsWith("/app/chat/argomento")
      ) {
        next.add("argomenti");
        next.add("elenco-argomenti");
      }
      if (
        pathname.startsWith("/app/chat/dirette") ||
        pathname.startsWith("/app/chat/thread")
      ) {
        next.add("dirette");
        next.add("elenco-dirette");
      }
      return next;
    });
  }, [pathname]);

  function toneOf(path: string): AccessTone | null {
    if (!colorMenu || !pageAccess) return null;
    return toneForNavPath(path, pageAccess);
  }

  function accessOf(path: string) {
    if (!branchToggle || !pageAccess) return null;
    return {
      areaKey: path,
      tone: toneForSubtreeAccess(path, pageAccess),
    };
  }

  function withToggle(
    path: string,
    node: ReactNode
  ) {
    const access = accessOf(path);
    if (!access) return node;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{node}</div>
        <MenuAreaAccessToggle areaKey={access.areaKey} tone={access.tone} />
      </div>
    );
  }

  const toneArgomenti = toneOf("/app/chat/argomenti");
  const toneNuovoArg = toneOf("/app/chat/argomenti/nuovo");
  const toneElencoArg = toneOf("/app/chat/argomenti/elenco");
  const toneDirette = toneOf("/app/chat/dirette");
  const toneNuovaChat = toneOf("/app/chat/dirette/nuova");
  const toneElencoChat = toneOf("/app/chat/dirette/elenco");

  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
      {/* Per argomento */}
      <li>
        {withToggle(
          "/app/chat/argomenti",
          <button
            type="button"
            onClick={() => toggle("argomenti")}
            className={itemClass(
              pathname.startsWith("/app/chat/argomenti") ||
                pathname.startsWith("/app/chat/argomento"),
              false,
              toneArgomenti
            )}
          >
            <Chevron open={open.has("argomenti")} />
            <span className="truncate">Per argomento</span>
            {toneArgomenti === "mixed" ? <MixedToneMark /> : null}
          </button>
        )}
        {open.has("argomenti") ? (
          <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
            <li>
              {withToggle(
                "/app/chat/argomenti/nuovo",
                <Link
                  href="/app/chat/argomenti/nuovo"
                  className={itemClass(
                    pathname === "/app/chat/argomenti/nuovo",
                    false,
                    toneNuovoArg
                  )}
                >
                  <span className="truncate">+ Nuovo Argomento</span>
                </Link>
              )}
            </li>
            <li>
              {withToggle(
                "/app/chat/argomenti/elenco",
                <button
                  type="button"
                  onClick={() => toggle("elenco-argomenti")}
                  className={itemClass(
                    pathname === "/app/chat/argomenti/elenco",
                    false,
                    toneElencoArg
                  )}
                >
                  <Chevron open={open.has("elenco-argomenti")} />
                  <FaFolderOpen size={11} className="shrink-0 opacity-70" />
                  <span className="truncate">Elenco Argomenti</span>
                  {toneElencoArg === "mixed" ? <MixedToneMark /> : null}
                </button>
              )}
              {open.has("elenco-argomenti") ? (
                <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
                  {topics.length === 0 ? (
                    <li className="px-3 py-1.5 text-xs text-[var(--sidebar-muted)]">
                      Nessun argomento attivo
                    </li>
                  ) : (
                    topics.map((t) => {
                      const active =
                        pathname === `/app/chat/argomento/${t.id}`;
                      const isNew = Boolean(t.isNew) && !active;
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/app/chat/argomento/${t.id}`}
                            className={itemClass(active, isNew, toneElencoArg)}
                            title={t.titolo}
                          >
                            <span className="truncate">{t.titolo}</span>
                            {isNew ? (
                              <span className="ml-auto shrink-0 rounded bg-emerald-400 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-950">
                                Nuovo
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </li>
          </ul>
        ) : null}
      </li>

      {/* Fra utenti */}
      <li>
        {withToggle(
          "/app/chat/dirette",
          <button
            type="button"
            onClick={() => toggle("dirette")}
            className={itemClass(
              pathname.startsWith("/app/chat/dirette") ||
                pathname.startsWith("/app/chat/thread"),
              false,
              toneDirette
            )}
          >
            <Chevron open={open.has("dirette")} />
            <span className="truncate">Fra utenti</span>
            {toneDirette === "mixed" ? <MixedToneMark /> : null}
          </button>
        )}
        {open.has("dirette") ? (
          <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
            <li>
              {withToggle(
                "/app/chat/dirette/nuova",
                <Link
                  href="/app/chat/dirette/nuova"
                  className={itemClass(
                    pathname === "/app/chat/dirette/nuova",
                    false,
                    toneNuovaChat
                  )}
                >
                  <span className="truncate">+ Nuova chat</span>
                </Link>
              )}
            </li>
            <li>
              {withToggle(
                "/app/chat/dirette/elenco",
                <button
                  type="button"
                  onClick={() => toggle("elenco-dirette")}
                  className={itemClass(
                    pathname === "/app/chat/dirette/elenco",
                    false,
                    toneElencoChat
                  )}
                >
                  <Chevron open={open.has("elenco-dirette")} />
                  <FaComments size={11} className="shrink-0 opacity-70" />
                  <span className="truncate">Elenco chat</span>
                  {toneElencoChat === "mixed" ? <MixedToneMark /> : null}
                </button>
              )}
              {open.has("elenco-dirette") ? (
                <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
                  {directs.length === 0 ? (
                    <li className="px-3 py-1.5 text-xs text-[var(--sidebar-muted)]">
                      Nessuna chat attiva
                    </li>
                  ) : (
                    directs.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/app/chat/thread/${c.id}`}
                          className={itemClass(
                            pathname === `/app/chat/thread/${c.id}`,
                            false,
                            toneElencoChat
                          )}
                          title={c.peerName}
                        >
                          <span className="truncate">{c.peerName}</span>
                          {c.unreadCount > 0 ? (
                            <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] text-white">
                              {c.unreadCount}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          </ul>
        ) : null}
      </li>
    </ul>
  );
}
