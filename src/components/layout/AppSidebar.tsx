"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { COMMERCIALE_SECTIONS } from "@/lib/areas/commerciale";
import { areaPathFromSlug } from "@/lib/areas/config";
import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";
import type { AreaSlug, UserArea } from "@/types/database";

type Props = {
  areas: UserArea[];
  userName: string;
  roleName: string;
};

/** Ordine menu: Area Fiscale sotto Risorse umane, sopra Impostazioni */
const SIDEBAR_AREA_ORDER: AreaSlug[] = [
  "dashboard",
  "amministrazione",
  "commerciale",
  "produzione",
  "magazzino",
  "acquisti",
  "hr",
  "area-fiscale",
  "impostazioni",
];

function sortAreasForSidebar(areas: UserArea[]) {
  const rank = new Map(SIDEBAR_AREA_ORDER.map((slug, i) => [slug, i]));
  return [...areas].sort((a, b) => {
    const ra = rank.get(a.slug) ?? 1000 + a.sort_order;
    const rb = rank.get(b.slug) ?? 1000 + b.sort_order;
    return ra - rb;
  });
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

function itemClass(active: boolean, nested = false) {
  return `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
    nested ? "py-1.5" : ""
  } ${
    active
      ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-foreground)]"
      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]"
  }`;
}

function pathMatches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function BranchButton({
  label,
  open,
  active,
  nested,
  onToggle,
}: {
  label: string;
  open: boolean;
  active: boolean;
  nested?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={itemClass(active, nested)}
    >
      <Chevron open={open} />
      <span className="truncate">{label}</span>
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
  toggle: (key: string) => void;
}) {
  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
      {sections.map((item) => {
        if (isNavBranch(item)) {
          const open = openKeys.has(item.slug);
          // Come le altre aree: non evidenziare il ramo padre quando è attiva una sotto-voce
          const active = pathname === item.path;
          const hubLink = item.slug === "grafici";
          return (
            <li key={item.slug}>
              {hubLink ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(item.slug)}
                    aria-expanded={open}
                    aria-label={`${open ? "Chiudi" : "Apri"} ${item.label}`}
                    className={itemClass(active, true).replace(
                      "w-full",
                      "shrink-0 px-2"
                    )}
                  >
                    <Chevron open={open} />
                  </button>
                  <Link
                    href={item.path}
                    className={`${itemClass(active, true)} flex-1`}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </div>
              ) : (
                <BranchButton
                  label={item.label}
                  open={open}
                  active={active}
                  nested
                  onToggle={() => toggle(item.slug)}
                />
              )}
              {open && (
                <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
                  {item.children.map((child) => (
                    <li key={child.slug}>
                      <Link
                        href={child.path}
                        className={itemClass(pathname === child.path, true)}
                      >
                        <span className="truncate">{child.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        }

        return (
          <li key={item.slug}>
            <Link
              href={item.path}
              className={itemClass(pathname === item.path, true)}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppSidebar({ areas, userName, roleName }: Props) {
  const pathname = usePathname();
  const sortedAreas = useMemo(() => sortAreasForSidebar(areas), [areas]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (pathname.startsWith("/app/produzione")) {
        next.add("produzione");
        if (pathname.startsWith("/app/produzione/essiccatori")) {
          next.add("essiccatori");
        }
      }
      if (pathname.startsWith("/app/amministrazione")) {
        next.add("amministrazione");
        if (pathname.startsWith("/app/amministrazione/ordini")) {
          next.add("ordini");
        }
        if (pathname.startsWith("/app/amministrazione/fatture")) {
          next.add("fatture");
        }
        if (pathname.startsWith("/app/amministrazione/schede")) {
          next.add("schede");
        }
        if (pathname.startsWith("/app/amministrazione/dipendenti")) {
          next.add("dipendenti");
        }
        if (pathname.startsWith("/app/amministrazione/grafici")) {
          next.add("grafici");
        }
      }
      if (pathname.startsWith("/app/area-fiscale")) {
        next.add("area-fiscale");
      }
      if (pathname.startsWith("/app/commerciale")) {
        next.add("commerciale");
        if (pathname.startsWith("/app/commerciale/clienti-con-storico")) {
          next.add("clienti-con-storico");
        }
        if (pathname.startsWith("/app/commerciale/clienti-contattati")) {
          next.add("clienti-contattati");
        }
      }
      return next;
    });
  }, [pathname]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="border-b border-slate-700 px-4 py-5">
        <p className="text-xs uppercase tracking-wider text-[var(--sidebar-muted)]">
          Industry
        </p>
        <p className="mt-1 truncate font-medium">{userName}</p>
        <p className="truncate text-xs text-[var(--sidebar-muted)]">
          {roleName}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {sortedAreas.map((area) => {
            const href = areaPathFromSlug(area.slug);
            const active = pathMatches(pathname, href);
            const treeSections =
              area.slug === "produzione"
                ? PRODUZIONE_SECTIONS
                : area.slug === "amministrazione"
                  ? AMMINISTRAZIONE_SECTIONS
                  : area.slug === "commerciale"
                    ? COMMERCIALE_SECTIONS
                    : area.slug === "area-fiscale"
                      ? AREA_FISCALE_SECTIONS
                      : null;

            if (treeSections) {
              const open = openKeys.has(area.slug);
              return (
                <li key={area.area_id}>
                  <BranchButton
                    label={area.name}
                    open={open}
                    active={active}
                    onToggle={() => toggle(area.slug)}
                  />
                  {open && (
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

            return (
              <li key={area.area_id}>
                <Link href={href} className={itemClass(active)}>
                  <span className="truncate">{area.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
