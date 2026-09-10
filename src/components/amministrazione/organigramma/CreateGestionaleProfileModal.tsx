"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createOrganigrammaProfileAction,
  linkOrganigrammaProfileAction,
  listUnlinkedGestionaleProfilesAction,
  type GestionaleProfileOption,
} from "@/app/actions/profiles";
import {
  PROFILE_GERARCHIE,
  PROFILE_GERARCHIA_LABELS,
  PROFILE_POTERE_LABELS,
  PROFILE_REPARTI_OPERATIVI,
  PROFILE_REPARTO_LABELS,
} from "@/lib/auth/gerarchia";
import {
  COMMERCIALE_GRADI,
  COMMERCIALE_GRADO_LABELS,
} from "@/lib/auth/commerciale";
import type { OrganigrammaPersona } from "@/lib/amministrazione/organigramma";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

type Mode = "link" | "create";

type Props = {
  persona: OrganigrammaPersona;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateGestionaleProfileModal({
  persona,
  onClose,
  onCreated,
}: Props) {
  const [mode, setMode] = useState<Mode>("link");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hasCommerciale, setHasCommerciale] = useState(false);
  const [commercialeGrado, setCommercialeGrado] = useState(
    persona.commercialeGrado ?? "senior"
  );
  const [commercialeProvvigionePct, setCommercialeProvvigionePct] = useState(
    persona.commercialeProvvigionePct != null
      ? String(persona.commercialeProvvigionePct)
      : ""
  );
  const [profiles, setProfiles] = useState<GestionaleProfileOption[]>([]);
  const [pickedId, setPickedId] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    void listUnlinkedGestionaleProfilesAction().then((res) => {
      setLoadingList(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setProfiles(res.profiles);
    });
  }, []);

  function submitCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createOrganigrammaProfileAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onCreated();
    });
  }

  function submitLink() {
    setError(null);
    if (!pickedId) {
      setError("Scegli un profilo gestionale già creato.");
      return;
    }
    startTransition(async () => {
      const res = await linkOrganigrammaProfileAction({
        personaId: persona.id,
        profileId: pickedId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onCreated();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold">Profilo gestionale</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {persona.cognome} {persona.nome}. Collega un profilo già creato oppure
          creane uno nuovo dalla scheda operatore.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("link");
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "link"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Collega esistente
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "create"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Crea nuovo
          </button>
        </div>

        {mode === "link" ? (
          <div className="mt-4">
            <label className="block text-xs text-[var(--muted)]">
              Profilo gestionale
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className={inputCls}
                disabled={loadingList}
              >
                <option value="">
                  {loadingList
                    ? "Caricamento…"
                    : profiles.length
                      ? "Scegli un profilo…"
                      : "Nessun profilo libero"}
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.isSuperadmin ? `${p.potereLabel} · ` : ""}
                    {p.label}
                    {p.email ? ` · ${p.email}` : ""}
                    {` · ${p.gerarchiaLabel} · ${p.statoLabel}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Un profilo può essere collegato a un solo operatore. In elenco
              ci sono anche i Super Admin liberi. Chi è già collegato non
              compare.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || !pickedId}
                onClick={submitLink}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Collegamento…" : "Collega"}
              </button>
            </div>
          </div>
        ) : (
          <form action={submitCreate} className="mt-4">
            <input type="hidden" name="personaId" value={persona.id} />
            <input
              type="hidden"
              name="fullName"
              value={`${persona.nome} ${persona.cognome}`.trim()}
            />
            <input type="hidden" name="firstName" value={persona.nome} />
            <input type="hidden" name="lastName" value={persona.cognome} />

            <p className="text-sm text-[var(--muted)]">
              Il profilo nasce in <strong>Test</strong>: nessuna mail, nessun
              2FA, nessun login. Accesso solo dallo switch Super Admin.
            </p>

            <label className="mt-4 block text-xs text-[var(--muted)]">
              Email per accesso, comunicazioni e 2FA
              <input
                name="email"
                type="email"
                required
                className={inputCls}
                placeholder="nome@dominio.it"
              />
            </label>

            <label className="mt-3 block text-xs text-[var(--muted)]">
              Poteri
              <select name="potere" defaultValue="operatore" className={inputCls}>
                <option value="operatore">
                  {PROFILE_POTERE_LABELS.operatore}
                </option>
                <option value="superadmin">
                  {PROFILE_POTERE_LABELS.superadmin}
                </option>
              </select>
            </label>

            <label className="mt-3 block text-xs text-[var(--muted)]">
              Tipo di profilo
              <select
                name="gerarchia"
                defaultValue="operatore"
                className={inputCls}
              >
                {PROFILE_GERARCHIE.map((g) => (
                  <option key={g} value={g}>
                    {PROFILE_GERARCHIA_LABELS[g]}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Amministratore → Senior → Capo Area → Responsabile → Operatore.
            </p>

            <fieldset className="mt-3">
              <legend className="text-xs text-[var(--muted)]">
                Reparti in cui opera
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {PROFILE_REPARTI_OPERATIVI.map((codice) => (
                  <label
                    key={codice}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="reparti"
                      value={codice}
                      onChange={(e) => {
                        if (codice === "commerciale") {
                          setHasCommerciale(e.target.checked);
                        }
                      }}
                    />
                    {PROFILE_REPARTO_LABELS[codice]}
                  </label>
                ))}
              </div>
            </fieldset>
            {hasCommerciale ? (
              <label className="mt-3 block text-xs text-[var(--muted)]">
                Grado commerciale
                <select
                  name="commercialeGrado"
                  value={commercialeGrado}
                  onChange={(e) =>
                    setCommercialeGrado(
                      e.target.value as "senior" | "professional" | "executive"
                    )
                  }
                  className={inputCls}
                >
                  {COMMERCIALE_GRADI.map((g) => (
                    <option key={g} value={g}>
                      {COMMERCIALE_GRADO_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {hasCommerciale ? (
              <label className="mt-3 block text-xs text-[var(--muted)]">
                Provvigione %
                <input
                  name="commercialeProvvigionePct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={commercialeProvvigionePct}
                  onChange={(e) => setCommercialeProvvigionePct(e.target.value)}
                  className={inputCls}
                  placeholder="Es. 5"
                />
              </label>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Creazione…" : "Crea"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
