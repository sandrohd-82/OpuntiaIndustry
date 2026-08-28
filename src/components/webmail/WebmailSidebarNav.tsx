"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  listWebmailAccountsAction,
  listWebmailCategorieAction,
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

  const load = useCallback(() => {
    void Promise.all([
      listWebmailAccountsAction(),
      listWebmailCategorieAction(),
    ]).then(([a, c]) => {
      if (a.success) setAccounts(a.accounts);
      else setAccounts([]);
      if (c.success) setCategorie(c.items);
      else setCategorie([]);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
                          <Link
                            href={`${base}/in-arrivo`}
                            className={itemClass(
                              pathname === `${base}/in-arrivo` ||
                                pathname === base
                            )}
                          >
                            <span className="truncate">In Arrivo</span>
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
                                  return (
                                    <li key={cat.id}>
                                      <Link
                                        href={href}
                                        className={`inline-flex max-w-full items-center truncate rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-black/10 transition ${
                                          active
                                            ? "ring-2 ring-white/80"
                                            : "opacity-90 hover:opacity-100"
                                        }`}
                                        style={{ background: cat.colore }}
                                        title={cat.nome}
                                      >
                                        {cat.nome}
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
                            href={`${base}/bozze`}
                            className={itemClass(
                              pathname === `${base}/bozze`
                            )}
                          >
                            <span className="truncate">Bozze</span>
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
