"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createClientePossibileAction,
  listClientiPossibiliAction,
} from "@/app/actions/promemorie-e-note";
import type { ClienteInput } from "@/lib/amministrazione/clienti";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";

export function useClientiPossibili() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listClientiPossibiliAction();
    if (result.success) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addPossibile(
    input: ClienteInput & { referenteIds?: string[] }
  ) {
    const result = await createClientePossibileAction(input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setItems((prev) => [result.item, ...prev]);
    setError(null);
    return result.item;
  }

  return { items, ready, error, addPossibile, refresh };
}
