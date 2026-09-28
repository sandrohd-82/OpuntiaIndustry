"use client";

import { useMemo, useState } from "react";
import type {
  AziendaEsistenteCandidata,
  CollegamentoScelte,
} from "@/lib/amministrazione/azienda-collegata";

const CHECKS: Array<{
  key: keyof Omit<CollegamentoScelte, "tipologia">;
  label: string;
}> = [
  { key: "inviaPreventivi", label: "Inviare preventivi" },
  { key: "fatturare", label: "Fatturare" },
  { key: "inviaCampionature", label: "Inviare campionature" },
  { key: "inviaProdotti", label: "Inviare prodotti acquistati" },
];

export function CollegaAziendaScelteModal({
  origineLabel,
  origineHaFiglie,
  candidate,
  onClose,
  onNuova,
  onEsistente,
}: {
  origineLabel: string;
  origineHaFiglie: boolean;
  candidate: AziendaEsistenteCandidata[];
  onClose: () => void;
  onNuova: (scelte: CollegamentoScelte) => void;
  onEsistente: (input: {
    altraId: string;
    madre: "origine" | "altra";
    scelte: CollegamentoScelte;
  }) => Promise<string | null>;
}) {
  const [passo, setPasso] = useState<"modo" | "nuova" | "esistente">("modo");
  const [inviaPreventivi, setInviaPreventivi] = useState(true);
  const [fatturare, setFatturare] = useState(true);
  const [inviaCampionature, setInviaCampionature] = useState(true);
  const [inviaProdotti, setInviaProdotti] = useState(true);
  const [tipologia, setTipologia] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [madre, setMadre] = useState<"origine" | "altra">("origine");
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scelte: CollegamentoScelte = {
    inviaPreventivi,
    fatturare,
    inviaCampionature,
    inviaProdotti,
    tipologia: tipologia.trim(),
  };
  const setFlag = {
    inviaPreventivi: setInviaPreventivi,
    fatturare: setFatturare,
    inviaCampionature: setInviaCampionature,
    inviaProdotti: setInviaProdotti,
  };
  const selected = candidate.find((row) => row.id === selectedId) ?? null;
  const madreBloccataSuOrigine = origineHaFiglie;
  const madreBloccataSuAltra = Boolean(selected?.hasFiglie);
  const madreEffettiva: "origine" | "altra" = madreBloccataSuAltra
    ? "altra"
    : madreBloccataSuOrigine
      ? "origine"
      : madre;
  const figliaLabel =
    madreEffettiva === "origine"
      ? (selected?.ragioneSociale ?? "l'azienda scelta")
      : origineLabel;

  const filtrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return candidate;
    return candidate.filter((row) =>
      [row.ragioneSociale, row.codice, row.partitaIva]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [candidate, ricerca]);

  async function confermaEsistente() {
    if (!selected || !scelte.tipologia || saving) return;
    setSaving(true);
    setErrore(null);
    try {
      const err = await onEsistente({
        altraId: selected.id,
        madre: madreEffettiva,
        scelte,
      });
      if (err) setErrore(err);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Collegamento non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collega-azienda-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="collega-azienda-title" className="text-lg font-semibold">
          Collega altra azienda
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Partendo da {origineLabel}. Le due schede restano distinte, con
          timeline separate.
        </p>

        {passo === "modo" ? (
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => setPasso("nuova")}
              className="rounded-lg border border-[var(--border)] px-3 py-3 text-left hover:bg-slate-50"
            >
              <span className="block text-sm font-semibold">Nuova azienda</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Apre una scheda nuova. I dati della madre restano suggeriti in
                trasparenza, da confermare campo per campo.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPasso("esistente")}
              className="rounded-lg border border-[var(--border)] px-3 py-3 text-left hover:bg-slate-50"
            >
              <span className="block text-sm font-semibold">
                Azienda già esistente
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Unisce due schede già presenti. I campi restano quelli già
                salvati: si scelgono solo la madre e le indicazioni di invio.
              </span>
            </button>
          </div>
        ) : null}

        {passo === "nuova" ? (
          <>
            <p className="mt-3 text-sm font-medium">
              A questa nuova azienda si deve:
            </p>
            <ScelteCollegamento
              scelte={scelte}
              setFlag={setFlag}
              tipologia={tipologia}
              onTipologia={setTipologia}
            />
          </>
        ) : null}

        {passo === "esistente" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Cerca azienda</span>
              <input
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                placeholder="Ragione sociale, codice o partita IVA"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
              {filtrate.length === 0 ? (
                <li className="px-2 py-3 text-sm text-[var(--muted)]">
                  Nessuna azienda collegabile con questa ricerca.
                </li>
              ) : (
                filtrate.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        setErrore(null);
                        if (row.hasFiglie) setMadre("altra");
                        else if (!origineHaFiglie) setMadre("origine");
                      }}
                      className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                        selectedId === row.id
                          ? "bg-sky-50 text-sky-950"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-medium">
                        {row.codice ? `${row.codice} · ` : ""}
                        {row.ragioneSociale}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">
                        {row.partitaIva || "Senza partita IVA"}
                        {row.hasFiglie ? " · ha già aziende collegate" : ""}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {selected ? (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    Quale azienda è la madre?
                  </legend>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="azienda-madre"
                      checked={madreEffettiva === "origine"}
                      disabled={madreBloccataSuAltra}
                      onChange={() => setMadre("origine")}
                      className="mt-0.5"
                    />
                    <span>
                      {origineLabel}
                      {madreBloccataSuOrigine ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          Ha già aziende collegate, quindi resta la madre.
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="azienda-madre"
                      checked={madreEffettiva === "altra"}
                      disabled={madreBloccataSuOrigine}
                      onChange={() => setMadre("altra")}
                      className="mt-0.5"
                    />
                    <span>
                      {selected.ragioneSociale}
                      {madreBloccataSuAltra ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          Ha già aziende collegate, quindi resta la madre.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </fieldset>
                <p className="text-sm text-[var(--muted)]">
                  I dati già presenti sulle due schede restano invariati.
                </p>
                <p className="text-sm font-medium">A {figliaLabel} si deve:</p>
                <ScelteCollegamento
                  scelte={scelte}
                  setFlag={setFlag}
                  tipologia={tipologia}
                  onTipologia={setTipologia}
                />
              </>
            ) : null}
            {errore ? (
              <p className="text-sm text-red-700" role="alert">
                {errore}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {passo !== "modo" ? (
            <button
              type="button"
              onClick={() => {
                setPasso("modo");
                setErrore(null);
              }}
              className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Indietro
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Annulla
          </button>
          {passo === "nuova" ? (
            <button
              type="button"
              disabled={!scelte.tipologia}
              onClick={() => onNuova(scelte)}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              Continua
            </button>
          ) : null}
          {passo === "esistente" ? (
            <button
              type="button"
              disabled={!selected || !scelte.tipologia || saving}
              onClick={() => void confermaEsistente()}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Collegamento…" : "Collega"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScelteCollegamento({
  scelte,
  setFlag,
  tipologia,
  onTipologia,
}: {
  scelte: CollegamentoScelte;
  setFlag: Record<keyof Omit<CollegamentoScelte, "tipologia">, (v: boolean) => void>;
  tipologia: string;
  onTipologia: (value: string) => void;
}) {
  return (
    <>
      <ul className="mt-2 space-y-2">
        {CHECKS.map((item) => (
          <li key={item.key}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scelte[item.key]}
                onChange={(e) => setFlag[item.key](e.target.checked)}
                className="mt-0.5 rounded border-[var(--border)]"
              />
              <span>
                {item.label}
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Consigliato e attivo di default. Si può togliere: non è
                  obbligatorio.
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">
          Tipologia rispetto all’azienda madre *
        </span>
        <textarea
          value={tipologia}
          onChange={(e) => onTipologia(e.target.value)}
          rows={3}
          required
          placeholder="Di cosa si occupa rispetto alla sua azienda madre"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
      </label>
    </>
  );
}
