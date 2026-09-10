import { BrandLogoOnDark } from "@/components/branding/BrandLogoOnDark";

type Props = {
  size?: "home" | "compact";
};

/** Logo su lastra scura per pagine chiare (home). */
export function LogoPlaceholder({ size = "home" }: Props) {
  if (size === "compact") {
    return (
      <div
        className="inline-flex items-center justify-center rounded-xl bg-[var(--sidebar)] px-2 py-1.5"
        aria-label="Opuntia Industry"
      >
        <BrandLogoOnDark size="menuCollapsed" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-[var(--sidebar)] px-8 py-7 shadow-sm"
      aria-label="Opuntia Industry"
    >
      <BrandLogoOnDark size="home" priority />
    </div>
  );
}
