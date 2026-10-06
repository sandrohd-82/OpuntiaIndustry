"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  createReferenteRicezioneMerceAction,
  listCommercialiCampionaturaAction,
  type CommercialeCampionaturaOption,
} from "@/app/actions/campionature";
import { listRubricaContattiAction } from "@/app/actions/rubrica";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { CanaleInputRow } from "@/components/amministrazione/CanaleAttenzioneControls";
import { RubricaContattoFormModal } from "@/components/amministrazione/RubricaContattoFormModal";
import { formatIndirizzoSede } from "@/lib/amministrazione/campionature";
import { emptySede } from "@/lib/amministrazione/fornitori";
import {
  contattoHaIndirizzoCompleto,
  contattoIndirizzoTesto,
  displayContattoName,
  type RubricaAziendaTipo,
  type RubricaContatto,
} from "@/lib/rubrica/types";

type Destinazione = "azienda" | "privato" | "rubrica";
type ElencoRubrica = "commerciali" | "referenti";

type Props = {
  clienteId: string;
  clienteLabel: string;
  aziendaTipo?: Extract<RubricaAziendaTipo, "cliente" | "cliente_possibile">;
  onClose: () => void;
  onSaved: (result: {
    referenteId: string | null;
    destinatario: string;
    indirizzo: string;
    isPrivato: boolean;
    label: string;
  }) => void;
};

