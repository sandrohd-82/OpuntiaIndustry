"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  areaMisurabile,
  chiudiNavigazione,
  CHIAVE_NAVIGAZIONI,
  CHIAVE_NAVIGAZIONI_OBSOLETA,
  type ResocontoNavigazione,
  type RisorsaOsservata,
} from "@/lib/diagnostica/prestazioni";

const LIMITE_VOCI = 20;

function salva(voce: ResocontoNavigazione) {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_NAVIGAZIONI);
    const attuale = grezzo ? (JSON.parse(grezzo) as ResocontoNavigazione[]) : [];
    const tutte = [...(Array.isArray(attuale) ? attuale : []), voce].slice(-LIMITE_VOCI);
    sessionStorage.setItem(CHIAVE_NAVIGAZIONI, JSON.stringify(tutte));
  } catch {
    /* il resoconto resta solo in memoria se lo storage non è disponibile */
  }
}

function risorseOsservate(): RisorsaOsservata[] {
  return performance.getEntriesByType("resource").map((voce) => {
    const risorsa = voce as PerformanceResourceTiming;
    let middlewareMs: number | null = null;
    for (const parte of risorsa.serverTiming ?? []) {
      if (parte.name === "middleware") middlewareMs = Math.round(parte.duration);
    }
    return {
      nome: risorsa.name,
      start: risorsa.startTime,
      requestStart: risorsa.requestStart,
      responseStart: risorsa.responseStart,
      responseEnd: risorsa.responseEnd,
      duration: risorsa.duration,
      middlewareMs,
    };
  });
}

function clicInterno(event: MouseEvent): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const anchor = (event.target as HTMLElement | null)?.closest("a");
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) {
    return null;
  }
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  try {
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/app")) return null;
    if (url.pathname === window.location.pathname) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

type Attesa = { area: string; partenza: string; clic: number; nascosta: boolean };

export function RegistratoreNavigazione() {
  const pathname = usePathname();
  const attesa = useRef<Attesa | null>(null);
  const scadenza = useRef<number | null>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem(CHIAVE_NAVIGAZIONI_OBSOLETA);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function apri(area: string, partenza: string) {
      attesa.current = {
        area,
        partenza,
        clic: performance.now(),
        nascosta: document.hidden,
      };
      if (scadenza.current != null) window.clearTimeout(scadenza.current);
      const clic = attesa.current.clic;
      scadenza.current = window.setTimeout(() => {
        const corrente = attesa.current;
        if (!corrente || corrente.clic !== clic) return;
        salva(
          chiudiNavigazione({
            area: corrente.area,
            clic: corrente.clic,
            commit: null,
            ora: performance.now(),
            schedaNascosta: corrente.nascosta || document.hidden,
            risorse: risorseOsservate(),
          })
        );
        attesa.current = null;
      }, 20_000);
    }

    function onClick(event: MouseEvent) {
      const destinazione = clicInterno(event);
      if (!destinazione) return;
      apri(areaMisurabile(destinazione), window.location.pathname);
    }

    function onPop() {
      apri(areaMisurabile(window.location.pathname), "");
    }

    function onVisibility() {
      if (document.hidden && attesa.current) attesa.current.nascosta = true;
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onVisibility);
      if (scadenza.current != null) window.clearTimeout(scadenza.current);
    };
  }, []);

  useEffect(() => {
    const corrente = attesa.current;
    if (!corrente || pathname === corrente.partenza) return;
    if (areaMisurabile(pathname) !== corrente.area) return;
    if (scadenza.current != null) window.clearTimeout(scadenza.current);
    salva(
      chiudiNavigazione({
        area: areaMisurabile(pathname),
        clic: corrente.clic,
        commit: performance.now(),
        ora: performance.now(),
        schedaNascosta: corrente.nascosta || document.hidden,
        risorse: risorseOsservate(),
      })
    );
    attesa.current = null;
  }, [pathname]);

  return null;
}
