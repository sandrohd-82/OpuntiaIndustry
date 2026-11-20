"use client";

import { createContext, useContext, useMemo } from "react";
import {
  CHIAVE_SCHEDA_COMPLETA,
  CHIAVE_SONDA_PRESTAZIONI,
} from "@/lib/diagnostica/prestazioni";
import {
  applicaCaricamentoCompleto,
  apriMisuraScheda,
  avviaAzione,
  chiudiMisuraScheda,
  concludiAzione,
  normalizzaMisureScheda,
  prevediAzione,
  segnaDatiBase,
  segnaModuloAtteso,
  segnaMontaggioScheda,
  type EsitoAzioneScheda,
  type MisuraSchedaCompleta,
  type NomeAzioneScheda,
} from "@/lib/diagnostica/scheda-completa";

const LIMITE = 8;

type Attesa = {
  generazione: number;
  clienteId: string;
  clic: number;
};

const clicPerGenerazione = new Map<number, number>();
const conteggi = new Map<string, number>();
const chiusure = new Map<number, number>();
let attesa: Attesa | null = null;
let prossimaGenerazione = 1;
let contatoreAllineato = false;

export type ContestoScheda = { generazione: number };

export const ContestoMisuraScheda = createContext<ContestoScheda | null>(null);

export function useMisuraScheda(): ContestoScheda | null {
  return useContext(ContestoMisuraScheda);
}

function valoreMisuraScheda(generazione: number | null): ContestoScheda | null {
  if (generazione == null) return null;
  return { generazione };
}

function sondaAttiva(): boolean {
  try {
    return sessionStorage.getItem(CHIAVE_SONDA_PRESTAZIONI) === "1";
  } catch {
    return false;
  }
}

export function leggiMisureSchedaCompleta(): MisuraSchedaCompleta[] {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_SCHEDA_COMPLETA);
    if (!grezzo) return [];
    return normalizzaMisureScheda(JSON.parse(grezzo));
  } catch {
    return [];
  }
}

function salva(misure: MisuraSchedaCompleta[]) {
  try {
    sessionStorage.setItem(
      CHIAVE_SCHEDA_COMPLETA,
      JSON.stringify(misure.slice(-LIMITE))
    );
  } catch {
    /* la misura resta solo in memoria */
  }
}

function ultimaMisura(
  misure: MisuraSchedaCompleta[],
  generazione: number
): number {
  for (let indice = misure.length - 1; indice >= 0; indice -= 1) {
    if (misure[indice]?.generazione === generazione) return indice;
  }
  return -1;
}

function allineaContatore() {
  if (contatoreAllineato) return;
  contatoreAllineato = true;
  let massimo = 0;
  for (const misura of leggiMisureSchedaCompleta()) {
    if (misura.generazione > massimo) massimo = misura.generazione;
  }
  if (massimo >= prossimaGenerazione) prossimaGenerazione = massimo + 1;
}

function aggiorna(
  generazione: number,
  muta: (misura: MisuraSchedaCompleta) => MisuraSchedaCompleta
) {
  const misure = leggiMisureSchedaCompleta();
  const indice = ultimaMisura(misure, generazione);
  if (indice < 0) return;
  const clic = clicPerGenerazione.get(generazione);
  let prossima = muta(misure[indice]);
  if (clic != null) {
    prossima = applicaCaricamentoCompleto(prossima, performance.now() - clic);
  }
  misure[indice] = prossima;
  salva(misure);
}

export function iniziaAperturaScheda(clienteId: string) {
  if (!sondaAttiva() || !clienteId) return;
  allineaContatore();
  const conteggio = (conteggi.get(clienteId) ?? 0) + 1;
  conteggi.set(clienteId, conteggio);
  const generazione = prossimaGenerazione;
  prossimaGenerazione += 1;
  const clic = performance.now();
  clicPerGenerazione.set(generazione, clic);
  attesa = { generazione, clienteId, clic };
  salva([...leggiMisureSchedaCompleta(), apriMisuraScheda(generazione, conteggio)]);
}

export function segnaAttesaModuloScheda() {
  if (!attesa) return;
  aggiorna(attesa.generazione, segnaModuloAtteso);
}

export function generazioneSchedaDaMontare(clienteId: string): number | null {
  if (!attesa || attesa.clienteId !== clienteId) return null;
  return attesa.generazione;
}

export function segnaMontaggioSchedaCompleta(generazione: number) {
  const clic = clicPerGenerazione.get(generazione);
  if (clic == null) return;
  if (attesa?.generazione === generazione) attesa = null;
  const timer = chiusure.get(generazione);
  if (timer != null) {
    window.clearTimeout(timer);
    chiusure.delete(generazione);
  }
  aggiorna(generazione, (misura) =>
    segnaMontaggioScheda(misura, performance.now() - clic)
  );
}

export function segnaChiusuraSchedaCompleta(generazione: number) {
  if (chiusure.has(generazione)) return;
  const timer = window.setTimeout(() => {
    chiusure.delete(generazione);
    aggiorna(generazione, chiudiMisuraScheda);
  }, 0);
  chiusure.set(generazione, timer);
}

export function segnaDatiBaseScheda(generazione: number) {
  const clic = clicPerGenerazione.get(generazione);
  if (clic == null) return;
  aggiorna(generazione, (misura) => segnaDatiBase(misura, performance.now() - clic));
}

export function prevediAzioneScheda(generazione: number, nome: NomeAzioneScheda) {
  aggiorna(generazione, (misura) => prevediAzione(misura, nome));
}

export function osservaAzioneScheda<T>(
  generazione: number | null,
  nome: NomeAzioneScheda,
  esegui: () => Promise<T>,
  esito: (valore: T) => EsitoAzioneScheda
): Promise<T> {
  if (generazione == null) return esegui();
  const clic = clicPerGenerazione.get(generazione);
  const presenti = leggiMisureSchedaCompleta();
  const ultima = ultimaMisura(presenti, generazione);
  const giaAvviata = ultima >= 0 && presenti[ultima]?.azioni[nome] != null;
  if (clic == null || giaAvviata) return esegui();
  aggiorna(generazione, (misura) =>
    avviaAzione(misura, nome, performance.now() - clic)
  );
  const inizio = performance.now();
  return esegui().then(
    (valore) => {
      aggiorna(generazione, (misura) =>
        concludiAzione(misura, nome, performance.now() - inizio, esito(valore))
      );
      return valore;
    },
    (errore: unknown) => {
      aggiorna(generazione, (misura) =>
        concludiAzione(misura, nome, performance.now() - inizio, "errore")
      );
      throw errore;
    }
  );
}

export function useValoreMisuraScheda(generazione: number | null): ContestoScheda | null {
  return useMemo(() => valoreMisuraScheda(generazione), [generazione]);
}
