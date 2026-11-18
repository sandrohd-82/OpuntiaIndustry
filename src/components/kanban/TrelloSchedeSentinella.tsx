"use client";

import { useEffect } from "react";
import { rilevaSchedeTrelloAction } from "@/app/actions/trello-utente";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";

const INTERVALLO_CONTROLLO_MS = 60_000;

export function TrelloSchedeSentinella() {
  useEffect(() => {
    let attivo = true;
    function controlla() {
      void rilevaSchedeTrelloAction().then((res) => {
        if (!attivo || !res.success || res.nuove < 1) return;
        notifyNotificheNav();
      });
    }
    controlla();
    const timer = window.setInterval(controlla, INTERVALLO_CONTROLLO_MS);
    return () => {
      attivo = false;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
