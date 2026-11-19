"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { ascoltaContenuto } from "@/components/diagnostica/SegnaContenuto";
import {
  azzeraSegnaleRegistroPieno,
  preparaRegistroRisorse,
  registroRisorsePieno,
  risorseRaccolte,
} from "@/components/diagnostica/osservatorio-risorse";
import {
  areaMisurabile,
  chiudiNavigazione,
  LIMITE_NAVIGAZIONE_MS,
  CHIAVE_CLIC_AREA,
  CHIAVE_NAVIGAZIONI,
  CHIAVE_NAVIGAZIONI_OBSOLETA,
  CHIAVE_NAVIGAZIONI_PRECEDENTE,
  CHIAVE_SONDA_PRESTAZIONI,
  type ResocontoNavigazione,
} from "@/lib/diagnostica/prestazioni";

const LIMITE_VOCI = 20;

type Attesa = {
  area: string;
  slug: string;
  partenza: string;
  clic: number;
  nascosta: boolean;
  percorso: number | null;
  contenuto: number | null;
  dati: number | null;
};

function leggi(): ResocontoNavigazione[] {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_NAVIGAZIONI);
    const valore = grezzo ? (JSON.parse(grezzo) as ResocontoNavigazione[]) : [];
    return Array.isArray(valore) ? valore : [];
  } catch {
    return [];
  }
}

function salva(voce: ResocontoNavigazione) {
  try {
    const senza = leggi().filter((item) => item.id !== voce.id);
    sessionStorage.setItem(
      CHIAVE_NAVIGAZIONI,
      JSON.stringify([...senza, voce].slice(-LIMITE_VOCI))
    );
  } catch {
    /* il resoconto resta solo in memoria se lo storage non è disponibile */
  }
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

export function RegistratoreNavigazione() {
  const pathname = usePathname();
  const attesa = useRef<Attesa | null>(null);
  const scadenza = useRef<number | null>(null);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(CHIAVE_SONDA_PRESTAZIONI, "1");
    } catch {
      /* la sonda resta spenta */
    }
  }

  const pubblica = useCallback((chiusa: boolean) => {
    const corrente = attesa.current;
    if (!corrente) return;
    salva(
      chiudiNavigazione({
        area: corrente.percorso == null ? corrente.area : areaMisurabile(window.location.pathname),
        clic: corrente.clic,
        commit: corrente.percorso,
        contenuto: corrente.contenuto,
        dati: corrente.dati,
        ora: performance.now(),
        schedaNascosta: corrente.nascosta || document.hidden,
        chiusa,
        bufferPieno: registroRisorsePieno(),
        risorse: risorseRaccolte(),
      })
    );
  }, []);

  const chiudiSeCompleta = useCallback(() => {
    const corrente = attesa.current;
    if (!corrente || corrente.percorso == null || corrente.contenuto == null || corrente.dati == null) {
      pubblica(false);
      return;
    }
    if (scadenza.current != null) window.clearTimeout(scadenza.current);
    pubblica(true);
    attesa.current = null;
  }, [pubblica]);

  useEffect(() => {
    preparaRegistroRisorse();
    try {
      sessionStorage.removeItem(CHIAVE_NAVIGAZIONI_OBSOLETA);
      sessionStorage.removeItem(CHIAVE_NAVIGAZIONI_PRECEDENTE);
    } catch {
      /* ignore */
    }

    function arma(areaPath: string, partenza: string) {
      if (attesa.current) pubblica(true);
      azzeraSegnaleRegistroPieno();
      const clic = performance.now();
      try {
        sessionStorage.setItem(
          CHIAVE_CLIC_AREA,
          JSON.stringify({ area: areaPath.split("/")[2] ?? "", t: clic })
        );
      } catch {
        /* il clic resta solo nel resoconto */
      }
      attesa.current = {
        area: areaPath,
        slug: areaPath.split("/")[2] ?? "",
        partenza,
        clic,
        nascosta: document.hidden,
        percorso: null,
        contenuto: null,
        dati: null,
      };
      if (scadenza.current != null) window.clearTimeout(scadenza.current);
      scadenza.current = window.setTimeout(() => {
        if (!attesa.current || attesa.current.clic !== clic) return;
        pubblica(true);
        attesa.current = null;
      }, LIMITE_NAVIGAZIONE_MS);
    }

    function onClick(event: MouseEvent) {
      const destinazione = clicInterno(event);
      if (!destinazione) return;
      arma(areaMisurabile(destinazione), window.location.pathname);
    }

    function onPop() {
      arma(areaMisurabile(window.location.pathname), "");
    }

    function onVisibility() {
      if (document.hidden && attesa.current) attesa.current.nascosta = true;
    }

    const smetti = ascoltaContenuto((dettaglio) => {
      const corrente = attesa.current;
      if (!corrente || dettaglio.area !== corrente.slug) return;
      if (dettaglio.fase === "visibile" && corrente.contenuto == null) {
        corrente.contenuto = dettaglio.t;
      }
      if (dettaglio.fase === "dati" && corrente.dati == null) corrente.dati = dettaglio.t;
      chiudiSeCompleta();
    });

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      smetti();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onVisibility);
      if (scadenza.current != null) window.clearTimeout(scadenza.current);
    };
  }, [chiudiSeCompleta, pubblica]);

  useEffect(() => {
    const corrente = attesa.current;
    if (!corrente || pathname === corrente.partenza) return;
    if (areaMisurabile(pathname) !== corrente.area) return;
    corrente.percorso = performance.now();
    chiudiSeCompleta();
  }, [chiudiSeCompleta, pathname]);

  return null;
}
