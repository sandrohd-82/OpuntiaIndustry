"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { rilevaSchedeTrelloAction } from "@/app/actions/trello-utente";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";

export function TrelloSchedeSentinella() {
  const pathname = usePathname();

  useEffect(() => {
    let attivo = true;
    void rilevaSchedeTrelloAction().then((res) => {
      if (!attivo || !res.success || res.nuove < 1) return;
      notifyNotificheNav();
    });
    return () => {
      attivo = false;
    };
  }, [pathname]);

  return null;
}
