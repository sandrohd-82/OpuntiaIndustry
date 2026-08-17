"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { FaChevronDown, FaCopy } from "react-icons/fa6";
import {
  CODICE_MATERIA_PRIMA_PREFIX,
  composeCodiceMateriaPrima,
  findMateriaPrimaByCodice,
  findMateriaPrimaByNomeExact,
  findSimilarMateriePrime,
  sanitizeCodiceMateriaPrimaBody,
  stripCodiceMateriaPrimaPrefix,
  type MateriaPrima,
  type MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";

type Tipologia = "bio" | "convenzionale";

type Props = {
  mode: "create" | "edit";
  initial?: MateriaPrima | null;
  /** Catalogo per copia modello, univocità targa e ricerca nomi simili. */
  catalog?: MateriaPrima[];
  onClose: () => void;
  onSave: (values: MateriaPrimaInput) => void | Promise<void>;
};

const LEGGENDA_PARTI = [
  { pezzo: "Mp", significato: "Materia prima (prefisso fisso)" },
  {
    pezzo: "Cl",
    significato: "Prime 2 consonanti del prodotto (es. Cladodi → Cl)",
  },
  { pezzo: "B / C", significato: "Biologico oppure Convenzionale" },
  { pezzo: "/", significato: "Separatore se presente età o altro dettaglio" },
  { pezzo: "12", significato: "Età o altro dettaglio" },
] as const;

export function MateriaPrimaFormModal({
  mode,
  initial,
  catalog = [],
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const leggendaId = useId();
  const isEdit = mode === "edit";
  const excludeId = initial?.id ?? null;

  const [codiceBody, setCodiceBody] = useState(
    initial ? stripCodiceMateriaPrimaPrefix(initial.codice) : ""
  );
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [tipologia, setTipologia] = useState<Tipologia | null>(
    initial ? (initial.isBio ? "bio" : "convenzionale") : null
  );
  const [leggendaOpen, setLeggendaOpen] = useState(false);
  const [modelloOpen, setModelloOpen] = useState(false);
  const [modelloQuery, setModelloQuery] = useState("");
  const [modelloUsato, setModelloUsato] = useState<string | null>(null);
  const [ackSimili, setAckSimili] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (modelloOpen) {
        e.preventDefault();
        setModelloOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modelloOpen]);

  const codiceCompleto = useMemo(() => {
    const body = sanitizeCodiceMateriaPrimaBody(codiceBody);
    return body ? composeCodiceMateriaPrima(body) : "";
  }, [codiceBody]);

  const codiceDuplicato = useMemo(() => {
    if (!codiceCompleto) return null;
    return findMateriaPrimaByCodice(codiceCompleto, catalog, excludeId);
  }, [codiceCompleto, catalog, excludeId]);

  const nomeEsatto = useMemo(
    () => findMateriaPrimaByNomeExact(nome, catalog, excludeId),
    [nome, catalog, excludeId]
  );

  const simili = useMemo(
    () =>
      findSimilarMateriePrime(nome, catalog, {
        excludeId,
        limit: 6,
        minScore: 0.45,
      }),
    [nome, catalog, excludeId]
  );

  const similiForti = useMemo(
    () => simili.filter((m) => !m.exact && m.score >= 0.72),
    [simili]
  );

  const modelliFiltrati = useMemo(() => {
    const q = modelloQuery.trim();
    if (!q) return catalog.slice(0, 40);
    return findSimilarMateriePrime(q, catalog, {
      excludeId,
      limit: 30,
      minScore: 0.35,
    }).map((m) => m.materia);
  }, [modelloQuery, catalog, excludeId]);

  function applyModello(m: MateriaPrima) {
    setNome(m.nome);
    setNote(m.note);
    setTipologia(m.isBio ? "bio" : "convenzionale");
    setCodiceBody("");
    setModelloUsato(`${m.codice} — ${m.nome}`);
    setAckSimili(false);
    setFormError(null);
    setModelloOpen(false);
    setModelloQuery("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const body = sanitizeCodiceMateriaPrimaBody(codiceBody);
    if (!body || !nome.trim() || !tipologia || saving) return;

    if (codiceDuplicato) {
      setFormError(
        `Il codice ${codiceCompleto} è già usato da “${codiceDuplicato.nome}”.`
      );
      return;
    }
    if (nomeEsatto) {
      setFormError(
        `Nome già presente come ${nomeEsatto.codice} — ${nomeEsatto.nome}.`
      );
      return;
    }
    if (similiForti.length > 0 && !ackSimili) {
      setFormError(
        "Ci sono nomi molto simili. Controlla l’elenco oppure conferma che non è un duplicato."
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        codice: composeCodiceMateriaPrima(body),
        nome: nome.trim(),
        note: note.trim(),
        isBio: tipologia === "bio",
      });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    Boolean(sanitizeCodiceMateriaPrimaBody(codiceBody)) &&
    Boolean(nome.trim()) &&
    Boolean(tipologia) &&
    !codiceDuplicato &&
    !nomeEsatto &&
    !(similiForti.length > 0 && !ackSimili) &&
    !saving;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {isEdit ? "Modifica materia prima" : "Nuova materia prima"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Prefisso Mp fisso. Esempio:{" "}
          <span className="font-mono font-medium text-slate-700">MpClB/12</span>
        </p>

        {!isEdit && catalog.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50/80 p-3">
            <button
              type="button"
              onClick={() => setModelloOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <FaCopy size={13} />
              Copia da un’altra materia prima
            </button>
            {modelloUsato && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Modello: <span className="font-medium">{modelloUsato}</span>
                . Inserisci un nuovo codice univoco.
              </p>
            )}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Codice interno</span>
              <div
                className={`flex overflow-hidden rounded-lg border focus-within:border-[var(--primary)] ${
                  codiceDuplicato
                    ? "border-red-400"
                    : "border-[var(--border)]"
                }`}
              >
                <span
                  className="inline-flex select-none items-center bg-slate-100 px-3 font-mono text-base font-black tracking-wide text-emerald-800"
                  title="Prefisso fisso"
                >
                  {CODICE_MATERIA_PRIMA_PREFIX}
                </span>
                <input
                  value={codiceBody}
                  onChange={(e) => {
                    setCodiceBody(
                      sanitizeCodiceMateriaPrimaBody(e.target.value)
                    );
                    setFormError(null);
                  }}
                  required
                  autoFocus
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder="ClB/12"
                  aria-label="Parte codice dopo Mp"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono outline-none"
                />
              </div>
            </label>
            {codiceDuplicato ? (
              <p className="text-xs text-red-600">
                Targa già usata: {codiceDuplicato.codice} —{" "}
                {codiceDuplicato.nome}
              </p>
            ) : codiceCompleto ? (
              <p className="text-xs text-emerald-700">Targa disponibile</p>
            ) : null}

            <div className="rounded-lg border border-[var(--border)] bg-slate-50/80">
              <button
                type="button"
                onClick={() => setLeggendaOpen((open) => !open)}
                aria-expanded={leggendaOpen}
                aria-controls={leggendaId}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--primary)] hover:bg-slate-100/80"
              >
                Suggerisci leggenda
                <FaChevronDown
                  size={12}
                  className={`shrink-0 transition-transform ${leggendaOpen ? "rotate-180" : ""}`}
                />
              </button>
              {leggendaOpen && (
                <div
                  id={leggendaId}
                  className="space-y-2 border-t border-[var(--border)] px-3 py-3"
                >
                  <p className="text-xs text-[var(--muted)]">
                    Struttura del codice — es.{" "}
                    <span className="font-mono font-semibold text-slate-700">
                      MpClB/12
                    </span>
                  </p>
                  <ul className="space-y-1.5">
                    {LEGGENDA_PARTI.map((voce) => (
                      <li
                        key={voce.pezzo}
                        className="flex gap-2 text-xs leading-snug"
                      >
                        <span className="w-10 shrink-0 font-mono font-semibold text-slate-800">
                          {voce.pezzo}
                        </span>
                        <span className="text-[var(--muted)]">
                          {voce.significato}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setAckSimili(false);
                  setFormError(null);
                }}
                required
                placeholder="Descrizione breve"
                className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-[var(--primary)] ${
                  nomeEsatto ? "border-red-400" : "border-[var(--border)]"
                }`}
              />
            </label>

            {nomeEsatto && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Nome già registrato come{" "}
                <span className="font-mono font-semibold">
                  {nomeEsatto.codice}
                </span>{" "}
                — {nomeEsatto.nome}. Non puoi creare un duplicato con targa
                diversa.
              </p>
            )}

            {!nomeEsatto && simili.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-900">
                  Risultati simili (controllo anti-duplicato)
                </p>
                <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                  {simili.map(({ materia, score, exact }) => (
                    <li
                      key={materia.id}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <span>
                        <span className="font-mono font-semibold">
                          {materia.codice}
                        </span>{" "}
                        <span className="text-slate-700">{materia.nome}</span>
                        {exact ? (
                          <span className="ml-1 font-medium text-red-600">
                            (identico)
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-800/80">
                        {Math.round(score * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
                {similiForti.length > 0 && (
                  <label className="mt-2 flex items-start gap-2 text-xs text-amber-950">
                    <input
                      type="checkbox"
                      checked={ackSimili}
                      onChange={(e) => {
                        setAckSimili(e.target.checked);
                        setFormError(null);
                      }}
                      className="mt-0.5 rounded border-[var(--border)]"
                    />
                    Confermo che non è un duplicato di queste materie simili
                  </label>
                )}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipologia === "bio"}
                onChange={() => setTipologia("bio")}
                className="rounded border-[var(--border)]"
              />
              Prodotto bio
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipologia === "convenzionale"}
                onChange={() => setTipologia("convenzionale")}
                className="rounded border-[var(--border)]"
              />
              Prodotto convenzionale
            </label>
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Salva"}
            </button>
          </div>
        </form>
      </div>

      {modelloOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={() => setModelloOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Copia da modello"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Usa come modello</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Copia nome, note e tipologia. Il codice va creato nuovo e deve
              restare univoco.
            </p>
            <input
              value={modelloQuery}
              onChange={(e) => setModelloQuery(e.target.value)}
              placeholder="Cerca per nome o codice…"
              autoFocus
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
              {modelliFiltrati.length === 0 ? (
                <p className="px-3 py-3 text-sm text-[var(--muted)]">
                  Nessun risultato.
                </p>
              ) : (
                <ul>
                  {modelliFiltrati.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => applyModello(m)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-mono text-xs font-semibold tracking-wide">
                          {m.codice}
                        </span>
                        <span className="truncate text-[var(--muted)]">
                          {m.nome}
                          {m.isBio ? " · Bio" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setModelloOpen(false)}
              className="mt-3 w-full rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
