"use client";

import { useEffect, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  createRubricaContattoAction,
  listAziendeRubricaPickerAction,
  listRubricaMansioniAction,
  updateRubricaContattoAction,
} from "@/app/actions/rubrica";
import { CanaleInputRow } from "@/components/amministrazione/CanaleAttenzioneControls";
import { RubricaMansioneCreateModal } from "@/components/amministrazione/RubricaMansioneCreateModal";
import { SelectMenu } from "@/components/ui/SelectMenu";
import {
  AZIENDA_TIPO_LABELS,
  RAPPORTO_LABELS,
  type RubricaAziendaTipo,
  type RubricaContatto,
  type RubricaMansione,
  type RubricaRapporto,
} from "@/lib/rubrica/types";

type Props = {
  onClose: () => void;
  onCreated: (item: RubricaContatto) => void;
  /** Scheda di un contatto già in rubrica: i campi si modificano e si salvano. */
  contatto?: RubricaContatto | null;
  /** Prefill azienda (es. da form possibile cliente) */
  defaultAziendaTipo?: RubricaAziendaTipo;
  defaultAziendaLabel?: string;
  defaultAziendaId?: string;
  /** Da scheda cliente/fornitore: collega a questa azienda, senza elenco. */
  lockToThisAzienda?: boolean;
  defaultMansioneId?: string;
  /** Catalogo già letto dalla rubrica: la scheda non resta in attesa di un secondo giro. */
  mansioniCatalog?: RubricaMansione[];
  testMode?: boolean;
  elevated?: boolean;
};

