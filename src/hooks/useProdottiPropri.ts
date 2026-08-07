"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createProdottoProprioAction,
  listProdottiPropriAction,
  updateProdottoProprioAction,
} from "@/app/actions/prodotti-propri";
import type {
  ProdottoProprio,
  ProdottoProprioInput,
} from "@/lib/amministrazione/prodotti-propri";

export function useProdottiPropri() {
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listProdottiPropriAction();
    if (result.success) {
      setProdotti(result.prodotti);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addProdotto(
    input: ProdottoProprioInput
  ): Promise<
    | { success: true; prodotto: ProdottoProprio }
    | { success: false; error: string }
  > {
    const result = await createProdottoProprioAction(input);
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setProdotti((prev) =>
      [...prev, result.prodotto].sort((a, b) =>
        a.codice.localeCompare(b.codice)
      )
    );
    setError(null);
    return { success: true, prodotto: result.prodotto };
  }

  async function updateProdotto(
    id: string,
    input: ProdottoProprioInput
  ): Promise<
    | { success: true; prodotto: ProdottoProprio }
    | { success: false; error: string }
  > {
    const result = await updateProdottoProprioAction(id, input);
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setProdotti((prev) =>
      prev
        .map((item) => (item.id === id ? result.prodotto : item))
        .sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return { success: true, prodotto: result.prodotto };
  }

  return { prodotti, ready, error, addProdotto, updateProdotto, refresh };
}
