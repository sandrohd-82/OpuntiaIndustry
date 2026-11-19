"use client";

import { useCallback, useEffect, useState } from "react";
import { salvaMisuraElencoClienti } from "@/components/diagnostica/misura-elenco-clienti";
import {
  CHIAVE_CLIC_AREA,
  CHIAVE_SONDA_PRESTAZIONI,
  classeRichiestaOsservata,
  clicAMontaggio,
  corpoContieneMarca,
  fasiAzioneAssociata,
  riassuntoRichiesteAperte,
} from "@/lib/diagnostica/prestazioni";
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
    const misuraPagina =
      window.location.pathname.startsWith("/app/commerciale/clienti") &&
      sondaPrestazioniAttiva();
    const montato = performance.now();
    const marca = misuraPagina ? marcaElencoClienti() : undefined;
    let corrispondenza: { inizio: number; fine: number } | null = null;
    let nostroInizio: number | null = null;
    let altreAzioni = 0;
    let fetchOrdinari = 0;
    let fetchRsc = 0;
    const originale = misuraPagina ? window.fetch.bind(window) : null;
    const avvio = performance.now();
    const giaAperte = misuraPagina ? richiesteGiaAperte(avvio) : null;
    const clicAMontaggioMs = misuraPagina ? clicAMontaggio(leggiClicArea(), montato) : null;
    if (originale && marca) {
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const inizioFetch = performance.now();
        const classe = classeOsservata(input, init, marca);
        if (classe === "elenco") {
          nostroInizio = inizioFetch;
        } else if (inizioFetch >= avvio && (nostroInizio == null || inizioFetch < nostroInizio)) {
          if (classe === "azione" && corpoAzioneLeggibile(init?.body)) altreAzioni += 1;
          else if (classe === "rsc") fetchRsc += 1;
          else if (classe === "ordinario") fetchOrdinari += 1;
        }
        const risposta = await originale(input, init);
        if (classe === "elenco") corrispondenza = { inizio: inizioFetch, fine: performance.now() };
        return risposta;
      };
    }
    void refresh(marca)
      .then((result) => {
        if (!misuraPagina || !result.success || giaAperte == null) return;
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
          clicAMontaggioMs,
          associata: fasi.associata,
          altreAzioni: fasi.altreAzioni,
          primaDelFetchMs: fasi.primaMs,
          fetchMs: fasi.fetchMs,
          dopoIlFetchMs: fasi.dopoMs,
          fetchOsservati: altreAzioni + fetchOrdinari + fetchRsc + (fasi.associata ? 1 : 0),
          fetchOrdinari,
          fetchRsc,
          inCorso: giaAperte.inCorso,
          inCorsoRsc: giaAperte.inCorsoRsc,
          inCorsoNonClassificati: giaAperte.inCorsoNonClassificati,
          etaMassimaInCorsoMs: giaAperte.etaMassimaMs,
          inCorsoAffidabile: giaAperte.affidabile,
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

function sondaPrestazioniAttiva(): boolean {
  try {
    return sessionStorage.getItem(CHIAVE_SONDA_PRESTAZIONI) === "1";
  } catch {
    return false;
  }
}

function leggiClicArea(): { area: string; t: number } | null {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_CLIC_AREA);
    if (!grezzo) return null;
    const valore = JSON.parse(grezzo) as { area?: unknown; t?: unknown };
    if (typeof valore.area !== "string" || typeof valore.t !== "number") return null;
    return { area: valore.area, t: valore.t };
  } catch {
    return null;
  }
}

function intestazioniRichiesta(input: RequestInfo | URL, init?: RequestInit): Headers {
  const base = input instanceof Request ? input.headers : undefined;
  const out = new Headers(base);
  if (init?.headers) {
    new Headers(init.headers).forEach((valore, chiave) => out.set(chiave, valore));
  }
  return out;
}

function urlRichiesta(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function classeOsservata(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  marca: string
): "elenco" | "azione" | "rsc" | "ordinario" {
  try {
    const headers = intestazioniRichiesta(input, init);
    const azione = headers.has("next-action");
    return classeRichiestaOsservata({
      azione,
      rsc: headers.has("rsc") || urlRichiesta(input).includes("_rsc"),
      contieneMarca: azione && corpoContieneMarca(testoCorpoAzione(init?.body), marca),
    });
  } catch {
    return "ordinario";
  }
}

function richiesteGiaAperte(ora: number) {
  try {
    const voci: { start: number; responseEnd: number; rsc: boolean }[] = [];
    for (const voce of performance.getEntriesByType("resource")) {
      const risorsa = voce as PerformanceResourceTiming;
      voci.push({
        start: risorsa.startTime,
        responseEnd: risorsa.responseEnd,
        rsc: risorsa.name.includes("_rsc"),
      });
    }
    return { ...riassuntoRichiesteAperte(voci, ora), affidabile: true };
  } catch {
    return {
      inCorso: 0,
      inCorsoRsc: 0,
      inCorsoNonClassificati: 0,
      etaMassimaMs: null as number | null,
      affidabile: false,
    };
  }
}

function corpoAzioneLeggibile(body: BodyInit | null | undefined): boolean {
  if (typeof body === "string") return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  return false;
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
