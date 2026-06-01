import { AppHeader } from "@/components/layout/AppHeader";

type Props = {
  title: string;
  description: string;
};

export function AreaPlaceholder({ title, description }: Props) {
  return (
    <>
      <AppHeader title={title} subtitle={description} />
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-[var(--muted)]">
            Modulo in fase di implementazione. La struttura di routing e i
            permessi per ruolo sono già attivi.
          </p>
        </div>
      </div>
    </>
  );
}
