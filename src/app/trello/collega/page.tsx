"use client";

import { useEffect, useState } from "react";

export default function TrelloCollegaPage() {
  const [messaggio, setMessaggio] = useState("Collegamento in corso…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("token")?.trim() ?? "";
    const errore = hash.get("error")?.trim() ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (window.opener) {
      window.opener.postMessage(
        { tipo: "trello-token", token, errore },
        window.location.origin
      );
    }
    if (errore || !token) {
      setMessaggio("Autorizzazione non completata. Puoi chiudere questa finestra.");
    } else {
      setMessaggio("Autorizzazione ricevuta. Puoi chiudere questa finestra.");
    }
    const timer = window.setTimeout(() => window.close(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="mx-auto max-w-md p-8 text-sm text-slate-700">{messaggio}</main>
  );
}
