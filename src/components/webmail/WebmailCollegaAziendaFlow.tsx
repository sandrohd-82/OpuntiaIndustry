"use client";

import { useEffect, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  confirmWebmailAnagraficaLinkAction,
  createAndLinkWebmailAnagraficaAction,
  extractWebmailAnagraficaFromEmailAction,
  lookupWebmailAnagraficaByEmailAction,
  type WebmailAnagraficaHit,
} from "@/app/actions/webmail";
import { validateClienteFiscali } from "@/lib/amministrazione/clienti";
import type { WebmailAnagraficaExtract } from "@/lib/webmail/ai";
import type { WebmailMessaggio } from "@/lib/webmail/types";

type Step = "lookup" | "confirm" | "link-all" | "create";

type CreateField = "ragioneSociale" | "partitaIva" | "codiceFiscale";

function createFieldErrors(
  form: Pick<
    WebmailAnagraficaExtract,
    "ragioneSociale" | "partitaIva" | "codiceFiscale" | "isPrivato"
  >
): Partial<Record<CreateField, string>> {
  const errors: Partial<Record<CreateField, string>> = {};
  if (!form.ragioneSociale.trim()) {
    errors.ragioneSociale = "Obbligatoria.";
  }
  if (!form.isPrivato) {
    if (!form.partitaIva.trim()) {
      errors.partitaIva = "Obbligatoria per un’azienda.";
    }
    if (!form.codiceFiscale.trim()) {
      errors.codiceFiscale = "Obbligatorio per un’azienda.";
    }
  }
  return errors;
}

function fieldClass(invalid: boolean): string {
  return `w-full rounded-lg border px-3 py-2 text-sm ${
    invalid
      ? "border-red-400 bg-red-50 outline-none ring-1 ring-red-300"
      : "border-[var(--border)]"
  }`;
}

type Props = {
  open: boolean;
  messaggio: WebmailMessaggio;
  onClose: () => void;
  onDone: (m: WebmailMessaggio, info: string) => void;
};

const emptyForm = (email: string): WebmailAnagraficaExtract => ({
  ragioneSociale: "",
  partitaIva: "",
  codiceFiscale: "",
  isPrivato: false,
  email,
  pec: "",
  sdiCode: "",
  telefono: "",
  sitoWeb: "",
  nazione: "Italia",
  provincia: "",
  citta: "",
  cap: "",
  indirizzo: "",
  referenteNome: "",
  referenteCognome: "",
  referenteEmail: email,
  referenteTelefono: "",
  referenteMansione: "",
  hasReferente: false,
});