export function RubricaContattoFormModal({
  onClose,
  onCreated,
  contatto = null,
  defaultAziendaTipo = "nessuna",
  defaultAziendaLabel = "",
  defaultAziendaId = "",
  lockToThisAzienda = false,
  defaultMansioneId = "",
  mansioniCatalog = [],
  testMode = false,
  elevated = false,
}: Props) {
  const editing = Boolean(contatto);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState(contatto?.nome ?? "");
  const [cognome, setCognome] = useState(contatto?.cognome ?? "");
  const [telefono, setTelefono] = useState(contatto?.telefono ?? "");
  const [email, setEmail] = useState(contatto?.email ?? "");
  const [rapporto, setRapporto] = useState<RubricaRapporto>(
    contatto?.rapporto ?? "referente"
  );
  const [aziendaTipo, setAziendaTipo] = useState<RubricaAziendaTipo>(
    contatto?.aziendaTipo ?? defaultAziendaTipo
  );
  const [aziendaId, setAziendaId] = useState<string>(
    contatto?.aziendaId ?? defaultAziendaId
  );
  const [aziendaLabel, setAziendaLabel] = useState(
    contatto
      ? contatto.aziendaLabel
      : defaultAziendaTipo === "agrinsicilia"
        ? "Agrinsicilia"
        : defaultAziendaLabel
  );
  const [mansioneId, setMansioneId] = useState(
    contatto?.mansioneId ?? defaultMansioneId
  );
  const [mansioni, setMansioni] = useState<RubricaMansione[]>(() => {
    if (mansioniCatalog.length > 0) return mansioniCatalog;
    if (contatto?.mansioneId && contatto.mansione) {
      return [
        {
          id: contatto.mansioneId,
          codice: "",
          nome: contatto.mansione,
          documentoStato: "approvato",
          versione: 1,
        },
      ];
    }
    return [];
  });
  const [mansioniLoading, setMansioniLoading] = useState(
    mansioniCatalog.length === 0
  );
  const [aziendeLoading, setAziendeLoading] = useState(false);
  const [showCreaMansione, setShowCreaMansione] = useState(false);
  const [note, setNote] = useState(contatto?.note ?? "");
  const [aziende, setAziende] = useState<{ id: string; label: string }[]>(() =>
    contatto?.aziendaId
      ? [
          {
            id: contatto.aziendaId,
            label: contatto.aziendaLabel || "Azienda collegata",
          },
        ]
      : []
  );
  const [collegaQuestaAzienda, setCollegaQuestaAzienda] = useState(
    lockToThisAzienda
  );

  const aziendaCollegata = lockToThisAzienda
    ? collegaQuestaAzienda
    : aziendaTipo !== "nessuna";

  useEffect(() => {
    let attivo = true;
    setMansioniLoading(mansioniCatalog.length === 0);
    const timer = window.setTimeout(() => {
      if (!attivo) return;
      setMansioniLoading(false);
      setError((cur) => cur ?? "Le mansioni non sono arrivate. Ricarica la pagina.");
    }, 12000);
    void listRubricaMansioniAction()
      .then((res) => {
        if (!attivo) return;
        if (!res.success) {
          setError(res.error);
          return;
        }
        setError((cur) =>
          cur === "Le mansioni non sono arrivate. Ricarica la pagina."
            ? null
            : cur
        );
        setMansioni(res.items);
        if (defaultMansioneId) setMansioneId(defaultMansioneId);
      })
      .catch(() => {
        if (!attivo) return;
        setError("Impossibile leggere le mansioni.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (attivo) setMansioniLoading(false);
      });
    return () => {
      attivo = false;
      window.clearTimeout(timer);
    };
  }, [defaultMansioneId, mansioniCatalog.length]);

  useEffect(() => {
    if (lockToThisAzienda || aziendaTipo === "nessuna" || aziendaTipo === "agrinsicilia") {
      setAziendeLoading(false);
      return;
    }
    let attivo = true;
    setAziendeLoading(true);
    const timer = window.setTimeout(() => {
      if (!attivo) return;
      setAziendeLoading(false);
      setError((cur) => cur ?? "L'elenco aziende non è arrivato. Ricarica la pagina.");
    }, 12000);
    void listAziendeRubricaPickerAction(aziendaTipo)
      .then((res) => {
        if (!attivo) return;
        if (!res.success) {
          setError(res.error);
          return;
        }
        setError((cur) =>
          cur === "L'elenco aziende non è arrivato. Ricarica la pagina."
            ? null
            : cur
        );
        setAziende((prev) => {
          const corrente = prev.filter(
            (a) => !res.items.some((item) => item.id === a.id)
          );
          return [...corrente, ...res.items];
        });
      })
      .catch(() => {
        if (!attivo) return;
        setError("Impossibile leggere l'elenco aziende.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (attivo) setAziendeLoading(false);
      });
    return () => {
      attivo = false;
      window.clearTimeout(timer);
    };
  }, [aziendaTipo, lockToThisAzienda]);

  function save() {
    if (!nome.trim() || !cognome.trim() || !rapporto) {
      setError("Compila Nome, Cognome e Referente.");
      return;
    }
    startTransition(async () => {
      const locked = lockToThisAzienda && collegaQuestaAzienda;
      const tipoEff = locked
        ? defaultAziendaTipo
        : lockToThisAzienda
          ? "nessuna"
          : aziendaTipo;
      const mansioneNome =
        mansioni.find((m) => m.id === mansioneId)?.nome ?? "";
      const payload = {
        nome,
        cognome,
        telefono,
        email,
        rapporto,
        aziendaTipo: tipoEff,
        aziendaId:
          tipoEff === "agrinsicilia" || tipoEff === "nessuna"
            ? null
            : locked
              ? defaultAziendaId || null
              : aziendaId || null,
        aziendaLabel:
          tipoEff === "agrinsicilia"
            ? "Agrinsicilia"
            : tipoEff === "nessuna"
              ? ""
              : locked
                ? defaultAziendaLabel.trim() || "Questa azienda"
                : aziendaLabel ||
                  aziende.find((a) => a.id === aziendaId)?.label ||
                  "",
        mansioneId: mansioneId || null,
        mansione: mansioneNome,
        note,
      };
      if (testMode && !contatto) {
        const now = new Date().toISOString();
        onCreated({
          id: crypto.randomUUID(),
          nome: payload.nome.trim(),
          cognome: payload.cognome.trim(),
          telefono: payload.telefono ?? "",
          email: payload.email ?? "",
          rapporto: payload.rapporto,
          aziendaTipo: tipoEff,
          aziendaId: payload.aziendaId,
          aziendaLabel: payload.aziendaLabel,
          mansioneId: payload.mansioneId,
          mansione: mansioneNome,
          note: payload.note ?? "",
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const res = contatto
        ? await updateRubricaContattoAction({ ...payload, id: contatto.id })
        : await createRubricaContattoAction(payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onCreated(res.item);
    });
  }

  return (
    <>
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 ${
        elevated ? "z-[160]" : "z-[80]"
      }`}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {editing ? "Scheda contatto" : "Nuovo contatto rubrica"}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {editing
                ? "Modifica i dati e salva. Nome, cognome e tipo di rapporto restano obbligatori."
                : "Obbligatori: Nome, Cognome, Referente. Telefono e mail sono facoltativi."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome *</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cognome *</span>
            <input
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <CanaleInputRow
            label="Telefono"
            canale="telefono"
            inputMode="tel"
            value={telefono}
            onChange={setTelefono}
          />
          <CanaleInputRow
            label="Mail"
            canale="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
          />

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Referente *</span>
            <select
              value={rapporto}
              onChange={(e) => setRapporto(e.target.value as RubricaRapporto)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {(Object.keys(RAPPORTO_LABELS) as RubricaRapporto[]).map((k) => (
                <option key={k} value={k}>
                  {RAPPORTO_LABELS[k]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Tipo di rapporto (Referente / Dipendente / Altro).
            </span>
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Nota</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Es. conosciuto al Sana"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          {lockToThisAzienda ? (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Collega a questa azienda
              </span>
              <span className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={collegaQuestaAzienda}
                  onChange={(e) => setCollegaQuestaAzienda(e.target.checked)}
                />
                <span>
                  {defaultAziendaLabel.trim() || "Questa scheda"}
                  <span className="ml-1 text-xs text-[var(--muted)]">
                    ({AZIENDA_TIPO_LABELS[defaultAziendaTipo]})
                  </span>
                </span>
              </span>
            </label>
          ) : (
            <>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">
                  {RAPPORTO_LABELS[rapporto]} → Azienda (facoltativo)
                </span>
                <select
                  value={aziendaTipo}
                  onChange={(e) => {
                    const t = e.target.value as RubricaAziendaTipo;
                    setAziendaTipo(t);
                    setAziendaId("");
                    setAziendaLabel(
                      t === "agrinsicilia"
                        ? "Agrinsicilia"
                        : t === "nessuna"
                          ? ""
                          : ""
                    );
                  }}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {(Object.keys(AZIENDA_TIPO_LABELS) as RubricaAziendaTipo[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {AZIENDA_TIPO_LABELS[k]}
                      </option>
                    )
                  )}
                </select>
              </label>

              {aziendaCollegata && aziendaTipo !== "agrinsicilia" ? (
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">
                    Seleziona azienda (facoltativo)
                  </span>
                  <SelectMenu
                    loading={aziendeLoading && aziende.length === 0}
                    placeholder="Seleziona azienda"
                    value={aziendaId}
                    onChange={(e) => {
                      setAziendaId(e.target.value);
                      const hit = aziende.find((a) => a.id === e.target.value);
                      setAziendaLabel(hit?.label ?? "");
                    }}
                  >
                    {aziende.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </SelectMenu>
                </label>
              ) : null}
            </>
          )}

          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Mansione</span>
            <SelectMenu
              loading={mansioniLoading && mansioni.length === 0}
              placeholder="Seleziona mansione"
              value={mansioneId}
              onChange={(e) => setMansioneId(e.target.value)}
            >
              {mansioni.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </SelectMenu>
            <button
              type="button"
              onClick={() => setShowCreaMansione(true)}
              className="mt-1.5 text-sm text-[var(--primary)] underline"
            >
              + Crea mansione
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending || !nome.trim() || !cognome.trim() || !rapporto}
            onClick={save}
            className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending
              ? "Salvataggio…"
              : editing
                ? "Salva modifiche"
                : "Salva contatto"}
          </button>
        </div>
      </div>
    </div>
    {showCreaMansione ? (
      <RubricaMansioneCreateModal
        catalog={mansioni}
        testMode={testMode}
        elevated
        onClose={() => setShowCreaMansione(false)}
        onCreated={(item) => {
          setMansioni((cur) =>
            cur.some((m) => m.id === item.id) ? cur : [...cur, item]
          );
          setMansioneId(item.id);
          setShowCreaMansione(false);
        }}
        onSelectExisting={(item) => {
          setMansioneId(item.id);
          setShowCreaMansione(false);
        }}
      />
    ) : null}
    </>
  );
}
