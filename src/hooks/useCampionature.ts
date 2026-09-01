"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listCampionatureAction,
  softDeleteCampionaturaAction,
} from "@/app/actions/campionature";
import type { Campionatura } from "@/lib/amministrazione/campionature";

export function useCampionature(refreshToken = 0) {
  const [items, setItems] = useState<Campionatura[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listCampionatureAction();
    if (result.success) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh, refreshToken]);

  function upsertLocal(item: Campionatura) {
    setItems((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  }

  async function removeItem(
    id: string
  ): Promise<{ success: true } | { success: false; error: string }> {
    const result = await softDeleteCampionaturaAction(id);
    if (!result.success) {
      setError(result.error);
      return result;
    }
    setItems((prev) => prev.filter((c) => c.id !== id));
    setError(null);
    return { success: true };
  }

  return { items, ready, error, refresh, upsertLocal, removeItem };
}
