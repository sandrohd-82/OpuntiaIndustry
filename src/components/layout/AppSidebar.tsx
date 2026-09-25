"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FaBars,
  FaBolt,
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
  FaBoxArchive,
  FaIndustry,
  FaPlus,
  FaTruck,
  FaHandshake,
  FaWrench,
} from "react-icons/fa6";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { IMPOSTAZIONI_SECTIONS } from "@/lib/areas/impostazioni";
import { COMMERCIALE_SECTIONS } from "@/lib/areas/commerciale";
import { CHAT_SECTIONS } from "@/lib/areas/chat";
import { WEBMAIL_SECTIONS } from "@/lib/areas/webmail";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { ACTION_SECTIONS } from "@/lib/areas/action";
import { AREA_FORNITORI_SECTIONS } from "@/lib/areas/area-fornitori";
import { STRUMENTI_SECTIONS } from "@/lib/areas/strumenti";
import {
  SIDEBAR_AREA_ORDER,
  SIDEBAR_HIDDEN_AREAS,
  areaPathFromSlug,
} from "@/lib/areas/config";
import {
  applyDaProcessareBadge,
  applyPnAttivitaUnreadBadge,
  applyTicketNavBadge,
  filterNavByAdminOnly,
  accordionFromPathname,
  filterNavBySuperAdminOnly,
  isNavBranch,
  type NavBadge,
  type NavItem,
} from "@/lib/areas/nav-tree";
import {
  NAV_ROOT_KEY,
  capNavLayer,
  navContrast,
  toggleAccordion,
  type NavContrast,
} from "@/lib/areas/nav-layer";
import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { bootstrapAppNavAction } from "@/app/actions/nav-bootstrap";
import { ORDINI_DA_PROCESSARE_NAV_EVENT } from "@/lib/amministrazione/ordini-nav";
import { countUnreadNotificheAction } from "@/app/actions/notifiche";
import { NOTIFICHE_NAV_EVENT } from "@/lib/notifiche/nav-event";
import { createClient } from "@/lib/supabase/client";
import {
  MAGAZZINO_MAPPE_NAV_EVENT,
  MAGAZZINO_SECTIONS,
} from "@/lib/areas/magazzino";
import { listMappaMenuNavAction } from "@/app/actions/magazzino-mappa";
import {
  MAPPA_MENU_NAV_EVENT,
  mergeAreaNavWithMappaMenu,
  type MappaMenuFogliaNav,
  type MappaMenuNodo,
} from "@/lib/magazzino/menu-mappa";
import {
  mergeProduzioneNavWithAree,
  PRODUZIONE_AREE_NAV_EVENT,
  PRODUZIONE_SECTIONS,
} from "@/lib/areas/produzione";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { PROMEMORIE_E_NOTE_SECTIONS } from "@/lib/areas/promemorie-e-note";
import { RICERCA_SVILUPPO_SECTIONS } from "@/lib/areas/ricerca-sviluppo";
import {
  filterArchivioNavByAccess,
  mergeArchivioWebmailCaselle,
} from "@/lib/areas/archivio";
import { isWebHubPath, webSectionsForAccess } from "@/lib/areas/web";
import {
  listWebmailMenuAccountsAction,
  setImpersonatedWebmailAreaAccessAction,
} from "@/app/actions/webmail";
import { getTicketNavBadgeAction } from "@/app/actions/strumenti-ticket-impostazioni";
import { TicketNavDots } from "@/components/strumenti/TicketNavDots";
import { TICKET_NAV_EVENT } from "@/lib/strumenti/ticket-nav";
import { ChatUnreadBadge } from "@/components/chat/ChatUnreadBadge";
import { ChatSidebarNav } from "@/components/chat/ChatSidebarNav";
import { WebmailSidebarNav } from "@/components/webmail/WebmailSidebarNav";
import { WEBMAIL_GRANT_NAV_EVENT } from "@/lib/webmail/unread-nav";
import { BrandLogoOnDark } from "@/components/branding/BrandLogoOnDark";
import { ImpersonationSwitcher } from "@/components/layout/ImpersonationSwitcher";
import { MenuAreaAccessToggle } from "@/components/layout/MenuAreaAccessToggle";
import { ProfileStatusLed } from "@/components/layout/ProfileStatusLed";
import { EnablePcNotificationsButton } from "@/components/layout/PushNotificationsProvider";
import {
  filterNavByPageAccess,
  isNavPathVisible,
  toneForAreaAccess,
  toneForNavPath,
  toneForSubtreeAccess,
  WEB_AREA_ACCESS_KEY,
  type AccessTone,
  type PageAccessMap,
} from "@/lib/auth/page-access";
import type { ProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import type { AreaSlug, UserArea } from "@/types/database";

const SIDEBAR_COLLAPSED_KEY = "opuntia.sidebar.collapsed";

type Props = {
  areas: UserArea[];
  userName: string;
  roleName: string;
  userId: string;
  isSuperadmin?: boolean;
  isAdminLike?: boolean;
  canImpersonate?: boolean;
  canCreateProfiles?: boolean;
  impersonating?: boolean;
  actorName?: string;
  statoOperativo?: ProfileStatoOperativo;
  giaAttivato?: boolean;
  pageAccess?: PageAccessMap;
  testMenuMode?: boolean;
  applyPageFilter?: boolean;
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
  produzioneSections: readonly NavItem[] = PRODUZIONE_SECTIONS,
  archivioSections: readonly NavItem[] | null = null,
  magazzinoSections: readonly NavItem[] = MAGAZZINO_SECTIONS,
  menuNodi: MappaMenuNodo[] = [],
  menuMappe: MappaMenuFogliaNav[] = []
): readonly NavItem[] | null {
  let base: readonly NavItem[] | null = null;
  switch (slug) {
    case "produzione":
      base = produzioneSections;
      break;
    case "action":
      base = ACTION_SECTIONS;
      break;
    case "archivio":
      base = archivioSections;
      break;
    case "ricerca-sviluppo":
      base = RICERCA_SVILUPPO_SECTIONS;
      break;
    case "wikiopuntia":
    case "chat":
    case "webmail":
      return null;
    case "magazzino":
      base = magazzinoSections;
      break;
    case "commerciale":
      base = COMMERCIALE_SECTIONS;
      break;
    case "amministrazione":
      base = AMMINISTRAZIONE_SECTIONS;
      break;
    case "area-fiscale":
      base = AREA_FISCALE_SECTIONS;
      break;
    case "strumenti":
      base = STRUMENTI_SECTIONS;
      break;
    case "promemorie-e-note":
      base = PROMEMORIE_E_NOTE_SECTIONS;
      break;
    case "area-fornitori":
      base = AREA_FORNITORI_SECTIONS;
      break;
    case "impostazioni":
      base = IMPOSTAZIONI_SECTIONS;
      break;
    default:
      return null;
  }
  if (!base) return null;
  if (!menuNodi.length && !menuMappe.length) return base;
  return mergeAreaNavWithMappaMenu(slug, base, menuNodi, menuMappe);
}

function AreaIcon({ slug }: { slug: string }) {
  const cls = "h-4 w-4 shrink-0";
  switch (slug) {
    case "dashboard":
      return <FaGaugeHigh className={cls} />;
    case "commerciale":
      return <FaHandshake className={cls} />;
    case "amministrazione":
      return <FaBuilding className={cls} />;
    case "ricerca-sviluppo":
      return <FaFlask className={cls} />;
    case "produzione":
      return <FaIndustry className={cls} />;
    case "action":
      return <FaBolt className={cls} />;
    case "archivio":
      return <FaBoxArchive className={cls} />;
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
    case "strumenti":
      return <FaWrench className={cls} />;
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
  if (badge.kind === "ticket-nav") {
    return (
      <TicketNavDots tickets={badge.tickets} messaggi={badge.messaggi} />
    );
  }
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
      title={
        badge.title ?? `${n} da processare (passare in produzione)`
      }
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

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
      ? "bg-gradient-to-r from-emerald-700 to-red-700 bg-clip-text text-transparent hover:from-emerald-800 hover:to-red-800"
      : "bg-gradient-to-r from-emerald-400 to-red-400 bg-clip-text text-transparent hover:from-emerald-300 hover:to-red-300";
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
  nested = false,
  rail = false,
  tone: AccessTone | null = null,
  contrast: NavContrast = "light"
) {
  const rowTone = tone === "mixed" ? null : tone;
  const toneCls = toneTextClass(rowTone, active ? "dark" : "light");
  void contrast;
  const idleText = "text-[var(--sidebar-muted)]";
  const activeText = "text-slate-700";
  return `flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors ${
    rail ? "justify-center px-2 py-2.5" : "px-3 py-2"
  } ${nested ? "py-1.5" : ""} ${
    active
      ? `bg-white font-medium ${toneCls || activeText}`
      : `${toneCls || idleText} hover:bg-white/10 ${toneCls ? "" : "hover:text-[var(--sidebar-foreground)]"}`
  }`;
}

function labelClass(
  tone: AccessTone | null,
  contrast: NavContrast = "light"
): string {
  return tone === "mixed" ? toneTextClass("mixed", contrast) : "";
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
  tone = null,
  contrast = "light",
  areaAccess = null,
  onToggle,
}: {
  slug: string;
  label: string;
  active: boolean;
  rail: boolean;
  badge?: NavBadge;
  extra?: ReactNode;
  tone?: AccessTone | null;
  contrast?: NavContrast;
  areaAccess?: {
    areaKey: string;
    tone: AccessTone;
    onSet?: (
      visibile: boolean
    ) => Promise<{ success: true } | { success: false; error: string }>;
  } | null;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        title={label}
        aria-label={label}
        className={`min-w-0 flex-1 ${itemClass(active, false, rail, tone, contrast)}`}
      >
        <AreaIcon slug={slug} />
        {rail ? null : (
          <span className={`truncate ${labelClass(tone, active ? "dark" : "light")}`}>{label}</span>
        )}
        {rail || tone !== "mixed" ? null : <MixedToneMark />}
        {rail ? null : badge ? <NavBadgeDot badge={badge} /> : null}
      </button>
      {rail || !areaAccess ? null : (
        <MenuAreaAccessToggle
          areaKey={areaAccess.areaKey}
          tone={areaAccess.tone}
          onSet={areaAccess.onSet}
        />
      )}
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
  tone = null,
  contrast = "light",
  areaAccess = null,
  onToggle,
}: {
  label: string;
  open: boolean;
  active: boolean;
  nested?: boolean;
  badge?: NavBadge;
  tone?: AccessTone | null;
  contrast?: NavContrast;
  areaAccess?: { areaKey: string; tone: AccessTone } | null;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`min-w-0 flex-1 ${itemClass(active, nested, false, tone, contrast)}`}
      >
        <span className={`min-w-0 flex-1 truncate ${labelClass(tone, active ? "dark" : "light")}`}>
          {label}
        </span>
        {tone === "mixed" ? <MixedToneMark /> : null}
        {badge ? <NavBadgeDot badge={badge} /> : null}
        <Chevron open={open} />
      </button>
      {areaAccess ? (
        <MenuAreaAccessToggle areaKey={areaAccess.areaKey} tone={areaAccess.tone} />
      ) : null}
    </div>
  );
}

