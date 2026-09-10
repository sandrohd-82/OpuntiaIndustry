import Image from "next/image";
import {
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
  menu: "h-8 w-auto max-w-[11rem]",
  menuCollapsed: "h-7 w-auto max-w-[2.75rem]",
  home: "h-28 w-auto max-w-[18rem] sm:h-36 sm:max-w-[22rem]",
};

/** Logo in scala di grigio per sfondi scuri (sidebar e lastre scure). */
export function BrandLogoOnDark({
  size = "menu",
  priority = false,
  className = "",
}: Props) {
  return (
    <Image
      src={BRAND_LOGO_ON_DARK}
      alt={BRAND_NAME}
      width={BRAND_LOGO_ON_DARK_SIZE.width}
      height={BRAND_LOGO_ON_DARK_SIZE.height}
      priority={priority}
      className={`object-contain object-left ${sizeClass[size]} ${className}`}
    />
  );
}
