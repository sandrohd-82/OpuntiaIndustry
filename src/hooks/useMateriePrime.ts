"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMateriaPrimaAction,
  listMateriePrimeAction,
  softDeleteMateriaPrimaAction,
  updateMateriaPrimaAction,
} from "@/app/actions/materie-prime";
import type {
  MateriaPrima,
  MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";

export function useMateriePrime() {
  const [materie, setMaterie] = useState<MateriaPrima[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listMateriePrimeAction();
    if (result.success) {
      setMaterie(result.materie);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addMateria(
    input: MateriaPrimaInput
  ): Promise<{ success: true; materia: MateriaPrima } | { success: false; error: string }> {
    const result = await createMateriaPrimaAction(input);
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setMaterie((prev) =>
      [...prev, result.materia].sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return { success: true, materia: result.materia };
  }

  async function updateMateria(
    id: string,
    input: MateriaPrimaInput
  ): Promise<{ success: true; materia: MateriaPrima } | { success: false; error: string }> {
    const result = await updateMateriaPrimaAction(id, input);
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setMaterie((prev) =>
      prev
        .map((item) => (item.id === id ? result.materia : item))
        .sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return { success: true, materia: result.materia };
  }

  async function removeMateria(
    id: string,
    confermaTestuale: string
  ): Promise<
    | { success: true; deleted: true }
    | { success: true; deleted: false; pending: true; message: string }
    | { success: false; error: string }
  > {
    const result = await softDeleteMateriaPrimaAction({ id, confermaTestuale });
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    if (result.deleted) {
      setMaterie((prev) => prev.filter((item) => item.id !== id));
      setError(null);
      return { success: true, deleted: true };
    }
    await refresh();
    setError(null);
    return {
      success: true,
      deleted: false,
      pending: true,
      message: result.message,
    };
  }

  return {
    materie,
    ready,
    error,
    addMateria,
    updateMateria,
    removeMateria,
    refresh,
  };
}
