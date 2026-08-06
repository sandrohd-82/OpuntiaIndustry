"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFornitore,
  loadFornitori,
  saveFornitori,
  type Fornitore,
  type FornitoreInput,
} from "@/lib/amministrazione/fornitori";

export function useFornitori() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setFornitori(loadFornitori());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    function onUpdate() {
      refresh();
    }
    window.addEventListener("opuntia-fornitori-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("opuntia-fornitori-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  function addFornitore(input: FornitoreInput) {
    const fornitore = createFornitore(input);
    const next = [fornitore, ...fornitori];
    setFornitori(next);
    saveFornitori(next);
    return fornitore;
  }

  return { fornitori, ready, addFornitore, refresh };
}
