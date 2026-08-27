"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { listWebmailAccountsAction } from "@/app/actions/webmail";
import type { WebmailAccountPublic } from "@/lib/webmail/types";

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

/** Menu WebMail: Caselle mail → elenco dinamico caselle collegate. */
export function WebmailSidebarNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);

  const load = useCallback(() => {
    void listWebmailAccountsAction().then((res) => {
      if (res.success) setAccounts(res.accounts);
      else setAccounts([]);
    });
  }, []);

  useEffect(() => {
    load();
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
                const href = `/app/webmail/caselle/${acc.id}`;
                return (
                  <li key={acc.id}>
                    <Link
                      href={href}
                      className={itemClass(pathname === href)}
                      title={acc.emailAddress}
                    >
                      <span className="truncate">{acc.label}</span>
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
