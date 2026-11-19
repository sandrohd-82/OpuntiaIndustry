"use client";

import {
  CHIAVE_ELENCO_CLIENTI,
  type MisuraElencoClienti,
} from "@/lib/diagnostica/prestazioni";

export function salvaMisuraElencoClienti(misura: MisuraElencoClienti) {
  try {
    sessionStorage.setItem(CHIAVE_ELENCO_CLIENTI, JSON.stringify(misura));
  } catch {
    /* la misura resta disponibile solo per questa lettura */
  }
}

export function leggiMisuraElencoClienti(): MisuraElencoClienti | null {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_ELENCO_CLIENTI);
    if (!grezzo) return null;
    const valore = JSON.parse(grezzo) as MisuraElencoClienti;
    if (!valore || typeof valore.attesaAzioneMs !== "number") return null;
    return valore;
  } catch {
    return null;
  }
}

export function segnaRenderingElencoClienti(istante: number) {
  const misura = leggiMisuraElencoClienti();
  if (!misura || misura.renderingMs != null || typeof misura.ricevutoAt !== "number") return;
  salvaMisuraElencoClienti({
    ...misura,
    renderingMs: Math.max(0, Math.round(istante - misura.ricevutoAt)),
  });
}
