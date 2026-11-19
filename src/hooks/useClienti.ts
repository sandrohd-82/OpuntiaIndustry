"use client";

import { useCallback, useEffect, useState } from "react";
import { salvaMisuraElencoClienti } from "@/components/diagnostica/misura-elenco-clienti";
import { corpoContieneMarca, fasiAzioneAssociata } from "@/lib/diagnostica/prestazioni";
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

  const refresh = useCallback(async (marca?: string) => {
    const result = await listClientiAction(marca);
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
    const marca = misuraPagina ? marcaElencoClienti() : undefined;
    let corrispondenza: { inizio: number; fine: number } | null = null;
    let altreAzioni = 0;
    const originale = misuraPagina ? window.fetch.bind(window) : null;
    if (originale && marca) {
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const inizioFetch = performance.now();
        const nostra = richiestaElencoClienti(input, init, marca);
        if (intestazioneAzione(input, init) && !nostra && corrispondenza == null) {
          altreAzioni += 1;
        }
        const risposta = await originale(input, init);
        if (nostra) corrispondenza = { inizio: inizioFetch, fine: performance.now() };
        return risposta;
      };
    }
    const avvio = performance.now();
    void refresh(marca)
      .then((result) => {
        if (!misuraPagina || !result.success) return;
        const fine = performance.now();
        const fasi = fasiAzioneAssociata({
          avvio,
          fine,
          richiesta: corrispondenza,
          altreAzioni,
        });
        salvaMisuraElencoClienti({
          ...result.tempi,
          montaggioAAvvioMs: Math.max(0, Math.round(avvio - montato)),
          associata: fasi.associata,
          altreAzioni: fasi.altreAzioni,
          primaDelFetchMs: fasi.primaMs,
          fetchMs: fasi.fetchMs,
          dopoIlFetchMs: fasi.dopoMs,
          fetchOsservati: fasi.altreAzioni + (fasi.associata ? 1 : 0),
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

function marcaElencoClienti(): string {
  const byte = new Uint8Array(12);
  crypto.getRandomValues(byte);
  return `oi${Array.from(byte, (n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function intestazioneAzione(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    return headers.has("next-action");
  } catch {
    return false;
  }
}

function richiestaElencoClienti(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  marca: string
): boolean {
  if (!intestazioneAzione(input, init)) return false;
  return corpoContieneMarca(testoCorpoAzione(init?.body), marca);
}

function testoCorpoAzione(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const parti: string[] = [];
    for (const value of body.values()) {
      if (typeof value === "string") parti.push(value);
    }
    return parti.join("\n");
  }
  return "";
}
