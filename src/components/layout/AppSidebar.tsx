"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaPathFromSlug } from "@/lib/areas/config";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";
import type { UserArea } from "@/types/database";

type Props = {
  areas: UserArea[];
  userName: string;
  roleName: string;
};

function navClass(active: boolean) {
  return `block rounded-lg px-3 py-2 text-sm transition-colors ${
    active
      ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-foreground)]"
      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]"
  }`;
}

export function AppSidebar({ areas, userName, roleName }: Props) {
  const pathname = usePathname();
  const inProduzione = pathname.startsWith("/app/produzione");

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
            const isProduzione = area.slug === "produzione";
            const active = isProduzione
              ? inProduzione
              : pathname === href || pathname.startsWith(`${href}/`);

            if (isProduzione) {
              return (
                <li key={area.area_id}>
                  <Link href={PRODUZIONE_SECTIONS[0].path} className={navClass(active)}>
                    {area.name}
                  </Link>
                  <ul className="mt-0.5 space-y-0.5 border-l border-slate-700 ml-3 pl-2">
                    {PRODUZIONE_SECTIONS.map((section) => {
                      const sectionActive = pathname === section.path;
                      return (
                        <li key={section.slug}>
                          <Link
                            href={section.path}
                            className={navClass(sectionActive)}
                          >
                            {section.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

            return (
              <li key={area.area_id}>
                <Link href={href} className={navClass(active)}>
                  {area.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
