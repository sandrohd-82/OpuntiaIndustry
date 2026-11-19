"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AREE_CONTENUTO, areaMisurabile } from "@/lib/diagnostica/prestazioni";

const EVENTO = "oi-contenuto";

function slugArea(pathname: string): string {
  return areaMisurabile(pathname).split("/")[2] ?? "";
}

function areaMisurata(pathname: string): boolean {
  return (AREE_CONTENUTO as readonly string[]).includes(slugArea(pathname));
}

function emetti(fase: "visibile" | "dati", pathname: string) {
  const slug = slugArea(pathname);
  if (!(AREE_CONTENUTO as readonly string[]).includes(slug)) return;
  window.dispatchEvent(
    new CustomEvent(EVENTO, {
      detail: { fase, area: slug, t: performance.now() },
    })
  );
}

export function SegnaContenutoVisibile() {
  const pathname = usePathname();
  useEffect(() => {
    if (!areaMisurata(pathname)) return;
    emetti("visibile", pathname);
  }, [pathname]);
  return null;
}

export function SegnaDatiPronti() {
  const pathname = usePathname();
  useEffect(() => {
    emetti("dati", pathname);
  }, [pathname]);
  return null;
}

export function segnaDatiPagina() {
  if (typeof window === "undefined") return;
  emetti("dati", window.location.pathname);
}

export function useSegnaDatiPagina(pronto: boolean) {
  const fatto = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!pronto || fatto.current) return;
    fatto.current = true;
    emetti("dati", pathname);
  }, [pronto, pathname]);
}

export function ascoltaContenuto(
  ascolto: (dettaglio: { fase: "visibile" | "dati"; area: string; t: number }) => void
) {
  function onEvento(evento: Event) {
    const dettaglio = (evento as CustomEvent).detail as {
      fase: "visibile" | "dati";
      area: string;
      t: number;
    };
    if (!dettaglio || (dettaglio.fase !== "visibile" && dettaglio.fase !== "dati")) return;
    ascolto(dettaglio);
  }
  window.addEventListener(EVENTO, onEvento);
  return () => window.removeEventListener(EVENTO, onEvento);
}
