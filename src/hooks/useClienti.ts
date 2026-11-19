"use client";

import { useCallback, useEffect, useState } from "react";
import { salvaMisuraElencoClienti } from "@/components/diagnostica/misura-elenco-clienti";
import { fasiChiamataClient } from "@/lib/diagnostica/prestazioni";
import {
  createClienteAction,
  listClientiAction,
  prenotaCancellazioneClienteAction,
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
    return result;
  }, []);

  useEffect(() => {
    const misuraPagina = window.location.pathname.startsWith("/app/commerciale/clienti");
    const montato = performance.now();
    const visti: { inizio: number; fine: number }[] = [];
    const originale = misuraPagina ? window.fetch.bind(window) : null;
    if (originale) {
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const inizioFetch = performance.now();
        return originale(input, init).finally(() => {
          visti.push({ inizio: inizioFetch, fine: performance.now() });
        });
      };
    }
    const avvio = performance.now();
    void refresh()
      .then((result) => {
        if (!misuraPagina || !result.success) return;
        const fine = performance.now();
        const fasi = fasiChiamataClient({ clic: avvio, fine, fetch: visti });
        salvaMisuraElencoClienti({
          ...result.tempi,
          montaggioAAvvioMs: Math.max(0, Math.round(avvio - montato)),
          primaDelFetchMs: fasi.primaMs,
          fetchMs: fasi.reteMs,
          dopoIlFetchMs: fasi.dopoMs,
          fetchOsservati: fasi.fetchOsservati,
          attesaAzioneMs: Math.round(fine - avvio),
          ricevutoAt: fine,
          renderingMs: null,
        });
      })
      .catch(() => {
        setError("Elenco clienti non disponibile.");
      })
      .finally(() => {
        if (originale) window.fetch = originale;
        setReady(true);
      });
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

  async function removeCliente(
    id: string,
    confermaTestuale: string
  ): Promise<
    | { success: true; cancellazioneId: string }
    | { success: false; error: string }
  > {
    const result = await prenotaCancellazioneClienteAction({
      id,
      confermaTestuale,
    });
    if (!result.success) {
      setError(result.error);
      return { success: false, error: result.error };
    }
    setClienti((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              cancellazionePrenotata: true,
              cancellazioneId: result.cancellazioneId,
            }
          : item
      )
    );
    setError(null);
    return { success: true, cancellazioneId: result.cancellazioneId };
  }

  return {
    clienti,
    ready,
    error,
    addCliente,
    updateCliente,
    removeCliente,
    refresh,
  };
}
