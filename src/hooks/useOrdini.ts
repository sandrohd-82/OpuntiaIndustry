"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listOrdiniAction,
  softDeleteOrdineAction,
} from "@/app/actions/ordini";
import type { Ordine } from "@/lib/amministrazione/ordini";
import type { OrdineStato } from "@/types/database";

export function useOrdini(stato: OrdineStato | OrdineStato[]) {
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listOrdiniAction(stato);
    if (result.success) {
      setOrdini(result.ordini);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [JSON.stringify(stato)]);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function removeOrdine(
    id: string,
    confermaTestuale: string
  ): Promise<{ success: true } | { success: false; error: string }> {
    const result = await softDeleteOrdineAction({ id, confermaTestuale });
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setOrdini((prev) => prev.filter((o) => o.id !== id));
    setError(null);
    return { success: true };
  }

  function upsertLocal(ordine: Ordine) {
    setOrdini((prev) => {
      const idx = prev.findIndex((o) => o.id === ordine.id);
      if (idx === -1) return [ordine, ...prev];
      const next = [...prev];
      next[idx] = ordine;
      return next;
    });
  }

  return {
    ordini,
    ready,
    error,
    refresh,
    removeOrdine,
    upsertLocal,
  };
}
