"use client";

import { useEffect } from "react";
import { leggiSchedeTrello } from "@/lib/navigazione/nav-letture-client";
import { controlloTrelloConsentito } from "@/lib/diagnostica/prestazioni";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";

const INTERVALLO_CONTROLLO_MS = 60_000;

export function TrelloSchedeSentinella() {
  useEffect(() => {
    let attivo = true;
    let richiestaInCorso = false;
    async function controlla() {
      const finestraNascosta = typeof document !== "undefined" && document.hidden;
      if (!controlloTrelloConsentito({ finestraNascosta, richiestaInCorso })) return;
      richiestaInCorso = true;
      try {
        const res = await leggiSchedeTrello();
        if (!attivo || !res.success || res.nuove < 1) return;
        notifyNotificheNav();
      } finally {
        richiestaInCorso = false;
      }
    }
    void controlla();
    const timer = window.setInterval(() => {
      void controlla();
    }, INTERVALLO_CONTROLLO_MS);
    function alRitorno() {
      if (!document.hidden) void controlla();
    }
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      attivo = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, []);

  return null;
}
