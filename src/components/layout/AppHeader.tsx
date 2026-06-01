import { signOut } from "@/app/actions/auth";

type Props = {
  title: string;
  subtitle?: string;
};

export function AppHeader({ title, subtitle }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Esci
        </button>
      </form>
    </header>
  );
}
