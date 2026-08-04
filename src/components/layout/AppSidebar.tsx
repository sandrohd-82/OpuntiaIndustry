"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaPathFromSlug } from "@/lib/areas/config";
import {
  isNavBranch,
  PRODUZIONE_SECTIONS,
  type ProduzioneNavItem,
} from "@/lib/areas/produzione";
import type { UserArea } from "@/types/database";

type Props = {
  areas: UserArea[];
  userName: string;
  roleName: string;
};

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

function ProduzioneTree({
  pathname,
  openKeys,
  toggle,
}: {
  pathname: string;
  openKeys: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
      {PRODUZIONE_SECTIONS.map((item: ProduzioneNavItem) => {
        if (isNavBranch(item)) {
          const open = openKeys.has(item.slug);
          const active = pathMatches(pathname, item.path);
          return (
            <li key={item.slug}>
              <BranchButton
                label={item.label}
                open={open}
                active={active}
                nested
                onToggle={() => toggle(item.slug)}
              />
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
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  // Apre solo i rami del percorso corrente (il resto resta compresso)
  useEffect(() => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (pathname.startsWith("/app/produzione")) {
        next.add("produzione");
        if (pathname.startsWith("/app/produzione/essiccatori")) {
          next.add("essiccatori");
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
          {areas.map((area) => {
            const href = areaPathFromSlug(area.slug);
            const hasChildren = area.slug === "produzione";
            const active = pathMatches(pathname, href);

            if (hasChildren) {
              const open = openKeys.has("produzione");
              return (
                <li key={area.area_id}>
                  <BranchButton
                    label={area.name}
                    open={open}
                    active={active}
                    onToggle={() => toggle("produzione")}
                  />
                  {open && (
                    <ProduzioneTree
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
