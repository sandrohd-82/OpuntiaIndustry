"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createClientePossibileAction,
  listClientiPossibiliSceltaAction,
} from "@/app/actions/promemorie-e-note";
import type { ClienteInput } from "@/lib/amministrazione/clienti";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";

type Esito =
  | { success: true; items: ClientePossibile[] }
  | { success: false; error: string };

let cache: ClientePossibile[] | null = null;
let inVolo: Promise<Esito> | null = null;

function caricaScelta(): Promise<Esito> {
  if (cache) return Promise.resolve({ success: true, items: cache });
  if (inVolo) return inVolo;
  inVolo = listClientiPossibiliSceltaAction()
    .then((result) => {
      if (result.success) cache = result.items;
      return result;
    })
    .finally(() => {
      inVolo = null;
    });
  return inVolo;
}

export function useClientiPossibili() {
  const [items, setItems] = useState<ClientePossibile[]>(cache ?? []);
  const [ready, setReady] = useState(cache != null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    cache = null;
    const result = await caricaScelta();
    if (result.success) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    void caricaScelta().then((result) => {
      if (cancel) return;
      if (result.success) {
        setItems(result.items);
        setError(null);
      } else {
        setError(result.error);
      }
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  async function addPossibile(
    input: ClienteInput & { referenteIds?: string[] }
  ) {
    const result = await createClientePossibileAction(input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    cache = cache ? [result.item, ...cache] : [result.item];
    setItems((prev) => [result.item, ...prev]);
    setError(null);
    return result.item;
  }

  return { items, ready, error, addPossibile, refresh };
}
