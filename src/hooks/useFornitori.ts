"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFornitoreAction,
  listFornitoriAction,
} from "@/app/actions/fornitori";
import type { Fornitore, FornitoreInput } from "@/lib/amministrazione/fornitori";

export function useFornitori() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listFornitoriAction();
    if (result.success) {
      setFornitori(result.fornitori);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addFornitore(input: FornitoreInput) {
    const result = await createFornitoreAction(input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setFornitori((prev) => [result.fornitore, ...prev]);
    setError(null);
    return result.fornitore;
  }

  return { fornitori, ready, error, addFornitore, refresh };
}
