"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { listEntityReferentiAction } from "@/app/actions/rubrica";

export type SpedizioneAnagraficaMail = {
  tipo: "cliente" | "cliente_possibile";
  id: string;
};

type Opzione = { email: string; label: string };

type Props = {
  value: string;
  onChange: (email: string) => void;
  anagrafica?: SpedizioneAnagraficaMail | null;
  emailAzienda?: string;
  emailPec?: string;
  emailGeneriche?: string[];
};

export function anagraficaMailDi(input: {
  fonte: string;
  possibileId: string;
  clienteId: string;
}): SpedizioneAnagraficaMail | null {
  if (input.fonte === "possibile" && input.possibileId) {
    return { tipo: "cliente_possibile", id: input.possibileId };
  }
  if (input.clienteId) return { tipo: "cliente", id: input.clienteId };
  return null;
}

export function SpedizioneDestinatarioMailField({
  value,
  onChange,
  anagrafica = null,
  emailAzienda = "",
  emailPec = "",
  emailGeneriche = [],
}: Props) {
  const listId = useId();
  const [referenti, setReferenti] = useState<Opzione[]>([]);
  const seeded = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!anagrafica?.id) {
      setReferenti([]);
      return;
    }
    let cancel = false;
    void listEntityReferentiAction({
      tipo: anagrafica.tipo,
      entityId: anagrafica.id,
    }).then((res) => {
      if (cancel || !res.success) return;
      setReferenti(
        res.items
          .filter((c) => c.email.includes("@"))
          .map((c) => ({
            email: c.email.trim().toLowerCase(),
            label:
              [c.nome, c.cognome].filter(Boolean).join(" ").trim() ||
              "Referente",
          }))
      );
    });
    return () => {
      cancel = true;
    };
  }, [anagrafica?.id, anagrafica?.tipo]);

  const opzioni = useMemo(() => {
    const out: Opzione[] = [];
    const seen = new Set<string>();
    function add(raw: string | null | undefined, label: string) {
      const email = String(raw ?? "").trim().toLowerCase();
      if (!email.includes("@") || seen.has(email)) return;
      seen.add(email);
      out.push({ email, label });
    }
    add(emailAzienda, "Email azienda");
    for (const extra of emailGeneriche) add(extra, "Email azienda");
    add(emailPec, "PEC");
    for (const referente of referenti) add(referente.email, referente.label);
    return out;
  }, [emailAzienda, emailGeneriche, emailPec, referenti]);

  useEffect(() => {
    if (seeded.current) return;
    if (value.trim()) {
      seeded.current = true;
      return;
    }
    const prima =
      opzioni.find((o) => o.label === "Email azienda") ?? opzioni[0];
    if (!prima) return;
    seeded.current = true;
    onChangeRef.current(prima.email);
  }, [opzioni, value]);

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">Destinatario</span>
      <span className="mb-1 block text-xs text-[var(--muted)]">
        Di default l’email dell’azienda. Puoi scegliere un’altra email
        dell’azienda o di un referente, oppure scriverne una.
      </span>
      <input
        type="email"
        list={listId}
        value={value}
        onChange={(e) => {
          seeded.current = true;
          onChange(e.target.value);
        }}
        placeholder="email@azienda.it"
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
      />
      <datalist id={listId}>
        {opzioni.map((o) => (
          <option key={`${o.label}:${o.email}`} value={o.email}>
            {o.label}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function partiDestinatari(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(/[,;]/)) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function emailValida(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

/** Più destinatari: mail azienda già scelta, altre mail dell'anagrafica, oppure un indirizzo scritto a mano. */
export function SpedizioneDestinatariMailField({
  value,
  onChange,
  anagrafica = null,
  emailAzienda = "",
  emailPec = "",
  emailGeneriche = [],
}: Props) {
  const [referenti, setReferenti] = useState<Opzione[]>([]);
  const [scelta, setScelta] = useState("");
  const [bozza, setBozza] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!anagrafica?.id) {
      setReferenti([]);
      return;
    }
    let cancel = false;
    void listEntityReferentiAction({
      tipo: anagrafica.tipo,
      entityId: anagrafica.id,
    }).then((res) => {
      if (cancel || !res.success) return;
      setReferenti(
        res.items
          .filter((c) => c.email.includes("@"))
          .map((c) => ({
            email: c.email.trim().toLowerCase(),
            label:
              [c.nome, c.cognome].filter(Boolean).join(" ").trim() ||
              "Referente",
          }))
      );
    });
    return () => {
      cancel = true;
    };
  }, [anagrafica?.id, anagrafica?.tipo]);

  const opzioni = useMemo(() => {
    const out: Opzione[] = [];
    const seen = new Set<string>();
    function add(raw: string | null | undefined, label: string) {
      const email = String(raw ?? "").trim().toLowerCase();
      if (!emailValida(email) || seen.has(email)) return;
      seen.add(email);
      out.push({ email, label });
    }
    add(emailAzienda, "Email azienda");
    for (const extra of emailGeneriche) add(extra, "Email azienda");
    add(emailPec, "PEC");
    for (const referente of referenti) add(referente.email, referente.label);
    return out;
  }, [emailAzienda, emailGeneriche, emailPec, referenti]);

  const selezionati = partiDestinatari(value);
  const disponibili = opzioni.filter((o) => !selezionati.includes(o.email));

  function scrivi(next: string[]) {
    onChange(next.join(", "));
  }

  function aggiungi(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!emailValida(email)) {
      setErrore("Scrivi un indirizzo mail valido.");
      return;
    }
    setErrore(null);
    if (!selezionati.includes(email)) scrivi([...selezionati, email]);
    setScelta("");
    setBozza("");
  }

  return (
    <div className="block text-sm">
      <span className="mb-1 block font-medium">Mail di destinazione</span>
      <span className="mb-2 block text-xs text-[var(--muted)]">
        La mail dell&apos;azienda è già inserita. Puoi aggiungere altre mail
        dell&apos;azienda o dei referenti, inviare la stessa mail a più
        indirizzi, oppure scriverne uno a mano.
      </span>
      {selezionati.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {selezionati.map((email) => (
            <li
              key={email}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-slate-50 px-2.5 py-1 text-xs"
            >
              <span>{email}</span>
              <button
                type="button"
                onClick={() =>
                  scrivi(selezionati.filter((item) => item !== email))
                }
                className="text-[var(--primary)] hover:underline"
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-amber-800">
          Nessun destinatario. Scegline uno oppure scrivilo.
        </p>
      )}
      {disponibili.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select
            value={scelta}
            onChange={(e) => setScelta(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Mail dell&apos;azienda o di un referente</option>
            {disponibili.map((o) => (
              <option key={`${o.label}:${o.email}`} value={o.email}>
                {o.label} — {o.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!scelta}
            onClick={() => aggiungi(scelta)}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={bozza}
          onChange={(e) => {
            setBozza(e.target.value);
            setErrore(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            aggiungi(bozza);
          }}
          placeholder="indirizzo@azienda.it"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => aggiungi(bozza)}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Aggiungi
        </button>
      </div>
      {errore ? <p className="mt-1 text-xs text-red-700">{errore}</p> : null}
    </div>
  );
}
