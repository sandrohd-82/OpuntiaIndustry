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
import { CHAT_SECTIONS } from "@/lib/areas/chat";
import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import {
  toneForNavPath,
  toneForSubtreeAccess,
  type AccessTone,
  type PageAccessMap,
} from "@/lib/auth/page-access";
import {
  capNavLayer,
  navContrast,
  type NavContrast,
} from "@/lib/areas/nav-layer";

const CHAT_ARGOMENTI = CHAT_SECTIONS.find((s) => s.slug === "argomenti");
const CHAT_DIRETTE = CHAT_SECTIONS.find((s) => s.slug === "dirette");
const CHAT_ARGOMENTI_CHILDREN =
  CHAT_ARGOMENTI && isNavBranch(CHAT_ARGOMENTI) ? CHAT_ARGOMENTI.children : [];
const CHAT_DIRETTE_CHILDREN =
  CHAT_DIRETTE && isNavBranch(CHAT_DIRETTE) ? CHAT_DIRETTE.children : [];

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

function toneTextClass(
  tone: AccessTone | null,
  contrast: NavContrast = "light"
) {
  const dark = contrast === "dark";
  if (tone === "on") {
    return dark
      ? "text-emerald-700 hover:text-emerald-800"
      : "text-emerald-400 hover:text-emerald-300";
  }
  if (tone === "off") {
    return dark
      ? "text-red-700 hover:text-red-800"
      : "text-red-400 hover:text-red-300";
  }
  if (tone === "mixed") {
    return dark
      ? "bg-gradient-to-r from-emerald-700 to-red-700 bg-clip-text text-transparent"
      : "bg-gradient-to-r from-emerald-400 to-red-400 bg-clip-text text-transparent";
  }
  if (tone === "unset") {
    return dark
      ? "text-slate-500 hover:text-slate-700"
      : "text-slate-400 hover:text-slate-300";
  }
  return "";
}

function itemClass(
  active: boolean,
  isNew = false,
  tone: AccessTone | null = null,
  contrast: NavContrast = "light"
) {
  if (isNew && !active) {
    return "flex w-full items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-left text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25";
  }
  const rowTone = tone === "mixed" ? null : tone;
  const toneCls = toneTextClass(rowTone, contrast);
  const dark = contrast === "dark";
  const idleText = dark ? "text-slate-800" : "text-[var(--sidebar-muted)]";
  const activeText = dark ? "text-slate-950" : "text-[var(--sidebar-foreground)]";
  const hoverBg = dark ? "hover:bg-slate-900/12" : "hover:bg-white/10";
  const activeBg = dark ? "bg-slate-900/14" : "bg-white/10";
  return `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
    active
      ? `${activeBg} font-medium ${toneCls || activeText}`
      : `${toneCls || idleText} ${hoverBg} ${toneCls ? "" : dark ? "hover:text-slate-950" : "hover:text-[var(--sidebar-foreground)]"}`
  }`;
}

function labelClass(
  tone: AccessTone | null,
  contrast: NavContrast = "light"
): string {
  return tone === "mixed" ? toneTextClass("mixed", contrast) : "";
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
  layerDepth?: number;
};

