"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  listWebmailMenuAccountsAction,
  listWebmailUnreadInboxByAccountAction,
  setImpersonatedWebmailAccountAccessAction,
  setImpersonatedWebmailAllAccountsAccessAction,
} from "@/app/actions/webmail";
import { MenuAreaAccessToggle } from "@/components/layout/MenuAreaAccessToggle";
import { toneForGrantSelection, type AccessTone } from "@/lib/auth/page-access";
import type { WebmailAccountPublic } from "@/lib/webmail/types";
import {
  notifyWebmailGrantNav,
  WEBMAIL_GRANT_NAV_EVENT,
  WEBMAIL_UNREAD_NAV_EVENT,
} from "@/lib/webmail/unread-nav";

function MixedToneMark() {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full"
      title="Parziale: alcune caselle On, altre Off"
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

function itemClass(active: boolean, tone: AccessTone | null = null) {
  const rowTone = tone === "mixed" ? null : tone;
  const toneCls = toneTextClass(rowTone);
  return `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
    active
      ? `bg-[var(--sidebar-active)] font-medium ${toneCls || "text-[var(--sidebar-foreground)]"}`
      : `${toneCls || "text-[var(--sidebar-muted)]"} hover:bg-[var(--sidebar-active)] ${
          toneCls ? "" : "hover:text-[var(--sidebar-foreground)]"
        }`
  }`;
}

function labelClass(tone: AccessTone | null): string {
  return tone === "mixed" ? toneTextClass("mixed") : "";
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
  testMenuMode?: boolean;
  branchToggle?: boolean;
  onGrantToneChange?: (tone: AccessTone) => void;
};

/**
 * Sidebar WebMail: elenco caselle.
 * In profilo test, On/Off assegna i grant della casella al profilo.
 */
export function WebmailSidebarNav({
  testMenuMode = false,
  branchToggle = false,
  onGrantToneChange,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [grantedIds, setGrantedIds] = useState<string[]>([]);
  const [assignMode, setAssignMode] = useState(false);
  const [unreadByAccount, setUnreadByAccount] = useState<
    Record<string, number>
  >({});

  const grantTone = useMemo(
    () => toneForGrantSelection(grantedIds.length, accounts.length),
    [grantedIds.length, accounts.length]
  );
  const onGrantToneChangeRef = useRef(onGrantToneChange);
  onGrantToneChangeRef.current = onGrantToneChange;

  const load = useCallback(() => {
    void listWebmailMenuAccountsAction().then((res) => {
      if (!res.success) {
        setAccounts([]);
        setGrantedIds([]);
        setAssignMode(false);
        onGrantToneChangeRef.current?.("unset");
        return;
      }
      setAccounts(res.accounts);
      setGrantedIds(res.grantedIds);
      setAssignMode(res.assignMode);
      onGrantToneChangeRef.current?.(res.grantTone);
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
    window.addEventListener(WEBMAIL_GRANT_NAV_EVENT, load);
    const poll = window.setInterval(load, 30000);
    return () => {
      window.removeEventListener(WEBMAIL_UNREAD_NAV_EVENT, load);
      window.removeEventListener(WEBMAIL_GRANT_NAV_EVENT, load);
      window.clearInterval(poll);
    };
  }, [load]);

  useEffect(() => {
    if (pathname.startsWith("/app/webmail")) setOpen(true);
  }, [pathname]);

  const showToggles = Boolean(testMenuMode && branchToggle && assignMode);
  const colorMenu = showToggles;
  const branchActive = pathname.startsWith("/app/webmail/caselle");
  const groupTone = colorMenu ? grantTone : null;

  function withToggle(
    node: ReactNode,
    tone: AccessTone,
    onSet: (visibile: boolean) => Promise<
      { success: true } | { success: false; error: string }
    >
  ) {
    if (!showToggles) return node;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{node}</div>
        <MenuAreaAccessToggle
          areaKey="webmail-casella"
          tone={tone}
          onSet={onSet}
        />
      </div>
    );
  }

  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700/80 pl-2 ml-2">
      <li>
        {withToggle(
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={itemClass(branchActive, groupTone)}
          >
            <Chevron open={open} />
            <span className={`truncate ${labelClass(groupTone)}`}>
              Caselle mail
            </span>
            {groupTone === "mixed" ? <MixedToneMark /> : null}
          </button>,
          grantTone,
          async (visibile) => {
            const res =
              await setImpersonatedWebmailAllAccountsAccessAction(visibile);
            if (res.success) {
              setGrantedIds(visibile ? accounts.map((a) => a.id) : []);
              onGrantToneChange?.(visibile ? "on" : "off");
              notifyWebmailGrantNav();
            }
            return res;
          }
        )}
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
                const granted = grantedIds.includes(acc.id);
                const tone = colorMenu ? (granted ? "on" : "off") : null;
                return (
                  <li key={acc.id}>
                    {withToggle(
                      <Link
                        href={`${base}/in-arrivo`}
                        className={`${itemClass(active, tone)} justify-between`}
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
                      </Link>,
                      granted ? "on" : "off",
                      async (visibile) => {
                        const res =
                          await setImpersonatedWebmailAccountAccessAction(
                            acc.id,
                            visibile
                          );
                        if (res.success) {
                          setGrantedIds((prev) => {
                            const next = visibile
                              ? [...new Set([...prev, acc.id])]
                              : prev.filter((id) => id !== acc.id);
                            onGrantToneChange?.(
                              toneForGrantSelection(next.length, accounts.length)
                            );
                            return next;
                          });
                          notifyWebmailGrantNav();
                        }
                        return res;
                      }
                    )}
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
