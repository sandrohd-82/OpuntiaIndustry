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
