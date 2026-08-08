"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createOrdineRicevuto,
  loadOrdiniRicevuti,
  saveOrdiniRicevuti,
  type OrdineDettaglioInput,
  type OrdineRicevuto,
} from "@/lib/amministrazione/ordini";

export function useOrdiniRicevuti() {
  const [ordini, setOrdini] = useState<OrdineRicevuto[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setOrdini(loadOrdiniRicevuti());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    function onUpdate() {
      refresh();
    }
    window.addEventListener("opuntia-ordini-ricevuti-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("opuntia-ordini-ricevuti-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  function addOrdine(input: OrdineDettaglioInput) {
    const ordine = createOrdineRicevuto({ ...input, existing: ordini });
    const next = [ordine, ...ordini];
    setOrdini(next);
    saveOrdiniRicevuti(next);
    return ordine;
  }

  return { ordini, ready, addOrdine, refresh };
}
