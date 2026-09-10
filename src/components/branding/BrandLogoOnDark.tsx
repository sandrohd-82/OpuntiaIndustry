import Image from "next/image";
import {
  BRAND_LOGO_MENU,
  BRAND_LOGO_MENU_SIZE,
  BRAND_LOGO_ON_DARK,
  BRAND_LOGO_ON_DARK_SIZE,
  BRAND_NAME,
} from "@/lib/branding/assets";

type Size = "menu" | "menuCollapsed" | "home";

type Props = {
  size?: Size;
  priority?: boolean;
  className?: string;
};

const sizeClass: Record<Size, string> = {
  menu: "h-20 w-auto max-w-[5.5rem]",
  menuCollapsed: "h-12 w-12",
  home: "h-28 w-auto max-w-[18rem] sm:h-36 sm:max-w-[22rem]",
};

/** Logo in scala di grigio per sfondi scuri (sidebar e lastre scure). */
export function BrandLogoOnDark({
  size = "menu",
  priority = false,
  className = "",
}: Props) {
  const menuMark = size === "menu" || size === "menuCollapsed";
  const src = menuMark ? BRAND_LOGO_MENU : BRAND_LOGO_ON_DARK;
  const dim = menuMark ? BRAND_LOGO_MENU_SIZE : BRAND_LOGO_ON_DARK_SIZE;
  return (
    <Image
      src={src}
      alt={BRAND_NAME}
      width={dim.width}
      height={dim.height}
      priority={priority}
      className={`object-contain ${menuMark ? "object-center" : "object-left"} ${sizeClass[size]} ${className}`}
    />
  );
}
