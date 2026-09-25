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
    <div className="space-y-3 p-1" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="ig-pulse h-7 w-44 rounded-lg" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="ig-pulse h-20 rounded-lg" />
        <div className="ig-pulse h-20 rounded-lg" />
      </div>
      <div className="ig-pulse h-10 w-full rounded-lg" />
      <div className="space-y-2">
        <div className="ig-pulse h-11 w-full rounded-lg" />
        <div className="ig-pulse h-11 w-[94%] rounded-lg" />
        <div className="ig-pulse h-11 w-full rounded-lg" />
        <div className="ig-pulse h-11 w-[88%] rounded-lg" />
      </div>
    </div>
  );
}
