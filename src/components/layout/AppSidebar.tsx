"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FaBars,
  FaBoxesStacked,
  FaBuilding,
  FaCalculator,
  FaClipboardList,
  FaComments,
  FaEnvelope,
  FaFlask,
  FaFolder,
  FaGaugeHigh,
  FaGear,
  FaGlobe,
  FaIndustry,
  FaPlus,
  FaTruck,
} from "react-icons/fa6";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { AREA_FORNITORI_SECTIONS } from "@/lib/areas/area-fornitori";
import {
  SIDEBAR_AREA_ORDER,
  SIDEBAR_HIDDEN_AREAS,
  areaPathFromSlug,
} from "@/lib/areas/config";
import {
  isNavBranch,
  openKeysFromPathname,
  type NavBadge,
  type NavItem,
} from "@/lib/areas/nav-tree";
import { MAGAZZINO_SECTIONS } from "@/lib/areas/magazzino";
import {
  mergeProduzioneNavWithAree,
  PRODUZIONE_AREE_NAV_EVENT,
  PRODUZIONE_SECTIONS,
} from "@/lib/areas/produzione";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { PROMEMORIE_E_NOTE_SECTIONS } from "@/lib/areas/promemorie-e-note";
import { RICERCA_SVILUPPO_SECTIONS } from "@/lib/areas/ricerca-sviluppo";
import { isWebHubPath, webSectionsForAccess } from "@/lib/areas/web";
import { ChatUnreadBadge } from "@/components/chat/ChatUnreadBadge";
import { ChatSidebarNav } from "@/components/chat/ChatSidebarNav";
import { WebmailSidebarNav } from "@/components/webmail/WebmailSidebarNav";
import type { AreaSlug, UserArea } from "@/types/database";

const SIDEBAR_COLLAPSED_KEY = "opuntia.sidebar.collapsed";

type Props = {
  areas: UserArea[];
  userName: string;
  roleName: string;
  userId: string;
  isSuperadmin?: boolean;
};

function sortAreasForSidebar(areas: UserArea[]) {
  const rank = new Map(SIDEBAR_AREA_ORDER.map((slug, i) => [slug, i]));
  return areas
    .filter((a) => !SIDEBAR_HIDDEN_AREAS.has(a.slug))
    .filter((a) => rank.has(a.slug) || a.slug === "impostazioni")
    .sort((a, b) => {
      const ra = rank.get(a.slug) ?? 1000 + a.sort_order;
      const rb = rank.get(b.slug) ?? 1000 + b.sort_order;
      return ra - rb;
    });
}

function sectionsForArea(
  slug: AreaSlug,
  produzioneSections: readonly NavItem[] = PRODUZIONE_SECTIONS
): readonly NavItem[] | null {
  switch (slug) {
    case "produzione":
      return produzioneSections;
    case "ricerca-sviluppo":
      return RICERCA_SVILUPPO_SECTIONS;
    case "wikiopuntia":
      return null;
    case "magazzino":
      return MAGAZZINO_SECTIONS;
    case "amministrazione":
      return AMMINISTRAZIONE_SECTIONS;
    case "area-fiscale":
      return AREA_FISCALE_SECTIONS;
    case "chat":
      return null;
    case "webmail":
      return null;
    case "promemorie-e-note":
      return PROMEMORIE_E_NOTE_SECTIONS;
    case "area-fornitori":
      return AREA_FORNITORI_SECTIONS;
    default:
      return null;
  }
}

