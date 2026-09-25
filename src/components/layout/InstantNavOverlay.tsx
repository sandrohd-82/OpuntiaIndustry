"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageLoadSkeleton } from "@/components/ui/PageLoadSkeleton";

function isInternalAppNav(anchor: HTMLAnchorElement, pathname: string): boolean {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  try {
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    if (!url.pathname.startsWith("/app")) return false;
    return url.pathname !== pathname;
  } catch {
    return false;
  }
}

/** All'istante del click mostra i box in pulsazione; sparisce al cambio pagina. */
export function InstantNavOverlay() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalAppNav(anchor, pathname)) return;
      setPending(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      className="absolute inset-0 z-40 overflow-auto bg-slate-100/75 backdrop-blur-[1px] print:hidden"
      aria-busy="true"
    >
      <PageLoadSkeleton />
    </div>
  );
}