/** Menu Chat: Per argomento + Fra utenti con elenchi dinamici. */
export function ChatSidebarNav({
  userId,
  pageAccess,
  colorMenu = false,
  branchToggle = false,
  layerDepth = 1,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [topics, setTopics] = useState<ChatTopic[]>([]);
  const [directs, setDirects] = useState<ConversationListItem[]>([]);

  function toggleExclusive(key: string, siblings: string[]) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      for (const s of siblings) next.delete(s);
      next.add(key);
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
        next.delete("dirette");
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
        next.delete("dirette");
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
      const onArg =
        pathname.startsWith("/app/chat/argomenti") ||
        pathname.startsWith("/app/chat/argomento");
      const onDir =
        pathname.startsWith("/app/chat/dirette") ||
        pathname.startsWith("/app/chat/thread");
      if (onArg) {
        next.delete("dirette");
        next.add("argomenti");
        next.add("elenco-argomenti");
      } else if (onDir) {
        next.delete("argomenti");
        next.add("dirette");
        next.add("elenco-dirette");
      }
      return next;
    });
  }, [pathname]);

  function toneOf(
    path: string,
    childItems: readonly NavItem[] = []
  ): AccessTone | null {
    if (!colorMenu || !pageAccess) return null;
    return toneForNavPath(path, pageAccess, childItems);
  }

  function accessOf(
    path: string,
    childItems: readonly NavItem[] = []
  ) {
    if (!branchToggle || !pageAccess) return null;
    return {
      areaKey: path,
      tone: toneForSubtreeAccess(path, pageAccess, childItems),
    };
  }

  function withToggle(
    path: string,
    node: ReactNode,
    childItems: readonly NavItem[] = []
  ) {
    const access = accessOf(path, childItems);
    if (!access) return node;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{node}</div>
        <MenuAreaAccessToggle areaKey={access.areaKey} tone={access.tone} />
      </div>
    );
  }

  const toneArgomenti = toneOf("/app/chat/argomenti", CHAT_ARGOMENTI_CHILDREN);
  const toneNuovoArg = toneOf("/app/chat/argomenti/nuovo");
  const toneElencoArg = toneOf("/app/chat/argomenti/elenco");
  const toneDirette = toneOf("/app/chat/dirette", CHAT_DIRETTE_CHILDREN);
  const toneNuovaChat = toneOf("/app/chat/dirette/nuova");
  const toneElencoChat = toneOf("/app/chat/dirette/elenco");

  const openArg = open.has("argomenti");
  const openDir = open.has("dirette");
  const openElencoArg = open.has("elenco-argomenti");
  const openElencoDir = open.has("elenco-dirette");
  const c0 = navContrast(layerDepth - 1);
  const c1 = navContrast(layerDepth);
  const c2 = navContrast(layerDepth + 1);
  const rail0 = layerDepth - 1 >= 2 ? "border-slate-400/45" : "border-white/20";
  const rail1 = layerDepth >= 2 ? "border-slate-400/45" : "border-white/20";
  const rail2 = layerDepth + 1 >= 2 ? "border-slate-400/45" : "border-white/20";

  return (
    <ul className={`mt-0.5 space-y-0.5 border-l ${rail0} ml-2 pl-1.5`}>
      <li
        data-nav-layer={openArg ? capNavLayer(layerDepth) : undefined}
        className={openArg ? "overflow-hidden rounded-lg p-0.5" : undefined}
      >
        {withToggle(
          "/app/chat/argomenti",
          <button
            type="button"
            onClick={() => toggleExclusive("argomenti", ["argomenti", "dirette"])}
            className={itemClass(
              pathname.startsWith("/app/chat/argomenti") ||
                pathname.startsWith("/app/chat/argomento"),
              false,
              toneArgomenti,
              openArg ? c1 : c0
            )}
          >
            <Chevron open={openArg} />
            <span className={`truncate ${labelClass(toneArgomenti, openArg ? c1 : c0)}`}>
              Per argomento
            </span>
            {toneArgomenti === "mixed" ? <MixedToneMark /> : null}
          </button>,
          CHAT_ARGOMENTI_CHILDREN
        )}
        {openArg ? (
          <ul className={`mt-0.5 space-y-0.5 border-l ${rail1} ml-2 pl-1.5`}>
            <li>
              {withToggle(
                "/app/chat/argomenti/nuovo",
                <Link
                  href="/app/chat/argomenti/nuovo"
                  className={itemClass(
                    pathname === "/app/chat/argomenti/nuovo",
                    false,
                    toneNuovoArg,
                    c1
                  )}
                >
                  <span className="truncate">+ Nuovo Argomento</span>
                </Link>
              )}
            </li>
            <li
              data-nav-layer={openElencoArg ? capNavLayer(layerDepth + 1) : undefined}
              className={
                openElencoArg ? "overflow-hidden rounded-lg p-0.5" : undefined
              }
            >
              {withToggle(
                "/app/chat/argomenti/elenco",
                <button
                  type="button"
                  onClick={() =>
                    toggleExclusive("elenco-argomenti", ["elenco-argomenti"])
                  }
                  className={itemClass(
                    pathname === "/app/chat/argomenti/elenco",
                    false,
                    toneElencoArg,
                    openElencoArg ? c2 : c1
                  )}
                >
                  <Chevron open={openElencoArg} />
                  <FaFolderOpen size={11} className="shrink-0 opacity-70" />
                  <span className="truncate">Elenco Argomenti</span>
                  {toneElencoArg === "mixed" ? <MixedToneMark /> : null}
                </button>
              )}
              {openElencoArg ? (
                <ul className={`mt-0.5 space-y-0.5 border-l ${rail2} ml-2 pl-1.5`}>
                  {topics.length === 0 ? (
                    <li className="px-3 py-1.5 text-xs opacity-70">
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
                            className={itemClass(active, isNew, toneElencoArg, c2)}
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

      <li
        data-nav-layer={openDir ? capNavLayer(layerDepth) : undefined}
        className={openDir ? "overflow-hidden rounded-lg p-0.5" : undefined}
      >
        {withToggle(
          "/app/chat/dirette",
          <button
            type="button"
            onClick={() => toggleExclusive("dirette", ["argomenti", "dirette"])}
            className={itemClass(
              pathname.startsWith("/app/chat/dirette") ||
                pathname.startsWith("/app/chat/thread"),
              false,
              toneDirette,
              openDir ? c1 : c0
            )}
          >
            <Chevron open={openDir} />
            <span className={`truncate ${labelClass(toneDirette, openDir ? c1 : c0)}`}>
              Fra utenti
            </span>
            {toneDirette === "mixed" ? <MixedToneMark /> : null}
          </button>,
          CHAT_DIRETTE_CHILDREN
        )}
        {openDir ? (
          <ul className={`mt-0.5 space-y-0.5 border-l ${rail1} ml-2 pl-1.5`}>
            <li>
              {withToggle(
                "/app/chat/dirette/nuova",
                <Link
                  href="/app/chat/dirette/nuova"
                  className={itemClass(
                    pathname === "/app/chat/dirette/nuova",
                    false,
                    toneNuovaChat,
                    c1
                  )}
                >
                  <span className="truncate">+ Nuova chat</span>
                </Link>
              )}
            </li>
            <li
              data-nav-layer={openElencoDir ? capNavLayer(layerDepth + 1) : undefined}
              className={
                openElencoDir ? "overflow-hidden rounded-lg p-0.5" : undefined
              }
            >
              {withToggle(
                "/app/chat/dirette/elenco",
                <button
                  type="button"
                  onClick={() =>
                    toggleExclusive("elenco-dirette", ["elenco-dirette"])
                  }
                  className={itemClass(
                    pathname === "/app/chat/dirette/elenco",
                    false,
                    toneElencoChat,
                    openElencoDir ? c2 : c1
                  )}
                >
                  <Chevron open={openElencoDir} />
                  <FaComments size={11} className="shrink-0 opacity-70" />
                  <span className="truncate">Elenco chat</span>
                  {toneElencoChat === "mixed" ? <MixedToneMark /> : null}
                </button>
              )}
              {openElencoDir ? (
                <ul className={`mt-0.5 space-y-0.5 border-l ${rail2} ml-2 pl-1.5`}>
                  {directs.length === 0 ? (
                    <li className="px-3 py-1.5 text-xs opacity-70">
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
                            toneElencoChat,
                            c2
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
