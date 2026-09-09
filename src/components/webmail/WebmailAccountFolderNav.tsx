"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { WebmailComposeForm } from "@/components/webmail/WebmailComposeForm";
import { parseWebmailCasellaFolder } from "@/lib/webmail/casella-path";
import {
  FaInbox,
  FaPaperPlane,
  FaRobot,
  FaTrashCan,
  FaFolderOpen,
  FaBan,
} from "react-icons/fa6";
import {
  listWebmailCategorieAction,
  listWebmailUnreadCountsAction,
  type WebmailUnreadCounts,
} from "@/app/actions/webmail";
import type { WebmailCategoria } from "@/lib/webmail/types";
import { contrastingInkOn, contrastingInkOnWhite } from "@/lib/webmail/contrast";
import { WEBMAIL_UNREAD_NAV_EVENT } from "@/lib/webmail/unread-nav";

type Props = {
  accountId: string;
  accountLabel: string;
};

function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white"
      title={`${count} non aperte`}
    >
      {count}
    </span>
  );
}

/** Cerchio categoria: pieno + numero grosso se ci sono non lette; contorno + numero fine = totale. */
function CategoryCountPill({
  unread,
  total,
  color,
}: {
  unread: number;
  total: number;
  color: string;
}) {
  if (total <= 0 && unread <= 0) return null;
  const hasUnread = unread > 0;
  const value = hasUnread ? unread : total;
  const ink = hasUnread ? contrastingInkOn(color) : contrastingInkOnWhite(color);
  return (
    <span
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 text-[10px] ${
        hasUnread ? "font-extrabold" : "font-light"
      }`}
      style={
        hasUnread
          ? {
              backgroundColor: color,
              borderColor: color,
              color: ink,
            }
          : {
              backgroundColor: "#ffffff",
              borderColor: color,
              color: ink,
            }
      }
      title={
        hasUnread
          ? `${unread} da leggere su ${total}`
          : `${total} mail`
      }
    >
      {value}
    </span>
  );
}

/** Hex #RRGGBB → rgba con alpha (selezione semitrasparente). */
function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function navItemClass(active: boolean) {
  return `flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
    active
      ? "bg-slate-900 text-white shadow-sm"
      : "text-slate-700 hover:bg-slate-100"
  }`;
}

/**
 * Sottomenu casella (ex sidebar): Nuova, categorie, In arrivo, Bozze, Spam, Cestino.
 */
export function WebmailAccountFolderNav({ accountId, accountLabel }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/app/webmail/caselle/${accountId}`;
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [counts, setCounts] = useState<WebmailUnreadCounts>({
    inbox: 0,
    spam: 0,
    byCategoriaId: {},
    inboxTotal: 0,
    spamTotal: 0,
    byCategoriaTotal: {},
  });

  const reload = useCallback(() => {
    void listWebmailCategorieAction().then((res) => {
      if (res.success) setCategorie(res.items);
    });
    void listWebmailUnreadCountsAction(accountId).then((res) => {
      if (res.success) setCounts(res.counts);
    });
  }, [accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const t = window.setTimeout(reload, 400);
    return () => window.clearTimeout(t);
  }, [pathname, reload]);

  useEffect(() => {
    function onUnread(ev: Event) {
      const id = (ev as CustomEvent<{ accountId?: string | null }>).detail
        ?.accountId;
      if (id && id !== accountId) return;
      reload();
    }
    window.addEventListener(WEBMAIL_UNREAD_NAV_EVENT, onUnread);
    const poll = window.setInterval(reload, 8000);
    return () => {
      window.removeEventListener(WEBMAIL_UNREAD_NAV_EVENT, onUnread);
      window.clearInterval(poll);
    };
  }, [accountId, reload]);

  return (
    <aside className="flex max-h-[min(78vh,52rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Casella
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {accountLabel}
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        <Link
          href={`${base}/nuova`}
          className={`${navItemClass(pathname === `${base}/nuova`)} font-medium`}
        >
          <FaPaperPlane
            size={13}
            className={
              pathname === `${base}/nuova` ? "text-white" : "text-sky-600"
            }
          />
          <span className="truncate">+ Nuova Mail</span>
        </Link>

        <Link
          href={`${base}/in-arrivo`}
          className={`${navItemClass(
            pathname === `${base}/in-arrivo` || pathname === base
          )} justify-between`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FaInbox
              size={14}
              className={
                pathname === `${base}/in-arrivo` || pathname === base
                  ? "text-white"
                  : "text-slate-500"
              }
            />
            <span className="truncate">In Arrivo</span>
          </span>
          <UnreadPill count={counts.inbox} />
        </Link>

        <div className="px-2 pb-1 pt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <FaFolderOpen size={10} />
            Categorie
          </p>
        </div>
        {categorie.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Nessuna categoria</p>
        ) : (
          categorie.map((cat) => {
            const href = `${base}/categoria/${cat.id}`;
            const active = pathname === href;
            const unread = counts.byCategoriaId[cat.id] ?? 0;
            const total = counts.byCategoriaTotal[cat.id] ?? unread;
            const color = cat.colore || "#64748b";
            return (
              <Link
                key={cat.id}
                href={href}
                prefetch={false}
                onClick={(e) => {
                  if (
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey ||
                    e.button !== 0
                  ) {
                    return;
                  }
                  e.preventDefault();
                  router.push(href);
                }}
                className="flex w-full items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: active
                    ? hexToRgba(color, 0.14)
                    : "#ffffff",
                }}
                title={cat.nome}
              >
                <span className="min-w-0 flex-1 truncate">{cat.nome}</span>
                <CategoryCountPill
                  unread={unread}
                  total={total}
                  color={color}
                />
              </Link>
            );
          })
        )}

        <div className="my-2 border-t border-slate-200" />

        <Link
          href={`${base}/bozze`}
          className={navItemClass(pathname === `${base}/bozze`)}
        >
          <FaRobot
            size={14}
            className={
              pathname === `${base}/bozze` ? "text-white" : "text-violet-600"
            }
          />
          <span className="truncate">Bozze AI</span>
        </Link>
        <Link
          href={`${base}/spam`}
          className={`${navItemClass(pathname === `${base}/spam`)} justify-between`}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FaBan
              size={13}
              className={
                pathname === `${base}/spam` ? "text-white" : "text-amber-600"
              }
            />
            <span className="truncate">Spam</span>
          </span>
          <UnreadPill count={counts.spam} />
        </Link>
        <Link
          href={`${base}/cestino`}
          className={navItemClass(pathname === `${base}/cestino`)}
        >
          <FaTrashCan
            size={13}
            className={
              pathname === `${base}/cestino` ? "text-white" : "text-slate-500"
            }
          />
          <span className="truncate">Cestino</span>
        </Link>
      </nav>
    </aside>
  );
}

type ShellProps = {
  accountId: string;
  accountLabel: string;
  children?: React.ReactNode;
  accountEmail?: string;
};

/**
 * Elenco cartelle + contenuto. La vista (In arrivo / categoria / …)
 * segue il pathname, così il click su una categoria apre subito le mail
 * anche se la pagina server è lenta o non trova la riga categoria.
 */
export function WebmailCasellaShell({
  accountId,
  accountLabel,
  children,
  accountEmail,
}: ShellProps) {
  const pathname = usePathname() || "";
  const folder = parseWebmailCasellaFolder(pathname, accountId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)]">
      <WebmailAccountFolderNav
        accountId={accountId}
        accountLabel={accountLabel}
      />
      <div className="min-w-0">
        {folder.kind === "nuova" ? (
          children ??
          (accountEmail ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <WebmailComposeForm
                accountId={accountId}
                accountLabel={accountLabel}
                fromAddress={accountEmail}
              />
            </div>
          ) : null)
        ) : folder.view ? (
          <WebmailBoard
            key={`${folder.view}-${folder.categoriaId ?? ""}`}
            initialAccountId={accountId}
            view={folder.view}
            categoriaId={folder.categoriaId}
            hideTopFilters
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
