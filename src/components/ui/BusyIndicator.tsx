type SpinnerProps = {
  className?: string;
};

export function BusySpinner({ className = "" }: SpinnerProps) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-600 border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

export function BusyBanner({ label }: { label: string }) {
  return (
    <p
      className="inline-flex items-center gap-2 text-xs font-medium text-sky-800"
      role="status"
      aria-live="polite"
    >
      <BusySpinner />
      {label}
    </p>
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <p
      className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"
      role="status"
      aria-live="polite"
    >
      <BusySpinner />
      <span>{label}</span>
    </p>
  );
}
