"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createOrdineStoricoManuale,
  loadOrdiniStorico,
  saveOrdiniStorico,
  type OrdineStorico,
} from "@/lib/amministrazione/ordini";

export function useOrdiniStorico() {
  const [ordini, setOrdini] = useState<OrdineStorico[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    const list = loadOrdiniStorico();
    list.sort((a, b) => {
      const byConsegna = b.dataConsegna.localeCompare(a.dataConsegna);
      if (byConsegna !== 0) return byConsegna;
      return b.createdAt.localeCompare(a.createdAt);
    });
    setOrdini(list);
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    function onUpdate() {
      refresh();
    }
    window.addEventListener("opuntia-ordini-storico-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("opuntia-ordini-storico-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [refresh]);

  function addOrdineStorico(input: {
    cliente: string;
    clienteId?: string;
    dataOrdine: string;
    dataConsegna: string;
    importoEuro: number;
    note?: string;
    numero?: string;
  }) {
    const ordine = createOrdineStoricoManuale({
      ...input,
      existing: ordini,
    });
    const next = [ordine, ...ordini];
    setOrdini(next);
    saveOrdiniStorico(next);
    return ordine;
  }

  return { ordini, ready, addOrdineStorico, refresh };
}
