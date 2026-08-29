"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  listWebmailAccountsAction,
  listWebmailCategorieAction,
  listWebmailUnreadCountsAction,
  type WebmailUnreadCounts,
} from "@/app/actions/webmail";
import type {
  WebmailAccountPublic,
  WebmailCategoria,
} from "@/lib/webmail/types";

function itemClass(active: boolean) {
  return `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
    active
      ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-foreground)]"
      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]"
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

function UnreadBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
      title={`${count} non aperte`}
    >
      {label}
    </span>
  );
}

function accountBase(id: string) {
  return `/app/webmail/caselle/${id}`;
}

/** Menu WebMail: Caselle → casella → Nuova / In arrivo / Categorie / Bozze / Cestino. */
export function WebmailSidebarNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [expandedAcc, setExpandedAcc] = useState<Record<string, boolean>>({});
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({});
  const [unreadByAccount, setUnreadByAccount] = useState<
    Record<string, WebmailUnreadCounts>
  >({});

  const loadUnread = useCallback(async (accIds: string[]) => {
    const entries = await Promise.all(
      accIds.map(async (id) => {
        const res = await listWebmailUnreadCountsAction(id);
        return [id, res.success ? res.counts : { inbox: 0, byCategoriaId: {} }] as const;
      })
    );
    setUnreadByAccount(Object.fromEntries(entries));
  }, []);

  const load = useCallback(() => {
    void Promise.all([
      listWebmailAccountsAction(),
      listWebmailCategorieAction(),
    ]).then(([a, c]) => {
      const accs = a.success ? a.accounts : [];
      setAccounts(accs);
      setCategorie(c.success ? c.items : []);
      if (accs.length) void loadUnread(accs.map((x) => x.id));
    });
  }, [loadUnread]);

  useEffect(() => {
    load();
  }, [load]);

  // Aggiorna i badge quando si naviga nelle caselle (es. dopo aver aperto una mail)
  useEffect(() => {
    if (!pathname.startsWith("/app/webmail/caselle") || accounts.length === 0) {
      return;
    }
    const t = window.setTimeout(() => {
      void loadUnread(accounts.map((x) => x.id));
    }, 400);
    return () => window.clearTimeout(t);
  }, [pathname, accounts, loadUnread]);

  useEffect(() => {
    if (pathname.startsWith("/app/webmail")) setOpen(true);
    for (const acc of accounts) {
      const base = accountBase(acc.id);
      if (pathname.startsWith(base)) {
        setExpandedAcc((prev) => ({ ...prev, [acc.id]: true }));
        if (pathname.includes("/categoria/")) {
          setCatOpen((prev) => ({ ...prev, [acc.id]: true }));
        }
      }
    }
  }, [pathname, accounts]);

  const branchActive = pathname.startsWith("/app/webmail/caselle");

  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700/80 pl-2 ml-2">
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={itemClass(branchActive)}
        >
          <Chevron open={open} />
          <span className="truncate">Caselle mail</span>
        </button>
        {open ? (
          <ul className="mt-0.5 space-y-0.5 border-l border-slate-700/60 pl-2 ml-2">
            {accounts.length === 0 ? (
              <li className="px-3 py-1.5 text-xs text-[var(--sidebar-muted)]">
                Nessuna casella collegata
              </li>
            ) : (
              accounts.map((acc) => {
                const base = accountBase(acc.id);
                const accOpen = Boolean(expandedAcc[acc.id]);
                const accActive = pathname.startsWith(base);
                const catsExpanded = Boolean(catOpen[acc.id]);
                const counts = unreadByAccount[acc.id] ?? {
                  inbox: 0,
                  byCategoriaId: {},
                };

                return (
                  <li key={acc.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAcc((prev) => ({
                          ...prev,
                          [acc.id]: !prev[acc.id],
                        }))
                      }
                      className={itemClass(accActive)}
                      title={acc.emailAddress}
                    >
                      <Chevron open={accOpen} />
                      <span className="truncate">{acc.label}</span>
                    </button>
                    {accOpen ? (
                      <ul className="mt-0.5 space-y-0.5 border-l border-slate-700/50 pl-2 ml-2">
                        <li>
                          <Link
                            href={`${base}/nuova`}
                            className={itemClass(
                              pathname === `${base}/nuova`
                            )}
                          >
                            <span className="truncate">+ Nuova Mail</span>
                          </Link>
                        </li>
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              setCatOpen((prev) => ({
                                ...prev,
                                [acc.id]: !prev[acc.id],
                              }))
                            }
                            className={itemClass(
                              pathname.includes(`${base}/categoria/`)
                            )}
                          >
                            <Chevron open={catsExpanded} />
                            <span className="truncate">Categoria</span>
                          </button>
                          {catsExpanded ? (
                            <ul className="mt-1 space-y-1 pl-2">
                              {categorie.length === 0 ? (
                                <li className="px-2 py-1 text-[11px] text-[var(--sidebar-muted)]">
                                  Nessuna categoria
                                </li>
                              ) : (
                                categorie.map((cat) => {
                                  const href = `${base}/categoria/${cat.id}`;
                                  const active = pathname === href;
                                  const unread =
                                    counts.byCategoriaId[cat.id] ?? 0;
                                  return (
                                    <li key={cat.id}>
                                      <Link
                                        href={href}
                                        className={`inline-flex w-full max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-black/10 transition ${
                                          active
                                            ? "ring-2 ring-white/80"
                                            : "opacity-90 hover:opacity-100"
                                        }`}
                                        style={{ background: cat.colore }}
                                        title={cat.nome}
                                      >
                                        <span className="min-w-0 flex-1 truncate">
                                          {cat.nome}
                                        </span>
                                        {unread > 0 ? (
                                          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-black/35 px-1 text-[9px] font-bold text-white ring-1 ring-white/40">
                                            {unread > 99 ? "99+" : unread}
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
                        <li>
                          <Link
                            href={`${base}/in-arrivo`}
                            className={`${itemClass(
                              pathname === `${base}/in-arrivo` ||
                                pathname === base
                            )} justify-between gap-2`}
                          >
                            <span className="truncate">In Arrivo</span>
                            <UnreadBanner count={counts.inbox} />
                          </Link>
                        </li>
                        <li>
                          <Link
                            href={`${base}/bozze`}
                            className={itemClass(
                              pathname === `${base}/bozze`
                            )}
                          >
                            <span className="truncate">Bozze AI</span>
                          </Link>
                        </li>
                        <li>
                          <Link
                            href={`${base}/cestino`}
                            className={itemClass(
                              pathname === `${base}/cestino`
                            )}
                          >
                            <span className="truncate">Cestino</span>
                          </Link>
                        </li>
                      </ul>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </li>
    </ul>
  );
}
