"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMappeCollegateAction } from "@/app/actions/magazzino-mappa";
import { type MappaNavItem } from "@/lib/magazzino/mappa";

export function MagazzinoMappaElencoBoard() {
  const [items, setItems] = useState<MappaNavItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void listMappeCollegateAction()
      .then((res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }
        setItems(res.items);
        setError(null);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento piante…</p>;
  }
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
        Nessuna pianta collegata. Il Super Admin le disegna in Strumenti → Editor di
        aree, «Collega ad area» e poi «Crea percorso» per pubblicarle nel menu.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <li key={it.slug}>
          <Link
            href={`/app/pianta/${it.slug}`}
            className="block rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 hover:border-teal-500"
          >
            <p className="font-medium">{it.luogoNome}</p>
            <p className="text-xs text-[var(--muted)]">
              {it.viste === 1 ? "1 vista" : `${it.viste} viste`} · apri l&apos;area
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
