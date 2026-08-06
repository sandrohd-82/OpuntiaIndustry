"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMateriaPrimaAction,
  listMateriePrimeAction,
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

  async function addMateria(input: MateriaPrimaInput) {
    const result = await createMateriaPrimaAction(input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setMaterie((prev) =>
      [...prev, result.materia].sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return result.materia;
  }

  async function updateMateria(id: string, input: MateriaPrimaInput) {
    const result = await updateMateriaPrimaAction(id, input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setMaterie((prev) =>
      prev
        .map((item) => (item.id === id ? result.materia : item))
        .sort((a, b) => a.codice.localeCompare(b.codice))
    );
    setError(null);
    return result.materia;
  }

  return { materie, ready, error, addMateria, updateMateria, refresh };
}
