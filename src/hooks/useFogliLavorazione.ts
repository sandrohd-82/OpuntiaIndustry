"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFoglioLavorazione,
  isFoglioAperto,
  loadFogliFromStorage,
  saveFogliToStorage,
  type FoglioLavorazione,
} from "@/lib/produzione/fogli-lavorazione";

export function useFogliLavorazione() {
  const [fogli, setFogli] = useState<FoglioLavorazione[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setFogli(loadFogliFromStorage());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    function onUpdate() {
      refresh();
    }
    window.addEventListener("opuntia-fogli-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("opuntia-fogli-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  const persist = useCallback((next: FoglioLavorazione[]) => {
    setFogli(next);
    saveFogliToStorage(next);
  }, []);

  const fogliAperti = fogli.filter(isFoglioAperto);

  function createFoglio(input: {
    prodotto: string;
    descrizione?: string;
    note?: string;
  }) {
    const foglio = createFoglioLavorazione({ ...input, existing: fogli });
    persist([foglio, ...fogli]);
    return foglio;
  }

  function closeFoglio(id: string) {
    const now = new Date().toISOString();
    persist(
      fogli.map((f) =>
        f.id === id ? { ...f, stato: "chiuso", closedAt: now } : f
      )
    );
  }

  return {
    fogli,
    fogliAperti,
    ready,
    createFoglio,
    closeFoglio,
    refresh,
  };
}
