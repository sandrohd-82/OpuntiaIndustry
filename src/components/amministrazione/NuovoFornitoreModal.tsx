"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { previewNextCodiceTargaAction } from "@/app/actions/fornitori";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import {
  emptySede,
  type FornitoreInput,
} from "@/lib/amministrazione/fornitori";

type Props = {
  onClose: () => void;
  onCreate: (values: FornitoreInput) => void | Promise<void>;
};

export function NuovoFornitoreModal({ onClose, onCreate }: Props) {
  const titleId = useId();
  const [codiceTarga, setCodiceTarga] = useState<string | null>(null);
  const [codiceError, setCodiceError] = useState<string | null>(null);
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [partitaIva, setPartitaIva] = useState("");
  const [sedeAmministrativa, setSedeAmministrativa] = useState(emptySede);
  const [sedeMagazzino, setSedeMagazzino] = useState(emptySede);
  const [stessaSede, setStessaSede] = useState(false);
  const [prodotti, setProdotti] = useState<string[]>([]);
  const [nuovoProdotto, setNuovoProdotto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await previewNextCodiceTargaAction();
      if (cancelled) return;
      if (result.success) {
        setCodiceTarga(result.codiceTarga);
        setCodiceError(null);
      } else {
        setCodiceTarga(null);
        setCodiceError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addProdotto() {
    const name = nuovoProdotto.trim();
    if (!name) return;
    if (prodotti.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNuovoProdotto("");
      return;
    }
    setProdotti((prev) => [...prev, name]);
    setNuovoProdotto("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ragioneSociale.trim() || !partitaIva.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate({
        codiceTarga: codiceTarga ?? undefined,
        ragioneSociale: ragioneSociale.trim(),
        partitaIva: partitaIva.trim(),
        sedeAmministrativa,
        sedeMagazzino: stessaSede ? sedeAmministrativa : sedeMagazzino,
        prodottiAcquistati: prodotti,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo fornitore
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Compila i dati anagrafici e i prodotti acquistati.
        </p>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Codice azienda
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">
            {codiceTarga ?? (codiceError ? "—" : "…")}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Anteprima sequenziale: verrà associato solo al salvataggio.
          </p>
          {codiceError && (
            <p className="mt-1 text-xs text-red-600">{codiceError}</p>
          )}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">R. Sociale</span>
              <input
                value={ragioneSociale}
                onChange={(e) => setRagioneSociale(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">P. IVA</span>
              <input
                value={partitaIva}
                onChange={(e) => setPartitaIva(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <AddressSedeFields
            title="Sede Amministrativa"
            value={sedeAmministrativa}
            onChange={(next) => {
              setSedeAmministrativa(next);
              if (stessaSede) setSedeMagazzino(next);
            }}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={stessaSede}
              onChange={(e) => {
                const checked = e.target.checked;
                setStessaSede(checked);
                if (checked) setSedeMagazzino(sedeAmministrativa);
              }}
              className="rounded border-[var(--border)]"
            />
            Sede magazzino uguale alla sede amministrativa
          </label>

          {!stessaSede && (
            <AddressSedeFields
              title="Sede Magazzino"
              value={sedeMagazzino}
              onChange={setSedeMagazzino}
            />
          )}

          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-semibold">
              Prodotti Acquistati
            </legend>
            <div className="flex gap-2">
              <input
                value={nuovoProdotto}
                onChange={(e) => setNuovoProdotto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addProdotto();
                  }
                }}
                placeholder="Nome prodotto"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={addProdotto}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
                <FaPlus size={12} />
                Aggiungi
              </button>
            </div>
            {prodotti.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                Nessun prodotto aggiunto. Puoi aggiungerli ora o in seguito.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {prodotti.map((prodotto) => (
                  <li
                    key={prodotto}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-sm"
                  >
                    {prodotto}
                    <button
                      type="button"
                      aria-label={`Rimuovi ${prodotto}`}
                      onClick={() =>
                        setProdotti((prev) =>
                          prev.filter((p) => p !== prodotto)
                        )
                      }
                      className="text-[var(--muted)] hover:text-slate-900"
                    >
                      <FaXmark size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

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
              disabled={saving || !codiceTarga}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : "Salva fornitore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
