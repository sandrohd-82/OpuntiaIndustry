"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listPortaleNewsletterAction,
  listPortaleRichiesteAction,
  setPortaleRichiestaStatoAction,
} from "@/app/actions/wikiopuntia";
import type {
  PortaleNewsletterIscrittoRow,
  PortaleRichiestaContattoRow,
  PortaleRichiestaStato,
} from "@/types/database";

export function PortaleRichiesteBoard({
  origine,
}: {
  origine?: "opuntiaitalia" | "wikiopuntia";
}) {
  const [items, setItems] = useState<PortaleRichiestaContattoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await listPortaleRichiesteAction(
        origine ? { origine } : undefined
      );
      if (!res.success) {
        setError(res.error);
        return;
      }
      setItems(res.items);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origine]);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Contatto</th>
              <th className="px-3 py-2">Azienda / prodotto</th>
              <th className="px-3 py-2">Messaggio</th>
              <th className="px-3 py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  {new Date(item.created_at).toLocaleString("it-IT")}
                </td>
                <td className="px-3 py-2">
                  {item.nome} {item.cognome}
                  <div className="text-xs text-[var(--muted)]">{item.email}</div>
                  <div className="text-xs text-[var(--muted)]">{item.telefono}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {item.azienda || "—"}
                  <div>{item.prodotto_slug}</div>
                </td>
                <td className="max-w-sm px-3 py-2 text-xs">{item.messaggio}</td>
                <td className="px-3 py-2">
                  <select
                    className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                    value={item.stato}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(async () => {
                        const res = await setPortaleRichiestaStatoAction({
                          id: item.id,
                          stato: e.target.value as PortaleRichiestaStato,
                        });
                        if (!res.success) setError(res.error);
                        else reload();
                      })
                    }
                  >
                    <option value="nuova">Nuova</option>
                    <option value="presa_in_carico">Presa in carico</option>
                    <option value="chiusa">Chiusa</option>
                  </select>
                </td>
              </tr>
            ))}
            {!items.length && !pending ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={5}>
                  {origine === "wikiopuntia"
                    ? "Nessuna richiesta da WikiOpuntia."
                    : origine === "opuntiaitalia"
                      ? "Nessuna richiesta da Opuntia Italia."
                      : "Nessuna richiesta dal portale."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PortaleNewsletterBoard() {
  const [items, setItems] = useState<PortaleNewsletterIscrittoRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listPortaleNewsletterAction().then((res) => {
      if (!res.success) setError(res.error);
      else setItems(res.items);
    });
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">News</th>
              <th className="px-3 py-2">Pillole</th>
              <th className="px-3 py-2">Confermato</th>
              <th className="px-3 py-2">Locale</th>
              <th className="px-3 py-2">Iscrizione</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{item.email}</td>
                <td className="px-3 py-2">{item.vuole_news ? "Sì" : "No"}</td>
                <td className="px-3 py-2">{item.vuole_pillole ? "Sì" : "No"}</td>
                <td className="px-3 py-2">{item.confermato ? "Sì" : "No"}</td>
                <td className="px-3 py-2">{item.locale}</td>
                <td className="px-3 py-2 text-xs">
                  {new Date(item.created_at).toLocaleString("it-IT")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