function AreaIcon({ slug }: { slug: string }) {
  const cls = "h-4 w-4 shrink-0";
  switch (slug) {
    case "dashboard":
      return <FaGaugeHigh className={cls} />;
    case "amministrazione":
      return <FaBuilding className={cls} />;
    case "ricerca-sviluppo":
      return <FaFlask className={cls} />;
    case "produzione":
      return <FaIndustry className={cls} />;
    case "chat":
      return <FaComments className={cls} />;
    case "webmail":
      return <FaEnvelope className={cls} />;
    case "magazzino":
      return <FaBoxesStacked className={cls} />;
    case "promemorie-e-note":
      return <FaClipboardList className={cls} />;
    case "area-fiscale":
      return <FaCalculator className={cls} />;
    case "area-fornitori":
      return <FaTruck className={cls} />;
    case "impostazioni":
      return <FaGear className={cls} />;
    case "web":
      return <FaGlobe className={cls} />;
    default:
      return <FaFolder className={cls} />;
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
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

function NavBadgeDot({ badge }: { badge: NavBadge }) {
  if (badge.kind === "status") {
    return (
      <span
        className={`ml-auto inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
          badge.active ? "bg-emerald-400" : "bg-slate-500"
        }`}
        title={badge.active ? "Attivo" : "Non attivo"}
        aria-hidden
      />
    );
  }
  const n = badge.count;
  if (n <= 0) {
    return (
      <span
        className="ml-auto inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500"
        title="Nessuna"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white"
      title={`${n} aperte`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function itemClass(active: boolean, nested = false, rail = false) {
  return `flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors ${
    rail ? "justify-center px-2 py-2.5" : "px-3 py-2"
  } ${nested ? "py-1.5" : ""} ${
    active
      ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-foreground)]"
      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]"
  }`;
}

function pathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function FirstLevelButton({
  slug,
  label,
  active,
  rail,
  badge,
  extra,
  onToggle,
}: {
  slug: string;
  label: string;
  active: boolean;
  rail: boolean;
  badge?: NavBadge;
  extra?: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        title={label}
        aria-label={label}
        className={`min-w-0 flex-1 ${itemClass(active, false, rail)}`}
      >
        <AreaIcon slug={slug} />
        {rail ? null : <span className="truncate">{label}</span>}
        {rail ? null : badge ? <NavBadgeDot badge={badge} /> : null}
      </button>
      {rail ? null : extra}
    </div>
  );
}

function BranchButton({
  label,
  open,
  active,
  nested,
  badge,
  onToggle,
}: {
  label: string;
  open: boolean;
  active: boolean;
  nested?: boolean;
  badge?: NavBadge;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={itemClass(active, nested)}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? <NavBadgeDot badge={badge} /> : null}
      <Chevron open={open} />
    </button>
  );
}

function NavTree({
  sections,
  pathname,
  openKeys,
  toggle,
}: {
  sections: readonly NavItem[];
  pathname: string;
  openKeys: Set<string>;
  toggle: (...keys: string[]) => void;
}) {
  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
      {sections.map((item) => {
        if (isNavBranch(item)) {
          const open = openKeys.has(item.path) || openKeys.has(item.slug);
          const active = pathMatches(pathname, item.path);
          return (
            <li key={item.path}>
              <BranchButton
                label={item.label}
                open={open}
                active={active}
                nested
                badge={item.badge}
                onToggle={() => toggle(item.path, item.slug)}
              />
              {open && (
                <NavTree
                  sections={item.children}
                  pathname={pathname}
                  openKeys={openKeys}
                  toggle={toggle}
                />
              )}
            </li>
          );
        }

        return (
          <li key={item.path}>
            <Link
              href={item.path}
              className={itemClass(pathname === item.path, true)}
            >
              <span className="truncate">{item.label}</span>
              {item.badge ? <NavBadgeDot badge={item.badge} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppSidebar({
  areas,
  userName,
  roleName,
  userId,
  isSuperadmin = false,
}: Props) {
  const pathname = usePathname();
  const [produzioneNav, setProduzioneNav] =
    useState<readonly NavItem[]>(PRODUZIONE_SECTIONS);
  const sortedAreas = useMemo(() => sortAreasForSidebar(areas), [areas]);
  const showWeb = useMemo(
    () =>
      areas.some((a) => a.slug === "wikiopuntia" || a.slug === "amministrazione"),
    [areas]
  );
  const webSections = useMemo(
    () =>
      webSectionsForAccess({
        italia: areas.some((a) => a.slug === "amministrazione"),
        wiki: areas.some((a) => a.slug === "wikiopuntia"),
      }),
    [areas]
  );
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [userClosed, setUserClosed] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function setRail(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const hasProduzione = areas.some((a) => a.slug === "produzione");
  useEffect(() => {
    if (!hasProduzione) return;
    let cancelled = false;
    function loadNav() {
      void listProduzioneAreeAction()
        .then((res) => {
          if (cancelled || !res.success) return;
          setProduzioneNav(mergeProduzioneNavWithAree(res.items));
        })
        .catch(() => {
          /* menu statico di fallback */
        });
    }
    loadNav();
    window.addEventListener(PRODUZIONE_AREE_NAV_EVENT, loadNav);
    return () => {
      cancelled = true;
      window.removeEventListener(PRODUZIONE_AREE_NAV_EVENT, loadNav);
    };
  }, [hasProduzione]);

  useEffect(() => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      const areaSlug = pathname.match(/^\/app\/([^/]+)/)?.[1] as
        | AreaSlug
        | undefined;
      function addUnlessClosed(key: string) {
        if (!userClosed.has(key)) next.add(key);
      }
      if (isWebHubPath(pathname)) {
        addUnlessClosed("web");
        for (const key of openKeysFromPathname(webSections, pathname, ["web"])) {
          addUnlessClosed(key);
        }
      }
      if (areaSlug) {
        addUnlessClosed(areaSlug);
        const sections = sectionsForArea(areaSlug, produzioneNav);
        if (sections) {
          for (const key of openKeysFromPathname(sections, pathname, [
            areaSlug,
          ])) {
            addUnlessClosed(key);
          }
        }
      }
      return next;
    });
  }, [pathname, webSections, produzioneNav, userClosed]);

  function toggle(...keys: string[]) {
    const isOpen = keys.some((k) => openKeys.has(k));
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        for (const k of keys) next.delete(k);
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
    setUserClosed((closed) => {
      const next = new Set(closed);
      if (isOpen) {
        for (const k of keys) next.add(k);
      } else {
        for (const k of keys) next.delete(k);
      }
      return next;
    });
  }

  function openFirstLevel(slug: string) {
    if (collapsed) setRail(false);
    toggle(slug);
  }

  return (
    <aside
      data-app-sidebar
      className={`flex shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width] duration-200 print:hidden ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div
        className={`border-b border-slate-700 ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}
      >
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-[var(--sidebar-muted)]">
                Industry
              </p>
              <p className="mt-1 truncate font-medium">{userName}</p>
              <p className="truncate text-xs text-[var(--sidebar-muted)]">
                {roleName}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setRail(!collapsed)}
            title={collapsed ? "Espandi menu" : "Comprimi menu"}
            aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
            aria-expanded={!collapsed}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-white"
          >
            <FaBars className="h-4 w-4" />
          </button>
        </div>
      </div>
      <nav className={`flex-1 overflow-y-auto ${collapsed ? "p-1.5" : "p-3"}`}>
        <ul className="space-y-0.5">
          {(() => {
            const rows: Array<
              { type: "web" } | { type: "area"; area: (typeof sortedAreas)[number] }
            > = [];
            let webDone = false;
            for (const area of sortedAreas) {
              rows.push({ type: "area", area });
              if (area.slug === "ricerca-sviluppo" && showWeb && webSections.length) {
                rows.push({ type: "web" });
                webDone = true;
              }
            }
            if (showWeb && webSections.length && !webDone) {
              const afterAdmin = rows.findIndex(
                (r) => r.type === "area" && r.area.slug === "amministrazione"
              );
              if (afterAdmin >= 0) rows.splice(afterAdmin + 1, 0, { type: "web" });
              else rows.unshift({ type: "web" });
            }
            return rows;
          })().map((row) => {
            if (row.type === "web") {
              const open = openKeys.has("web");
              const active = isWebHubPath(pathname);
              return (
                <li key="web">
                  <FirstLevelButton
                    slug="web"
                    label="Web"
                    active={active}
                    rail={collapsed}
                    onToggle={() => openFirstLevel("web")}
                  />
                  {!collapsed && open ? (
                    <NavTree
                      sections={webSections}
                      pathname={pathname}
                      openKeys={openKeys}
                      toggle={toggle}
                    />
                  ) : null}
                </li>
              );
            }

            const area = row.area;
            const href = areaPathFromSlug(area.slug);
            const active =
              area.slug === "amministrazione"
                ? pathMatches(pathname, href) && !isWebHubPath(pathname)
                : pathMatches(pathname, href);
            const treeSections = sectionsForArea(area.slug, produzioneNav);

            const extra =
              area.slug === "chat" ? (
                <ChatUnreadBadge userId={userId} />
              ) : area.slug === "webmail" && isSuperadmin && !collapsed ? (
                <Link
                  href="/app/webmail/impostazioni"
                  title="Impostazioni caselle (SuperAdmin)"
                  aria-label="Impostazioni caselle WebMail"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sidebar-muted)] hover:bg-slate-700 hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FaPlus size={12} />
                </Link>
              ) : null;

            if (treeSections) {
              const open = openKeys.has(area.slug);
              return (
                <li key={area.area_id}>
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    extra={extra}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open && (
                    <NavTree
                      sections={treeSections}
                      pathname={pathname}
                      openKeys={openKeys}
                      toggle={toggle}
                    />
                  )}
                </li>
              );
            }

            if (area.slug === "chat") {
              const open = openKeys.has(area.slug);
              return (
                <li key={area.area_id}>
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    extra={extra}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open ? <ChatSidebarNav userId={userId} /> : null}
                </li>
              );
            }

            if (area.slug === "webmail") {
              const open = openKeys.has(area.slug);
              return (
                <li key={area.area_id}>
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    extra={extra}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open ? <WebmailSidebarNav /> : null}
                </li>
              );
            }

            return (
              <li key={area.area_id}>
                <Link
                  href={href}
                  title={area.name}
                  aria-label={area.name}
                  className={itemClass(active, false, collapsed)}
                >
                  <AreaIcon slug={area.slug} />
                  {collapsed ? null : <span className="truncate">{area.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
