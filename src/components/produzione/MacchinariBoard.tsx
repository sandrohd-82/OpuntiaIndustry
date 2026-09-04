"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { createMacchinarioAction } from "@/app/actions/produzione-macchinari";
import { IotStatusDot } from "@/components/produzione/IotStatusDot";
import { MachinePowerToggle } from "@/components/produzione/MachinePowerToggle";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import { slugPosto, type ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  applyMacchinaPatch,
  isInsieme,
  nestMacchinari,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  areaCodice: string;
};

export function MacchinariBoard({ areaCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [iot, setIot] = useState(false);
  const [parentId, setParentId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  function patchMacchina(item: ProduzioneMacchinario) {
    setArea((prev) =>
      prev
        ? { ...prev, macchinari: applyMacchinaPatch(prev.macchinari, item) }
        : prev
    );
    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
  }

  function load() {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setIsAdmin(res.isAdmin);
      setArea(res.items.find((a) => a.codice === areaCodice) ?? null);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodice]);

  function add() {
    if (!area || !nome.trim()) return;
    start(async () => {
      const res = await createMacchinarioAction({
        areaId: area.id,
        codice: codice.trim() || slugPosto(nome),
        nome: nome.trim(),
        descrizione: descrizione.trim(),
        iotCollegato: iot,
        sortOrder: (area.macchinari.at(-1)?.sortOrder ?? 0) + 10,
        parentId: parentId || null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNome("");
      setCodice("");
      setDescrizione("");
      setIot(false);
      setParentId("");
      window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
      load();
    });
  }

  if (!area && !error) {
    return <p className="text-sm text-[var(--muted)]">Caricamento macchinari…</p>;
  }
  if (!area) {
    return <p className="text-sm text-red-700">{error ?? "Area non trovata."}</p>;
  }

  const base = `/app/produzione/gestione-aree/${area.codice}/macchinari`;

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        Impianti di {area.nome}. On/Off è dichiarato dall’operatore; se la
        macchina è collegata IoT, lo stesso pulsante prepara il comando.
      </p>

      {isAdmin ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Aggiungi macchinario</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Compare nel menu e in Gestione Area. Puoi metterlo da solo o sotto
            un insieme (come le macchine della vasca).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--muted)]">
              Nome
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!codice) setCodice(slugPosto(e.target.value));
                }}
                className="mt-1 block w-52 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Codice
              <input
                value={codice}
                onChange={(e) => setCodice(slugPosto(e.target.value))}
                className="mt-1 block w-40 rounded-md border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Descrizione
              <input
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                className="mt-1 block w-64 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Posizione
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="mt-1 block w-56 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Macchinario solo (primo livello)</option>
                {nestMacchinari(area.macchinari).map((m) => (
                  <option key={m.id} value={m.id}>
                    Sotto {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={iot}
                onChange={(e) => setIot(e.target.checked)}
              />
              Collegato IoT
            </label>
            <button
              type="button"
              disabled={pending || !nome.trim()}
              onClick={add}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Aggiungi macchinario"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Solo l’amministratore può aggiungere macchinari.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {area.macchinari.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            Nessun macchinario. Aggiungine uno per il sottomenu.
          </li>
        ) : (
          nestMacchinari(area.macchinari).map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{m.nome}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{m.codice}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {isInsieme(m)
                      ? "Insieme: lo stato è quello delle macchine interne."
                      : m.descrizione || "Impianto di area."}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <MachinePowerToggle
                    macchina={m}
                    origine={isInsieme(m) ? "insieme" : "scheda"}
                    size="sm"
                    onError={setError}
                    onChanged={patchMacchina}
                  />
                  <IotStatusDot stato={m.statoIot} size="sm" />
                </div>
              </div>
              {m.statoIot === "arresto" && m.statoNote ? (
                <p className="mt-2 text-xs text-red-700">{m.statoNote}</p>
              ) : null}
              {(m.figli ?? []).length ? (
                <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                  {(m.figli ?? []).map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div>
                        <Link
                          href={`${base}/${f.codice}`}
                          className="text-sm font-medium text-[var(--primary)] hover:underline"
                        >
                          {f.nome}
                        </Link>
                        <div className="mt-0.5">
                          <IotStatusDot stato={f.statoIot} size="sm" />
                        </div>
                      </div>
                      <MachinePowerToggle
                        macchina={f}
                        origine="scheda"
                        size="sm"
                        onError={setError}
                        onChanged={patchMacchina}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link
                href={`${base}/${m.codice}`}
                className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
              >
                {isInsieme(m) ? "Apri insieme e ricambi" : "Apri macchina e ricambi"}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
