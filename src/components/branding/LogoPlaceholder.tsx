type Props = {
  size?: "home" | "compact";
};

const sizes = {
  home: "h-40 w-40 sm:h-52 sm:w-52",
  compact: "h-12 w-12",
};

export function LogoPlaceholder({ size = "home" }: Props) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--card)] shadow-sm ${sizes[size]}`}
      role="img"
      aria-label="Logo Industry — segnaposto"
    >
      <span
        className={
          size === "home"
            ? "text-lg font-semibold tracking-widest text-[var(--muted)] sm:text-xl"
            : "text-xs font-semibold text-[var(--muted)]"
        }
      >
        LOGO
      </span>
    </div>
  );
}
