"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createAttivitaAction,
  listAttivitaAction,
  softDeleteAttivitaAction,
  updateAttivitaAction,
} from "@/app/actions/attivita";
import type { Attivita, AttivitaInput } from "@/lib/amministrazione/attivita";

export function useAttivita() {
  const [attivita, setAttivita] = useState<Attivita[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listAttivitaAction();
    if (result.success) {
      setAttivita(result.attivita);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addAttivita(input: AttivitaInput) {
    const result = await createAttivitaAction(input);
    if (!result.success) {
      setError(result.error);
      return result;
    }
    setAttivita((prev) =>
      [...prev, result.attivita].sort((a, b) =>
        a.codice.localeCompare(b.codice)
      )
    );
    setError(null);
    return result;
  }

  async function updateAttivita(id: string, input: AttivitaInput) {
    const result = await updateAttivitaAction(id, input);
    if (!result.success) {
      setError(result.error);
      return result;
    }
    setAttivita((prev) =>
      prev
        .map((item) => (item.id === id ? result.attivita : item))
        .sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return result;
  }

  async function removeAttivita(id: string, confermaTestuale: string) {
    const result = await softDeleteAttivitaAction({ id, confermaTestuale });
    if (!result.success) {
      setError(result.error);
      return result;
    }
    setAttivita((prev) => prev.filter((item) => item.id !== id));
    setError(null);
    return result;
  }

  return {
    attivita,
    ready,
    error,
    refresh,
    addAttivita,
    updateAttivita,
    removeAttivita,
  };
}