function NavTree({
  sections,
  pathname,
  openMap,
  toggle,
  parentKey,
  depth,
  pageAccess,
  colorMenu,
  branchToggle = false,
}: {
  sections: readonly NavItem[];
  pathname: string;
  openMap: Record<string, string>;
  toggle: (parentKey: string, childKey: string) => void;
  parentKey: string;
  depth: number;
  pageAccess?: PageAccessMap;
  colorMenu?: boolean;
  branchToggle?: boolean;
}) {
  const parentLayer = depth - 1;
  return (
    <ul className="mt-0.5 ml-2 space-y-0.5 pl-1.5">
      {sections.map((item) => {
        const childItems = isNavBranch(item) ? item.children : [];
        const tone = colorMenu && pageAccess
          ? toneForNavPath(item.path, pageAccess, childItems)
          : null;
        if (isNavBranch(item)) {
          const open = openMap[parentKey] === item.path;
          const layer = open ? depth : parentLayer;
          const contrast = navContrast(layer);
          const active = pathMatches(pathname, item.path);
          const access =
            branchToggle && pageAccess
              ? {
                  areaKey: item.path,
                  tone: toneForSubtreeAccess(item.path, pageAccess, childItems),
                }
              : null;
          return (
            <li
              key={item.path}
              data-nav-layer={open ? capNavLayer(depth) : undefined}
            >
              <BranchButton
                label={item.label}
                open={open}
                active={active}
                nested
                badge={item.badge}
                tone={tone}
                contrast={contrast}
                areaAccess={access}
                onToggle={() => toggle(parentKey, item.path)}
              />
              {open && (
                <NavTree
                  sections={item.children}
                  pathname={pathname}
                  openMap={openMap}
                  toggle={toggle}
                  parentKey={item.path}
                  depth={depth + 1}
                  pageAccess={pageAccess}
                  colorMenu={colorMenu}
                  branchToggle={branchToggle}
                />
              )}
            </li>
          );
        }

        const leafAccess =
          branchToggle && pageAccess
            ? {
                areaKey: item.path,
                tone: toneForSubtreeAccess(item.path, pageAccess),
              }
            : null;
        const contrast = navContrast(parentLayer);
        return (
          <li key={item.path}>
            <div className="flex items-center gap-1">
              <Link
                href={item.path}
                prefetch
                className={`min-w-0 flex-1 ${itemClass(pathname === item.path, true, false, tone, contrast)}`}
              >
                <span className="truncate">{item.label}</span>
                {item.badge ? <NavBadgeDot badge={item.badge} /> : null}
              </Link>
              {leafAccess ? (
                <MenuAreaAccessToggle
                  areaKey={leafAccess.areaKey}
                  tone={leafAccess.tone}
                />
              ) : null}
            </div>
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
  isAdminLike = false,
  canImpersonate = false,
  canCreateProfiles = false,
  impersonating = false,
  actorName = "Super Admin",
  statoOperativo = "operativo",
  giaAttivato = false,
  pageAccess = {},
  testMenuMode = false,
  applyPageFilter = false,
}: Props) {
  const pathname = usePathname();
  const [produzioneNav, setProduzioneNav] =
    useState<readonly NavItem[]>(PRODUZIONE_SECTIONS);
  const [magazzinoNav] = useState<readonly NavItem[]>(MAGAZZINO_SECTIONS);
  const [mappaMenuNodi, setMappaMenuNodi] = useState<MappaMenuNodo[]>([]);
  const [mappaMenuMappe, setMappaMenuMappe] = useState<MappaMenuFogliaNav[]>([]);
  const [archivioNav, setArchivioNav] = useState<readonly NavItem[]>(() =>
    filterArchivioNavByAccess(areas)
  );
  const [webmailGrantTone, setWebmailGrantTone] = useState<AccessTone | null>(
    null
  );
  const [daProcessareCount, setDaProcessareCount] = useState(0);
  const [pnAttivitaUnread, setPnAttivitaUnread] = useState(0);
  const [ticketNav, setTicketNav] = useState({
    tickets: 0,
    messaggi: 0,
  });
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
  const [openMap, setOpenMap] = useState<Record<string, string>>({});
  const [userClosed, setUserClosed] = useState<Set<string>>(() => new Set());
  const userClosedRef = useRef(userClosed);
  userClosedRef.current = userClosed;
  const lastPathnameRef = useRef<string | null>(null);
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

  const hasAmministrazione = areas.some((a) => a.slug === "amministrazione");
  const hasPn = areas.some((a) => a.slug === "promemorie-e-note");
  const hasTicketMenu = areas.some(
    (a) => a.slug === "strumenti" || a.slug === "amministrazione"
  );
  const hasProduzione = areas.some((a) => a.slug === "produzione");
  const hasArchivio = areas.some((a) => a.slug === "archivio");
  const areaSlugsKey = areas.map((a) => a.slug).join(",");
  useEffect(() => {
    let cancelled = false;
    const archivioBase = filterArchivioNavByAccess(areas);
    const wantWebmailAccounts =
      hasArchivio && archivioBase.some((s) => s.slug === "webmail");
    void bootstrapAppNavAction({
      ordini: hasAmministrazione && isAdminLike,
      notifiche: hasPn,
      ticket: hasTicketMenu,
      mappa: true,
      produzione: hasProduzione,
      webmailAccounts: wantWebmailAccounts,
      webmailGrant: testMenuMode && canCreateProfiles,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ordini && res.ordini.success) {
          setDaProcessareCount(res.ordini.totale);
        }
        if (res.notifiche && res.notifiche.success) {
          setPnAttivitaUnread(res.notifiche.totale);
        }
        if (res.ticket && res.ticket.success) {
          setTicketNav({
            tickets: res.ticket.tickets,
            messaggi: res.ticket.messaggi,
          });
        }
        if (res.mappa && res.mappa.success) {
          setMappaMenuNodi(res.mappa.nodi);
          setMappaMenuMappe(res.mappa.mappe);
        }
        if (res.produzione && res.produzione.success) {
          setProduzioneNav(mergeProduzioneNavWithAree(res.produzione.items));
        }
        if (res.webmailAccounts && res.webmailAccounts.success) {
          setArchivioNav(
            mergeArchivioWebmailCaselle(
              archivioBase,
              res.webmailAccounts.accounts.map((a) => ({
                id: a.id,
                label: a.label,
              }))
            )
          );
        } else if (!wantWebmailAccounts) {
          setArchivioNav(archivioBase);
        }
        if (res.webmailGrant && res.webmailGrant.success) {
          setWebmailGrantTone(res.webmailGrant.grantTone);
        }
      })
      .catch(() => {
        /* menu statico di fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [
    areaSlugsKey,
    canCreateProfiles,
    hasAmministrazione,
    hasArchivio,
    hasPn,
    hasProduzione,
    hasTicketMenu,
    isAdminLike,
    testMenuMode,
  ]);
  useEffect(() => {
    if (!hasAmministrazione || !isAdminLike) {
      setDaProcessareCount(0);
      return;
    }
    let cancelled = false;
    function loadCount() {
      void countOrdiniDaProcessareAction()
        .then((res) => {
          if (cancelled || !res.success) return;
          setDaProcessareCount(res.totale);
        })
        .catch(() => {
          /* badge opzionale */
        });
    }
    window.addEventListener(ORDINI_DA_PROCESSARE_NAV_EVENT, loadCount);
    window.addEventListener("focus", loadCount);
    return () => {
      cancelled = true;
      window.removeEventListener(ORDINI_DA_PROCESSARE_NAV_EVENT, loadCount);
      window.removeEventListener("focus", loadCount);
    };
  }, [hasAmministrazione, isAdminLike]);

  useEffect(() => {
    if (!hasPn) {
      setPnAttivitaUnread(0);
      return;
    }
    let cancelled = false;
    function loadUnread() {
      void countUnreadNotificheAction("attivita")
        .then((res) => {
          if (cancelled || !res.success) return;
          setPnAttivitaUnread(res.totale);
        })
        .catch(() => {
          /* badge opzionale */
        });
    }
    const supabase = createClient();
    const channel = supabase
      .channel(`app-notifiche-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifiche",
          filter: `recipient_id=eq.${userId}`,
        },
        loadUnread
      )
      .subscribe();
    window.addEventListener(NOTIFICHE_NAV_EVENT, loadUnread);
    window.addEventListener("focus", loadUnread);
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener(NOTIFICHE_NAV_EVENT, loadUnread);
      window.removeEventListener("focus", loadUnread);
    };
  }, [hasPn, userId]);

  useEffect(() => {
    if (!hasTicketMenu) {
      setTicketNav({ tickets: 0, messaggi: 0 });
      return;
    }
    let cancelled = false;
    function loadTicketBadge() {
      void getTicketNavBadgeAction()
        .then((res) => {
          if (cancelled || !res.success) return;
          setTicketNav({
            tickets: res.tickets,
            messaggi: res.messaggi,
          });
        })
        .catch(() => {
          /* badge opzionale */
        });
    }
    const supabase = createClient();
    const channel = supabase
      .channel(`strumenti-ticket-nav-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strumenti_ticket" },
        loadTicketBadge
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "strumenti_ticket_messaggi",
        },
        loadTicketBadge
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifiche",
          filter: `recipient_id=eq.${userId}`,
        },
        loadTicketBadge
      )
      .subscribe();
    const poll = window.setInterval(loadTicketBadge, 30000);
    window.addEventListener(TICKET_NAV_EVENT, loadTicketBadge);
    window.addEventListener(NOTIFICHE_NAV_EVENT, loadTicketBadge);
    window.addEventListener("focus", loadTicketBadge);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
      window.removeEventListener(TICKET_NAV_EVENT, loadTicketBadge);
      window.removeEventListener(NOTIFICHE_NAV_EVENT, loadTicketBadge);
      window.removeEventListener("focus", loadTicketBadge);
    };
  }, [hasTicketMenu, userId]);

  useEffect(() => {
    let cancelled = false;
    function loadNav() {
      void listMappaMenuNavAction()
        .then((res) => {
          if (cancelled || !res.success) return;
          setMappaMenuNodi(res.nodi);
          setMappaMenuMappe(res.mappe);
        })
        .catch(() => {
          /* menu statico di fallback */
        });
    }
    window.addEventListener(MAPPA_MENU_NAV_EVENT, loadNav);
    window.addEventListener(MAGAZZINO_MAPPE_NAV_EVENT, loadNav);
    return () => {
      cancelled = true;
      window.removeEventListener(MAPPA_MENU_NAV_EVENT, loadNav);
      window.removeEventListener(MAGAZZINO_MAPPE_NAV_EVENT, loadNav);
    };
  }, []);

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
    window.addEventListener(PRODUZIONE_AREE_NAV_EVENT, loadNav);
    return () => {
      cancelled = true;
      window.removeEventListener(PRODUZIONE_AREE_NAV_EVENT, loadNav);
    };
  }, [hasProduzione]);

  useEffect(() => {
    setArchivioNav(filterArchivioNavByAccess(areas));
  }, [areaSlugsKey]);

  useEffect(() => {
    if (!testMenuMode || !canCreateProfiles) {
      setWebmailGrantTone(null);
      return;
    }
    let cancelled = false;
    function reload() {
      void listWebmailMenuAccountsAction().then((res) => {
        if (cancelled || !res.success) return;
        setWebmailGrantTone(res.grantTone);
      });
    }
    window.addEventListener(WEBMAIL_GRANT_NAV_EVENT, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(WEBMAIL_GRANT_NAV_EVENT, reload);
    };
  }, [testMenuMode, canCreateProfiles, userId]);

  useEffect(() => {
    const pathChanged = lastPathnameRef.current !== pathname;
    lastPathnameRef.current = pathname;
    const areaSlug = pathname.match(/^\/app\/([^/]+)/)?.[1] as
      | AreaSlug
      | undefined;
    let chain: Record<string, string> = {};
    if (isWebHubPath(pathname)) {
      chain = accordionFromPathname("web", webSections, pathname, NAV_ROOT_KEY);
    } else if (areaSlug) {
      const sections =
        sectionsForArea(
          areaSlug,
          produzioneNav,
          archivioNav,
          magazzinoNav,
          mappaMenuNodi,
          mappaMenuMappe
        ) ??
        (areaSlug === "chat"
          ? CHAT_SECTIONS
          : areaSlug === "webmail"
            ? WEBMAIL_SECTIONS
            : null);
      chain = accordionFromPathname(areaSlug, sections, pathname, NAV_ROOT_KEY);
    }

    if (pathChanged) {
      setUserClosed(new Set());
      setOpenMap(chain);
      return;
    }

    setOpenMap((prev) => {
      if (
        prev[NAV_ROOT_KEY] &&
        chain[NAV_ROOT_KEY] &&
        prev[NAV_ROOT_KEY] !== chain[NAV_ROOT_KEY]
      ) {
        return prev;
      }
      const closed = userClosedRef.current;
      const next = { ...prev };
      for (const [k, v] of Object.entries(chain)) {
        if (!closed.has(v)) next[k] = v;
      }
      return next;
    });
  }, [
    pathname,
    webSections,
    produzioneNav,
    archivioNav,
    magazzinoNav,
    mappaMenuNodi,
    mappaMenuMappe,
  ]);

  function toggle(parentKey: string, childKey: string) {
    setOpenMap((prev) => {
      const { next, closing } = toggleAccordion(prev, parentKey, childKey);
      setUserClosed((closed) => {
        const copy = new Set(closed);
        if (closing) copy.add(childKey);
        else copy.delete(childKey);
        return copy;
      });
      return next;
    });
  }

  function openFirstLevel(slug: string) {
    if (collapsed) setRail(false);
    toggle(NAV_ROOT_KEY, slug);
  }

  const canToggleAreas = testMenuMode && canCreateProfiles && !collapsed;
  const showWebRow =
    showWeb &&
    webSections.length > 0 &&
    (!applyPageFilter || isNavPathVisible(WEB_AREA_ACCESS_KEY, pageAccess));

  function areaToggle(
    areaKey: string,
    childItems: readonly NavItem[] = []
  ) {
    if (!canToggleAreas) return null;
    return {
      areaKey,
      tone: toneForAreaAccess(areaKey, pageAccess, childItems),
    };
  }

  function toneChildrenForArea(slug: AreaSlug): readonly NavItem[] {
    if (slug === "chat") return CHAT_SECTIONS;
    if (slug === "webmail") return WEBMAIL_SECTIONS;
    return (
      sectionsForArea(
        slug,
        produzioneNav,
        archivioNav,
        magazzinoNav,
        mappaMenuNodi,
        mappaMenuMappe
      ) ?? []
    );
  }

  return (
    <aside
      data-app-sidebar
      className={`relative z-20 flex shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width] duration-200 print:hidden ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <button
        type="button"
        onClick={() => setRail(!collapsed)}
        title={collapsed ? "Espandi menu" : "Comprimi menu"}
        aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
        aria-expanded={!collapsed}
        className="absolute top-3 right-0 z-40 flex h-10 w-10 translate-x-full items-center justify-center rounded-r-md bg-[var(--sidebar)] text-[var(--sidebar-muted)] hover:text-white"
      >
        <FaBars className="h-4 w-4" />
      </button>
      <div
        className={`border-b border-slate-700 ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <BrandLogoOnDark size="menuCollapsed" priority />
            <ProfileStatusLed
              stato={statoOperativo}
              canChange={canCreateProfiles && impersonating}
              giaAttivato={giaAttivato}
            />
          </div>
        ) : (
          <div className="flex min-w-0 items-end gap-2">
            <BrandLogoOnDark size="menu" priority className="shrink-0" />
            <div className="flex h-20 min-w-0 flex-1 flex-col justify-between overflow-visible">
              <div className="pl-[10px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium leading-tight">
                    {userName}
                  </p>
                  <ProfileStatusLed
                    stato={statoOperativo}
                    canChange={canCreateProfiles && impersonating}
                    giaAttivato={giaAttivato}
                  />
                  {canImpersonate ? (
                    <ImpersonationSwitcher
                      impersonating={impersonating}
                      actorLabel={actorName}
                      canCreateProfiles={canCreateProfiles}
                    />
                  ) : null}
                </div>
                <p className="truncate text-xs leading-tight text-[var(--sidebar-muted)]">
                  {roleName}
                </p>
                <EnablePcNotificationsButton compact />
              </div>
              <p className="relative left-[-15%] w-[115%] text-3xl font-bold leading-none tracking-wide">
                Industry
              </p>
            </div>
          </div>
        )}
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
              if (area.slug === "ricerca-sviluppo" && showWebRow) {
                rows.push({ type: "web" });
                webDone = true;
              }
            }
            if (showWebRow && !webDone) {
              const afterAdmin = rows.findIndex(
                (r) => r.type === "area" && r.area.slug === "amministrazione"
              );
              if (afterAdmin >= 0) rows.splice(afterAdmin + 1, 0, { type: "web" });
              else rows.unshift({ type: "web" });
            }
            return rows;
          })().map((row) => {
            if (row.type === "web") {
              const open = openMap[NAV_ROOT_KEY] === "web";
              const active = isWebHubPath(pathname);
              return (
                <li
                  key="web"
                  data-nav-layer={open && !collapsed ? 0 : undefined}
                >
                  <FirstLevelButton
                    slug="web"
                    label="Web"
                    active={active}
                    rail={collapsed}
                    contrast="light"
                    tone={
                      testMenuMode
                        ? toneForAreaAccess(
                            WEB_AREA_ACCESS_KEY,
                            pageAccess,
                            webSections
                          )
                        : null
                    }
                    areaAccess={areaToggle(WEB_AREA_ACCESS_KEY, webSections)}
                    onToggle={() => openFirstLevel("web")}
                  />
                  {!collapsed && open ? (
                    <NavTree
                      sections={
                        applyPageFilter
                          ? filterNavByPageAccess(webSections, pageAccess)
                          : webSections
                      }
                      pathname={pathname}
                      openMap={openMap}
                      toggle={toggle}
                      parentKey="web"
                      depth={1}
                      pageAccess={pageAccess}
                      colorMenu={testMenuMode}
                      branchToggle={canToggleAreas}
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
            const treeSectionsRaw = sectionsForArea(
              area.slug,
              produzioneNav,
              archivioNav,
              magazzinoNav,
              mappaMenuNodi,
              mappaMenuMappe
            );
            const treeSectionsFiltered = treeSectionsRaw
              ? filterNavBySuperAdminOnly(
                  filterNavByAdminOnly(
                    applyPageFilter
                      ? filterNavByPageAccess(treeSectionsRaw, pageAccess)
                      : treeSectionsRaw,
                    isAdminLike
                  ),
                  isSuperadmin
                )
              : null;
            const treeSections =
              area.slug === "produzione" && treeSectionsFiltered
                ? applyDaProcessareBadge(treeSectionsFiltered, daProcessareCount)
                : area.slug === "promemorie-e-note" && treeSectionsFiltered
                  ? applyPnAttivitaUnreadBadge(
                      treeSectionsFiltered,
                      pnAttivitaUnread
                    )
                  : area.slug === "strumenti" && treeSectionsFiltered
                    ? applyTicketNavBadge(treeSectionsFiltered, ticketNav)
                    : treeSectionsFiltered;
            const toneChildren = toneChildrenForArea(area.slug);
            const areaTone = testMenuMode
              ? area.slug === "webmail" && webmailGrantTone
                ? webmailGrantTone
                : toneForAreaAccess(href, pageAccess, toneChildren)
              : null;
            const areaAccess =
              area.slug === "webmail" && canToggleAreas
                ? {
                    areaKey: href,
                    tone: webmailGrantTone ?? "unset",
                    onSet: async (visibile: boolean) => {
                      const res =
                        await setImpersonatedWebmailAreaAccessAction(visibile);
                      if (res.success) {
                        setWebmailGrantTone(visibile ? "on" : "off");
                      }
                      return res;
                    },
                  }
                : areaToggle(href, toneChildren);

            const extra =
              area.slug === "chat" ? (
                <ChatUnreadBadge userId={userId} />
              ) : area.slug === "webmail" && isSuperadmin && !collapsed ? (
                <Link
                  href="/app/webmail/impostazioni"
                  prefetch
                  title="Impostazioni caselle (SuperAdmin)"
                  aria-label="Impostazioni caselle WebMail"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--sidebar-muted)] hover:bg-slate-700 hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FaPlus size={12} />
                </Link>
              ) : null;

            if (treeSections) {
              const open = openMap[NAV_ROOT_KEY] === area.slug;
              return (
                <li
                  key={area.area_id}
                  data-nav-layer={open && !collapsed ? 0 : undefined}
                >
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    badge={
                      area.slug === "promemorie-e-note" && pnAttivitaUnread > 0
                        ? {
                            kind: "count",
                            count: pnAttivitaUnread,
                            title: "Attività in cui sei stato coinvolto",
                          }
                        : area.slug === "strumenti" &&
                            (ticketNav.tickets > 0 || ticketNav.messaggi > 0)
                          ? {
                              kind: "ticket-nav",
                              tickets: ticketNav.tickets,
                              messaggi: ticketNav.messaggi,
                            }
                          : undefined
                    }
                    extra={extra}
                    tone={areaTone}
                    contrast="light"
                    areaAccess={areaAccess}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open && (
                    <NavTree
                      sections={treeSections}
                      pathname={pathname}
                      openMap={openMap}
                      toggle={toggle}
                      parentKey={area.slug}
                      depth={1}
                      pageAccess={pageAccess}
                      colorMenu={testMenuMode}
                      branchToggle={canToggleAreas}
                    />
                  )}
                </li>
              );
            }

            if (area.slug === "chat") {
              const open = openMap[NAV_ROOT_KEY] === area.slug;
              return (
                <li
                  key={area.area_id}
                  data-nav-layer={open && !collapsed ? 0 : undefined}
                >
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    extra={extra}
                    tone={areaTone}
                    contrast="light"
                    areaAccess={areaAccess}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open ? (
                    <ChatSidebarNav
                      userId={userId}
                      pageAccess={pageAccess}
                      colorMenu={testMenuMode}
                      branchToggle={canToggleAreas}
                      layerDepth={1}
                    />
                  ) : null}
                </li>
              );
            }

            if (area.slug === "webmail") {
              const open = openMap[NAV_ROOT_KEY] === area.slug;
              return (
                <li
                  key={area.area_id}
                  data-nav-layer={open && !collapsed ? 0 : undefined}
                >
                  <FirstLevelButton
                    slug={area.slug}
                    label={area.name}
                    active={active}
                    rail={collapsed}
                    extra={extra}
                    tone={areaTone}
                    contrast="light"
                    areaAccess={areaAccess}
                    onToggle={() => openFirstLevel(area.slug)}
                  />
                  {!collapsed && open ? (
                    <WebmailSidebarNav
                      testMenuMode={testMenuMode}
                      branchToggle={canToggleAreas}
                      onGrantToneChange={setWebmailGrantTone}
                      layerDepth={1}
                    />
                  ) : null}
                </li>
              );
            }

            return (
              <li key={area.area_id}>
                <div className="flex items-center gap-1">
                  <Link
                    href={href}
                    prefetch
                    title={area.name}
                    aria-label={area.name}
                    className={`min-w-0 flex-1 ${itemClass(active, false, collapsed, areaTone)}`}
                  >
                    <AreaIcon slug={area.slug} />
                    {collapsed ? null : (
                      <span className={`truncate ${labelClass(areaTone)}`}>
                        {area.name}
                      </span>
                    )}
                  </Link>
                  {areaAccess ? (
                    <MenuAreaAccessToggle
                      areaKey={areaAccess.areaKey}
                      tone={areaAccess.tone}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
