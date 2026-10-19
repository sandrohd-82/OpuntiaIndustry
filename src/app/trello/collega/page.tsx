"use client";

import { useEffect, useState } from "react";
import { completaCollegamentoTrelloAction } from "@/app/actions/trello-utente";

export default function TrelloCollegaPage() {
  const [messaggio, setMessaggio] = useState("Collegamento in corso…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.trim() ?? "";
    const state = params.get("state")?.trim() ?? "";
    const errore = params.get("error")?.trim() ?? "";
    window.history.replaceState(null, "", window.location.pathname);

    void (async () => {
      let testo = "Autorizzazione non completata. Puoi chiudere questa finestra.";
      if (!errore && code && state) {
        const res = await completaCollegamentoTrelloAction(code, state);
        testo = res.success
          ? "Account Trello collegato. Puoi chiudere questa finestra."
          : res.error;
      }
      setMessaggio(testo);
      if (window.opener) {
        window.opener.postMessage(
          { tipo: "trello-collegato", errore: testo.startsWith("Account") ? "" : testo },
          window.location.origin
        );
      }
      window.setTimeout(() => window.close(), 800);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-md p-8 text-sm text-slate-700">{messaggio}</main>
  );
}
