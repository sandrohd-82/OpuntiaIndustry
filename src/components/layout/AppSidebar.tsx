import Link from "next/link";
import { areaPathFromSlug } from "@/lib/areas/config";
import type { UserArea } from "@/types/database";

type Props = {
  areas: UserArea[];
  currentSlug?: string;
  userName: string;
  roleName: string;
};

export function AppSidebar({
  areas,
  currentSlug,
  userName,
  roleName,
}: Props) {
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
            const active = currentSlug === area.slug;
            return (
              <li key={area.area_id}>
                <Link
                  href={href}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[var(--sidebar-active)] font-medium"
                      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]"
                  }`}
                >
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
