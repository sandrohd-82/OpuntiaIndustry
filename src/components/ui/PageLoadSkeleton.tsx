function Box({ className }: { className: string }) {
  return <div className={`ig-pulse rounded-lg ${className}`} />;
}

/** Placeholder Instagram: box in penombra che pulsano durante il load. */
export function PageLoadSkeleton() {
  return (
    <div className="space-y-5 p-5 sm:p-6" role="status" aria-live="polite">
      <span className="sr-only">Caricamento pagina</span>
      <div className="flex items-center justify-between gap-4">
        <Box className="h-8 w-52" />
        <Box className="h-9 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Box className="h-24" />
        <Box className="h-24" />
        <Box className="h-24" />
        <Box className="h-24" />
      </div>
      <Box className="h-10 w-full" />
      <div className="space-y-2 rounded-xl border border-slate-200/80 bg-white/40 p-3">
        <Box className="h-11 w-full" />
        <Box className="h-11 w-full" />
        <Box className="h-11 w-[92%]" />
        <Box className="h-11 w-full" />
        <Box className="h-11 w-[88%]" />
        <Box className="h-11 w-full" />
        <Box className="h-11 w-[94%]" />
      </div>
    </div>
  );
}