export function CampionaturaAltroPostoModal({
  clienteId,
  clienteLabel,
  aziendaTipo = "cliente",
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [destinazione, setDestinazione] = useState<Destinazione>("azienda");
  const [elenco, setElenco] = useState<ElencoRubrica>("commerciali");
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [sede, setSede] = useState(emptySede());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commerciali, setCommerciali] = useState<CommercialeCampionaturaOption[]>(
    []
  );
  const [referenti, setReferenti] = useState<RubricaContatto[]>([]);
  const [loadingElenco, setLoadingElenco] = useState(false);
  const [selezionatoId, setSelezionatoId] = useState("");
  const [schedaReferente, setSchedaReferente] = useState<RubricaContatto | null>(
    null
  );

  useEffect(() => {
    if (destinazione !== "rubrica") return;
    let attivo = true;
    setLoadingElenco(true);
    setError(null);
    void Promise.all([
      listCommercialiCampionaturaAction(),
      listRubricaContattiAction({
        preferAziendaTipo: aziendaTipo,
        preferAziendaId: clienteId,
        skipScope: true,
      }),
    ])
      .then(([comm, rub]) => {
        if (!attivo) return;
        if (!comm.success) {
          setError(comm.error);
          return;
        }
        if (!rub.success) {
          setError(rub.error);
          return;
        }
        setCommerciali(comm.items);
        setReferenti(rub.items.filter((c) => c.rapporto === "referente"));
      })
      .catch(() => {
        if (attivo) setError("Impossibile leggere commerciali e referenti.");
      })
      .finally(() => {
        if (attivo) setLoadingElenco(false);
      });
    return () => {
      attivo = false;
    };
  }, [destinazione, clienteId, aziendaTipo]);

  const commercialeScelto = commerciali.find((c) => c.id === selezionatoId);
  const referenteScelto = referenti.find((c) => c.id === selezionatoId);
  const referenteSenzaIndirizzo = Boolean(
    referenteScelto && !contattoHaIndirizzoCompleto(referenteScelto)
  );

  function scegliDestinazione(next: Destinazione) {
    setDestinazione(next);
    setSelezionatoId("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (destinazione === "rubrica") return;
    const indirizzo = formatIndirizzoSede(sede);
    if (!indirizzo.trim()) {
      setError("Inserisci l'indirizzo di spedizione.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createReferenteRicezioneMerceAction({
      clienteId,
      clienteLabel,
      isPrivato: destinazione === "privato",
      ragioneSociale,
      nome,
      cognome,
      telefono,
      email,
      indirizzo,
      via: sede.indirizzo,
      cap: sede.cap,
      citta: sede.citta,
      provincia: sede.provincia,
      nazione: sede.nazione,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved({
      referenteId: result.id,
      destinatario: result.destinatario,
      indirizzo,
      isPrivato: destinazione === "privato",
      label: result.label,
    });
  }

  function usaCommerciale() {
    if (!commercialeScelto?.residenzaCompleta) {
      setError(
        "Questo commerciale non ha l'indirizzo di residenza completo in organigramma."
      );
      return;
    }
    onSaved({
      referenteId: null,
      destinatario: commercialeScelto.nome,
      indirizzo: commercialeScelto.indirizzoCompleto,
      isPrivato: false,
      label: `Commerciale · ${commercialeScelto.nome}`,
    });
  }

  function usaReferente() {
    if (!referenteScelto || !contattoHaIndirizzoCompleto(referenteScelto)) {
      setError("Questo referente non ha ancora un indirizzo completo.");
      return;
    }
    const nomeCompleto = displayContattoName(referenteScelto);
    onSaved({
      referenteId: referenteScelto.id,
      destinatario: nomeCompleto,
      indirizzo: contattoIndirizzoTesto(referenteScelto),
      isPrivato: false,
      label: `Referente · ${nomeCompleto}`,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold">
          Spedisci in altro posto
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {destinazione === "rubrica"
            ? "Scegli un commerciale con il suo indirizzo, oppure un referente della rubrica."
            : "I dati vengono salvati come referente «Ricezione merce» sull’azienda selezionata."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => scegliDestinazione("azienda")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              destinazione === "azienda"
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-white"
            }`}
          >
            Azienda
          </button>
          <button
            type="button"
            onClick={() => scegliDestinazione("privato")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              destinazione === "privato"
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-white"
            }`}
          >
            Privato
          </button>
          <button
            type="button"
            onClick={() => scegliDestinazione("rubrica")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              destinazione === "rubrica"
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-white"
            }`}
          >
            Commerciale, referente
          </button>
        </div>

        {destinazione === "rubrica" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setElenco("commerciali");
                  setSelezionatoId("");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  elenco === "commerciali"
                    ? "border-[var(--primary)] bg-slate-50 font-medium"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                Commerciali
              </button>
              <button
                type="button"
                onClick={() => {
                  setElenco("referenti");
                  setSelezionatoId("");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  elenco === "referenti"
                    ? "border-[var(--primary)] bg-slate-50 font-medium"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                Referenti
              </button>
            </div>

            {loadingElenco ? (
              <p className="text-sm text-[var(--muted)]">Caricamento…</p>
            ) : elenco === "commerciali" ? (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {commerciali.map((c) => (
                  <li key={c.id}>
                    <label
                      className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${
                        selezionatoId === c.id
                          ? "border-[var(--primary)] bg-slate-50"
                          : "border-[var(--border)] bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="destinatario-rubrica"
                        checked={selezionatoId === c.id}
                        onChange={() => setSelezionatoId(c.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{c.nome}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {c.residenzaCompleta
                            ? c.indirizzoCompleto
                            : "Indirizzo di residenza non completo in organigramma"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {commerciali.length === 0 ? (
                  <li className="text-sm text-[var(--muted)]">
                    Nessun commerciale in forza.
                  </li>
                ) : null}
              </ul>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {referenti.map((c) => {
                  const testo = contattoIndirizzoTesto(c);
                  const completo = contattoHaIndirizzoCompleto(c);
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${
                          selezionatoId === c.id
                            ? "border-[var(--primary)] bg-slate-50"
                            : "border-[var(--border)] bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="destinatario-rubrica"
                          checked={selezionatoId === c.id}
                          onChange={() => setSelezionatoId(c.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium">
                            {displayContattoName(c)}
                            {c.consigliato ? " · questa azienda" : ""}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {completo
                              ? testo
                              : testo || "Nessun indirizzo in rubrica"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {referenti.length === 0 ? (
                  <li className="text-sm text-[var(--muted)]">
                    Nessun referente in rubrica.
                  </li>
                ) : null}
              </ul>
            )}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Annulla
              </button>
              {elenco === "referenti" && referenteSenzaIndirizzo ? (
                <button
                  type="button"
                  onClick={() => {
                    if (referenteScelto) setSchedaReferente(referenteScelto);
                  }}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
                >
                  Aggiungi indirizzo al referente
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    elenco === "commerciali"
                      ? !commercialeScelto?.residenzaCompleta
                      : !referenteScelto ||
                        !contattoHaIndirizzoCompleto(referenteScelto)
                  }
                  onClick={elenco === "commerciali" ? usaCommerciale : usaReferente}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
                >
                  Usa questo destinatario
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {destinazione === "azienda" ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Ragione sociale</span>
                <input
                  required
                  value={ragioneSociale}
                  onChange={(e) => setRagioneSociale(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  {destinazione === "privato"
                    ? "Nome"
                    : "Referente sul citofono — nome"}
                </span>
                <input
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Cognome</span>
                <input
                  required
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CanaleInputRow
                label="Cellulare (consigliato)"
                canale="telefono"
                inputMode="tel"
                value={telefono}
                onChange={setTelefono}
              />
              <CanaleInputRow
                label="Email (consigliata)"
                canale="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={setEmail}
              />
            </div>

            <AddressSedeFields
              title="Indirizzo di spedizione"
              value={sede}
              onChange={setSede}
              requiredFields
            />

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva destinatario"}
              </button>
            </div>
          </form>
        )}
      </div>

      {schedaReferente ? (
        <RubricaContattoFormModal
          key={schedaReferente.id}
          elevated
          contatto={schedaReferente}
          focusIndirizzo
          onClose={() => setSchedaReferente(null)}
          onCreated={(item) => {
            setReferenti((prev) =>
              prev.map((row) => (row.id === item.id ? item : row))
            );
            setSelezionatoId(item.id);
            setSchedaReferente(null);
            setError(null);
          }}
        />
      ) : null}
    </div>
  );
}
