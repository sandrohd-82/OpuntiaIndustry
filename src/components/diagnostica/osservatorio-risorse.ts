"use client";

import {
  nomeSenzaSegreti,
  type RisorsaOsservata,
} from "@/lib/diagnostica/prestazioni";

const LIMITE = 500;
const registro: RisorsaOsservata[] = [];
const viste = new Set<string>();
let preparato = false;
let bufferPieno = false;

function timing(nome: string, voce: PerformanceResourceTiming): number | null {
  for (const parte of voce.serverTiming ?? []) {
    if (parte.name === nome) return Math.round(parte.duration);
  }
  return null;
}

function ricorda(voce: PerformanceResourceTiming) {
  const chiave = `${Math.round(voce.startTime)}|${voce.name.slice(0, 120)}`;
  if (viste.has(chiave)) return;
  viste.add(chiave);
  registro.push({
    nome: nomeSenzaSegreti(voce.name),
    start: voce.startTime,
    requestStart: voce.requestStart,
    responseStart: voce.responseStart,
    responseEnd: voce.responseEnd,
    duration: voce.duration,
    middlewareMs: timing("middleware", voce),
  });
  if (registro.length > LIMITE) registro.shift();
}

export function preparaRegistroRisorse() {
  if (preparato || typeof performance === "undefined") return;
  preparato = true;
  try {
    performance.setResourceTimingBufferSize(2000);
  } catch {
    /* il browser non consente di allargare il registro */
  }
  try {
    for (const voce of performance.getEntriesByType("resource")) {
      ricorda(voce as PerformanceResourceTiming);
    }
    const osservatore = new PerformanceObserver((lista) => {
      for (const voce of lista.getEntries()) ricorda(voce as PerformanceResourceTiming);
    });
    osservatore.observe({ type: "resource", buffered: true });
    performance.addEventListener("resourcetimingbufferfull", () => {
      bufferPieno = true;
      try {
        const presenti = performance.getEntriesByType("resource").length;
        performance.setResourceTimingBufferSize(presenti + 500);
      } catch {
        /* il registro resta al tetto del browser */
      }
    });
  } catch {
    /* il browser non espone le risorse */
  }
}

export function risorseRaccolte(): RisorsaOsservata[] {
  preparaRegistroRisorse();
  for (const voce of performance.getEntriesByType("resource")) {
    ricorda(voce as PerformanceResourceTiming);
  }
  return registro.slice();
}

export function registroRisorsePieno(): boolean {
  return bufferPieno;
}

export function azzeraSegnaleRegistroPieno() {
  bufferPieno = false;
}
