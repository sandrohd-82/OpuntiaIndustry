export function isFluidaLinked(item: {
  fluidaContractId?: string | null;
  fluidaUserId?: string | null;
}): boolean {
  return Boolean(item.fluidaContractId || item.fluidaUserId);
}

export function FluidaLinkBadge({
  linked,
  compact = false,
}: {
  linked: boolean;
  compact?: boolean;
}) {
  if (linked) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
        title="Questa persona è collegata a Fluida"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        {compact ? "Fluida" : "Collegato"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
      title="Questa persona non è ancora collegata a Fluida"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      {compact ? "No" : "Non collegato"}
    </span>
  );
}
