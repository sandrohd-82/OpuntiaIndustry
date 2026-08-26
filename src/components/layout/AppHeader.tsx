import { signOut } from "@/app/actions/auth";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  /** Contenuto a sinistra del bottone Esci (es. ricerca chat). */
  actions?: ReactNode;
};

export function AppHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Esci
          </button>
        </form>
      </div>
    </header>
  );
}
