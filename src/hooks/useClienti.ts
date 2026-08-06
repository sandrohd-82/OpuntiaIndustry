"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createClienteAction,
  listClientiAction,
  updateClienteAction,
} from "@/app/actions/clienti";
import type { Cliente, ClienteInput } from "@/lib/amministrazione/clienti";

export function useClienti() {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listClientiAction();
    if (result.success) {
      setClienti(result.clienti);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  async function addCliente(input: ClienteInput) {
    const result = await createClienteAction(input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setClienti((prev) => [result.cliente, ...prev]);
    setError(null);
    return result.cliente;
  }

  async function updateCliente(id: string, input: ClienteInput) {
    const result = await updateClienteAction(id, input);
    if (!result.success) {
      setError(result.error);
      return null;
    }
    setClienti((prev) =>
      prev.map((item) => (item.id === id ? result.cliente : item))
    );
    setError(null);
    return result.cliente;
  }

  return { clienti, ready, error, addCliente, updateCliente, refresh };
}
