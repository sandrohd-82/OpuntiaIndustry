"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  listWebmailAccountsAction,
  listWebmailUnreadInboxByAccountAction,
} from "@/app/actions/webmail";
import type { WebmailAccountPublic } from "@/lib/webmail/types";
import { WEBMAIL_UNREAD_NAV_EVENT } from "@/lib/webmail/unread-nav";

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

/**
 * Sidebar WebMail snella: solo elenco caselle (cartelle nella pagina).
 */
export function WebmailSidebarNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [unreadByAccount, setUnreadByAccount] = useState<
    Record<string, number>
  >({});

  const load = useCallback(() => {
    void listWebmailAccountsAction().then((a) => {
      setAccounts(a.success ? a.accounts : []);
    });
    void listWebmailUnreadInboxByAccountAction().then((res) => {
      if (res.success) setUnreadByAccount(res.byAccountId);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(WEBMAIL_UNREAD_NAV_EVENT, load);
    const poll = window.setInterval(load, 8000);
    return () => {
      window.removeEventListener(WEBMAIL_UNREAD_NAV_EVENT, load);
      window.clearInterval(poll);
    };
  }, [load]);

  useEffect(() => {
    if (pathname.startsWith("/app/webmail")) setOpen(true);
  }, [pathname]);

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
                const base = `/app/webmail/caselle/${acc.id}`;
                const active = pathname.startsWith(base);
                const unread = unreadByAccount[acc.id] ?? 0;
                return (
                  <li key={acc.id}>
                    <Link
                      href={`${base}/in-arrivo`}
                      className={`${itemClass(active)} justify-between`}
                      title={acc.emailAddress}
                    >
                      <span className="truncate">{acc.label}</span>
                      {unread > 0 ? (
                        <span
                          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white"
                          title={`${unread} non lette in arrivo`}
                        >
                          {unread}
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
  );
}