export function WebmailCollegaAziendaFlow({
  open,
  messaggio,
  onClose,
  onDone,
}: Props) {
  const [step, setStep] = useState<Step>("lookup");
  const [hits, setHits] = useState<WebmailAnagraficaHit[]>([]);
  const [selected, setSelected] = useState<WebmailAnagraficaHit | null>(null);
  const [kind, setKind] = useState<"cliente" | "cliente_possibile">(
    "cliente_possibile"
  );
  const [form, setForm] = useState<WebmailAnagraficaExtract>(() =>
    emptyForm(messaggio.fromAddress)
  );
  const [includeReferente, setIncludeReferente] = useState(false);
  const [linkSource, setLinkSource] = useState<"existing" | "create">(
    "existing"
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<CreateField, string>>
  >({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep("lookup");
    setHits([]);
    setSelected(null);
    setKind("cliente_possibile");
    setForm(emptyForm(messaggio.fromAddress));
    setIncludeReferente(false);
    setLinkSource("existing");
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await lookupWebmailAnagraficaByEmailAction(
        messaggio.fromAddress
      );
      if (!res.success) {
        setError(res.error);
        setStep("create");
        return;
      }
      if (res.hits.length > 0) {
        setHits(res.hits);
        setSelected(res.hits[0] ?? null);
        setStep("confirm");
        return;
      }
      const extracted = await extractWebmailAnagraficaFromEmailAction(
        messaggio.id
      );
      if (extracted.success) {
        setForm(extracted.extract);
        setIncludeReferente(extracted.extract.hasReferente);
      }
      setStep("create");
    });
  }, [open, messaggio.id, messaggio.fromAddress]);

  if (!open) return null;

  function patch<K extends keyof WebmailAnagraficaExtract>(
    key: K,
    value: WebmailAnagraficaExtract[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (
      key === "ragioneSociale" ||
      key === "partitaIva" ||
      key === "codiceFiscale" ||
      key === "isPrivato"
    ) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (key === "isPrivato") {
          delete next.partitaIva;
          delete next.codiceFiscale;
        } else if (key === "ragioneSociale") {
          delete next.ragioneSociale;
        } else if (key === "partitaIva") {
          delete next.partitaIva;
        } else if (key === "codiceFiscale") {
          delete next.codiceFiscale;
        }
        return next;
      });
      setError(null);
    }
  }

  function validateCreateForm(): boolean {
    const fiscalErr = validateClienteFiscali({
      ragioneSociale: form.ragioneSociale,
      partitaIva: form.partitaIva,
      codiceFiscale: form.codiceFiscale,
      isPrivato: form.isPrivato,
    });
    const next = createFieldErrors(form);
    setFieldErrors(next);
    if (fiscalErr) {
      setError(fiscalErr);
      return false;
    }
    setError(null);
    return true;
  }

  function goToLinkAllFromCreate() {
    if (!validateCreateForm()) return;
    setLinkSource("create");
    setStep("link-all");
  }

  function backFromLinkAll() {
    setError(null);
    setStep(linkSource === "create" ? "create" : "confirm");
  }

  function confirmHit() {
    if (!selected) {
      setError("Seleziona un’anagrafica.");
      return;
    }
    setError(null);
    setLinkSource("existing");
    setStep("link-all");
  }

  function applyLink(linkAll: boolean, persistAuto: boolean) {
    if (!selected) return;
    startTransition(async () => {
      const res = await confirmWebmailAnagraficaLinkAction({
        messaggioId: messaggio.id,
        aziendaTipo: selected.tipo,
        aziendaId: selected.id,
        aziendaLabel: selected.label,
        contattoId: selected.contattoId,
        linkAllExisting: linkAll,
        persistAutoLink: persistAuto,
      });
      if (!res.success) {
        setError(res.error);
        setStep("confirm");
        return;
      }
      onDone(
        res.messaggio,
        persistAuto
          ? `Collegate ${res.linkedCount} mail. Le prossime da ${messaggio.fromAddress} si collegheranno da sole.`
          : `Collegate ${res.linkedCount} mail.`
      );
      onClose();
    });
  }

  function saveCreate(linkAll: boolean, persistAuto: boolean) {
    startTransition(async () => {
      const res = await createAndLinkWebmailAnagraficaAction({
        messaggioId: messaggio.id,
        kind,
        azienda: {
          ragioneSociale: form.ragioneSociale,
          partitaIva: form.partitaIva,
          codiceFiscale: form.codiceFiscale,
          isPrivato: form.isPrivato,
          email: form.email || messaggio.fromAddress,
          pec: form.pec,
          sdiCode: form.sdiCode,
          telefono: form.telefono,
          sitoWeb: form.sitoWeb,
          nazione: form.nazione,
          provincia: form.provincia,
          citta: form.citta,
          cap: form.cap,
          indirizzo: form.indirizzo,
        },
        includeReferente,
        referente: includeReferente
          ? {
              nome: form.referenteNome,
              cognome: form.referenteCognome,
              email: form.referenteEmail || messaggio.fromAddress,
              telefono: form.referenteTelefono,
              mansione: form.referenteMansione,
            }
          : undefined,
        linkAllExisting: linkAll,
        persistAutoLink: persistAuto,
      });
      if (!res.success) {
        setError(res.error);
        setFieldErrors(createFieldErrors(form));
        setStep("create");
        return;
      }
      onDone(
        res.messaggio,
        persistAuto
          ? `Anagrafica creata e collegate ${res.linkedCount} mail. Le prossime da questo indirizzo si collegheranno da sole.`
          : `Anagrafica creata e collegate ${res.linkedCount} mail.`
      );
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-slate-950/55 p-0 sm:p-3"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Collega azienda"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Collega azienda</h2>
            <p className="text-[11px] text-[var(--muted)]">
              Mittente: {messaggio.fromAddress}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <section className="min-h-0 overflow-y-auto border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Testo mail
            </p>
            <p className="mt-2 text-sm font-medium">{messaggio.subject}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {messaggio.fromName || messaggio.fromAddress}
            </p>
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
              {messaggio.bodyText || "(nessun testo)"}
            </pre>
          </section>

          <section className="min-h-0 overflow-y-auto p-4">
            {error ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </p>
            ) : null}

            {step === "lookup" ? (
              <p className="text-sm text-[var(--muted)]">
                Controllo clienti e possibili clienti…
              </p>
            ) : null}

            {step === "confirm" && selected ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Trovat{hits.length === 1 ? "a" : "e"} {hits.length} anagrafic
                  {hits.length === 1 ? "a" : "he"} con questo indirizzo. Vuoi
                  collegare questa mail?
                </p>
                <ul className="space-y-2">
                  {hits.map((h) => (
                    <li key={`${h.tipo}-${h.id}-${h.contattoId ?? ""}`}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                        <input
                          type="radio"
                          checked={
                            selected.id === h.id &&
                            selected.tipo === h.tipo &&
                            selected.contattoId === h.contattoId
                          }
                          onChange={() => setSelected(h)}
                        />
                        <span>
                          <span className="font-medium">{h.label}</span>
                          <span className="ml-1 text-xs text-[var(--muted)]">
                            {h.tipo === "cliente"
                              ? "Cliente"
                              : "Possibile cliente"}
                            {h.via === "pec" ? " · PEC" : ""}
                            {h.via === "referente" && h.contattoNome
                              ? ` · referente ${h.contattoNome}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={confirmHit}
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Sì, collega
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const extracted =
                          await extractWebmailAnagraficaFromEmailAction(
                            messaggio.id
                          );
                        if (extracted.success) {
                          setForm(extracted.extract);
                          setIncludeReferente(extracted.extract.hasReferente);
                        }
                        setStep("create");
                      });
                    }}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    No, crea nuova
                  </button>
                </div>
              </div>
            ) : null}

            {step === "link-all" ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Collegare anche tutte le altre mail già presenti con indirizzo{" "}
                  <code>{messaggio.fromAddress}</code> e, da ora, collegarle in
                  automatico a ogni sincronizzazione?
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Destinazione:{" "}
                  <strong>
                    {linkSource === "create"
                      ? form.ragioneSociale
                      : selected?.label}
                  </strong>{" "}
                  (
                  {(linkSource === "create" ? kind : selected?.tipo) ===
                  "cliente"
                    ? "Cliente"
                    : "Possibile cliente"}
                  )
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      linkSource === "create"
                        ? saveCreate(true, true)
                        : applyLink(true, true)
                    }
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {pending ? "Salvataggio…" : "Sì, tutte e in automatico"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      linkSource === "create"
                        ? saveCreate(false, false)
                        : applyLink(false, false)
                    }
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    Solo questa mail
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={backFromLinkAll}
                    className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                  >
                    Indietro
                  </button>
                </div>
              </div>
            ) : null}

            {step === "create" ? (
              <div className="space-y-4">
                <p className="text-sm">
                  Nessun cliente o possibile cliente trovato. Compila i dati
                  letti dalla mail (intestazione e firma).
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={kind === "cliente"}
                      onChange={() => setKind("cliente")}
                    />
                    Cliente
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={kind === "cliente_possibile"}
                      onChange={() => setKind("cliente_possibile")}
                    />
                    Possibile cliente
                  </label>
                </div>
                <p className="text-[11px] text-[var(--muted)]">
                  I campi sono gli stessi: scegli solo il tipo con la spunta.
                  Per un’azienda servono P.IVA e codice fiscale (o spunta
                  Privato).
                </p>

                <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {kind === "cliente" ? "Cliente" : "Possibile cliente"}
                  </p>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.isPrivato}
                      onChange={(e) => patch("isPrivato", e.target.checked)}
                    />
                    Privato (senza P.IVA e CF obbligatori)
                  </label>
                  <div>
                    <input
                      value={form.ragioneSociale}
                      onChange={(e) => patch("ragioneSociale", e.target.value)}
                      placeholder="Ragione sociale / intestazione *"
                      aria-invalid={Boolean(fieldErrors.ragioneSociale)}
                      className={fieldClass(Boolean(fieldErrors.ragioneSociale))}
                    />
                    {fieldErrors.ragioneSociale ? (
                      <p className="mt-1 text-[11px] text-red-700">
                        {fieldErrors.ragioneSociale}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <input
                        value={form.partitaIva}
                        onChange={(e) => patch("partitaIva", e.target.value)}
                        placeholder={
                          form.isPrivato ? "Partita IVA" : "Partita IVA *"
                        }
                        aria-invalid={Boolean(fieldErrors.partitaIva)}
                        className={fieldClass(Boolean(fieldErrors.partitaIva))}
                      />
                      {fieldErrors.partitaIva ? (
                        <p className="mt-1 text-[11px] text-red-700">
                          {fieldErrors.partitaIva}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <input
                        value={form.codiceFiscale}
                        onChange={(e) =>
                          patch("codiceFiscale", e.target.value)
                        }
                        placeholder={
                          form.isPrivato
                            ? "Codice fiscale"
                            : "Codice fiscale *"
                        }
                        aria-invalid={Boolean(fieldErrors.codiceFiscale)}
                        className={fieldClass(
                          Boolean(fieldErrors.codiceFiscale)
                        )}
                      />
                      {fieldErrors.codiceFiscale ? (
                        <p className="mt-1 text-[11px] text-red-700">
                          {fieldErrors.codiceFiscale}
                        </p>
                      ) : null}
                    </div>
                    <input
                      value={form.email}
                      onChange={(e) => patch("email", e.target.value)}
                      placeholder="Email"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.pec}
                      onChange={(e) => patch("pec", e.target.value)}
                      placeholder="PEC"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.telefono}
                      onChange={(e) => patch("telefono", e.target.value)}
                      placeholder="Telefono"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.sdiCode}
                      onChange={(e) => patch("sdiCode", e.target.value)}
                      placeholder="Codice SDI"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.sitoWeb}
                      onChange={(e) => patch("sitoWeb", e.target.value)}
                      placeholder="Sito web"
                      className={`sm:col-span-2 ${fieldClass(false)}`}
                    />
                    <input
                      value={form.indirizzo}
                      onChange={(e) => patch("indirizzo", e.target.value)}
                      placeholder="Indirizzo"
                      className={`sm:col-span-2 ${fieldClass(false)}`}
                    />
                    <input
                      value={form.cap}
                      onChange={(e) => patch("cap", e.target.value)}
                      placeholder="CAP"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.citta}
                      onChange={(e) => patch("citta", e.target.value)}
                      placeholder="Città"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.provincia}
                      onChange={(e) => patch("provincia", e.target.value)}
                      placeholder="Provincia"
                      className={fieldClass(false)}
                    />
                    <input
                      value={form.nazione}
                      onChange={(e) => patch("nazione", e.target.value)}
                      placeholder="Nazione"
                      className={fieldClass(false)}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeReferente}
                    onChange={(e) => setIncludeReferente(e.target.checked)}
                  />
                  C’è un referente (operatore che ha scritto la mail)
                </label>
                {includeReferente ? (
                  <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Referente
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={form.referenteNome}
                        onChange={(e) => patch("referenteNome", e.target.value)}
                        placeholder="Nome"
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                      <input
                        value={form.referenteCognome}
                        onChange={(e) =>
                          patch("referenteCognome", e.target.value)
                        }
                        placeholder="Cognome"
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                      <input
                        value={form.referenteEmail}
                        onChange={(e) =>
                          patch("referenteEmail", e.target.value)
                        }
                        placeholder="Email referente"
                        className="sm:col-span-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                      <input
                        value={form.referenteTelefono}
                        onChange={(e) =>
                          patch("referenteTelefono", e.target.value)
                        }
                        placeholder="Telefono"
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                      <input
                        value={form.referenteMansione}
                        onChange={(e) =>
                          patch("referenteMansione", e.target.value)
                        }
                        placeholder="Mansione"
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={goToLinkAllFromCreate}
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Crea e collega
                  </button>
                  {hits.length > 0 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        setFieldErrors({});
                        setStep("confirm");
                      }}
                      className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] underline-offset-2 hover:underline"
                    >
                      Indietro
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
