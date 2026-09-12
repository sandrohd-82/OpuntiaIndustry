"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listFogliApertiMagazzinoAction,
  listMovimentiAgrinsiciliaAction,
  listProdottiPropriMagazzinoAction,
  movimentoManualeAgrinsiciliaAction,
} from "@/app/actions/magazzino";
import { LottoAgrinsiciliaModal } from "@/components/magazzino/LottoAgrinsiciliaModal";
import { lottoMaskPlaceholder } from "@/lib/magazzino/lotto-agrinsicilia";
import {
  formatQuantitaCarico,
  MAGAZZINO_CARICO_UNITA_OPTIONS,
  MOTIVO_SENZA_FOGLIO_LABEL,
  unitaStockDaCarico,
  type FoglioApertoOption,
  type MagazzinoCaricoUnita,
  type MotivoSenzaFoglio,
  type MovimentoAgrinsiciliaRiga,
} from "@/lib/magazzino/types";

type ProdottoOpt = {
  id: string;
  codice: string;
  nome: string;
  giacenzaKg: number;
  unitaScheda: MagazzinoCaricoUnita;
};

export function MagazzinoInserisciQuantitaBoard() {
  const [prodotti, setProdotti] = useState<ProdottoOpt[]>([]);
  const [fogli, setFogli] = useState<FoglioApertoOption[]>([]);
  const [movimenti, setMovimenti] = useState<MovimentoAgrinsiciliaRiga[]>([]);
  const [prodottoId, setProdottoId] = useState("");
  const [quantita, setQuantita] = useState<number | "">("");
  const [unitaMisura, setUnitaMisura] = useState<MagazzinoCaricoUnita>("kg");
  const [lottoCodice, setLottoCodice] = useState("");
  const [lottoOpen, setLottoOpen] = useState(false);
  const [collegaFoglio, setCollegaFoglio] = useState(true);
  const [foglioId, setFoglioId] = useState("");
  const [motivo, setMotivo] = useState<MotivoSenzaFoglio>("inventario");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  async function reload() {
    const [p, f, m] = await Promise.all([
      listProdottiPropriMagazzinoAction(),
      listFogliApertiMagazzinoAction(),
      listMovimentiAgrinsiciliaAction(),
    ]);
    if (p.success) setProdotti(p.prodotti);
    if (f.success) setFogli(f.items);
    if (m.success) setMovimenti(m.items);
    if (!p.success) setError(p.error);
    else if (!f.success) setError(f.error);
    else if (!m.success) setError(m.error);
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
  }, []);

  const selected = useMemo(
    () => prodotti.find((p) => p.id === prodottoId) ?? null,
    [prodotti, prodottoId]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (quantita === "" || quantita <= 0) {
      setError("Inserisci una quantità maggiore di zero.");
      return;
    }
    if (!lottoCodice.trim()) {
      setError("Apri la composizione e conferma il lotto di lavorazione.");
      return;
    }
    setSaving(true);
    try {
      const result = await movimentoManualeAgrinsiciliaAction({
        prodottoId,
        quantita,
        unitaMisura,
        lottoCodice,
        collegaFoglio,
        foglioId: collegaFoglio ? foglioId || null : null,
        motivoSenzaFoglio: collegaFoglio ? null : motivo,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOk(
        `Carico registrato. Giacenza attuale: ${formatQuantitaCarico(
          result.giacenzaKg,
          unitaStockDaCarico(selected?.unitaScheda ?? unitaMisura)
        )}.`
      );
      setQuantita("");
      setLottoCodice("");
      setNote("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento inserimento…</p>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <div>
          <h3 className="text-base font-semibold">Carico manuale</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Prodotto, quantità, lotto e foglio di lavorazione. Il foglio si
            può bypassare solo per inventario o rivisita di ordine, con
            motivazione tracciata.
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Prodotto</span>
          <select
            required
            value={prodottoId}
            onChange={(e) => {
              const id = e.target.value;
              setProdottoId(id);
              const next = prodotti.find((p) => p.id === id);
              if (next) setUnitaMisura(next.unitaScheda);
              setLottoCodice("");
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Seleziona…</option>
            {prodotti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codice} — {p.nome} (
                {formatQuantitaCarico(
                  p.giacenzaKg,
                  unitaStockDaCarico(p.unitaScheda)
                )}
                )
              </option>
            ))}
          </select>
          {selected ? (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Giacenza attuale:{" "}
              {formatQuantitaCarico(
                selected.giacenzaKg,
                unitaStockDaCarico(selected.unitaScheda)
              )}
              {" · "}unità scheda {selected.unitaScheda}, modificabile
            </span>
          ) : null}
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Quantità</span>
            <input
              type="number"
              min="0.001"
              step="any"
              required
              value={quantita}
              onChange={(e) =>
                setQuantita(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Unità</span>
            <select
              value={unitaMisura}
              onChange={(e) =>
                setUnitaMisura(e.target.value as MagazzinoCaricoUnita)
              }
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              {MAGAZZINO_CARICO_UNITA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Lotto</span>
          <input
            readOnly
            value={lottoCodice}
            placeholder={lottoMaskPlaceholder(selected?.codice ?? "targa")}
            onClick={() => {
              if (!selected) {
                setError(
                  "Seleziona prima il prodotto: la targa entra nel lotto."
                );
                return;
              }
              setError(null);
              setLottoOpen(true);
            }}
            onFocus={() => {
              if (!selected) {
                setError(
                  "Seleziona prima il prodotto: la targa entra nel lotto."
                );
                return;
              }
              setError(null);
              setLottoOpen(true);
            }}
            className="w-full cursor-pointer rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Foglio di lavorazione</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="foglioMode"
              checked={collegaFoglio}
              onChange={() => setCollegaFoglio(true)}
            />
            <span>Collega a un foglio aperto</span>
          </label>
          {collegaFoglio ? (
            <select
              value={foglioId}
              onChange={(e) => setFoglioId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona foglio…</option>
              {fogli.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.codice}
                  {f.prodotto ? ` · ${f.prodotto}` : ""}
                  {f.lottoLabel ? ` · ${f.lottoLabel}` : ""}
                </option>
              ))}
            </select>
          ) : null}
          {collegaFoglio && fogli.length === 0 ? (
            <p className="text-xs text-amber-800">
              Nessun foglio aperto. Usa il bypass solo se è inventario o
              rivisita di ordine.
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="foglioMode"
              checked={!collegaFoglio}
              onChange={() => setCollegaFoglio(false)}
            />
            <span>Bypass foglio (inventario o rivisita ordine)</span>
          </label>
          {!collegaFoglio ? (
            <div className="space-y-2 pl-6">
              <select
                value={motivo}
                onChange={(e) =>
                  setMotivo(e.target.value as MotivoSenzaFoglio)
                }
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                {Object.entries(MOTIVO_SENZA_FOGLIO_LABEL).map(([k, lab]) => (
                  <option key={k} value={k}>
                    {lab}
                  </option>
                ))}
              </select>
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motivazione obbligatoria del bypass"
                rows={3}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (facoltative)"
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          )}
        </fieldset>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {ok}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {saving ? "Registrazione…" : "Registra carico"}
          </button>
        </div>
      </form>

      {lottoOpen && selected ? (
        <LottoAgrinsiciliaModal
          targaProdotto={selected.codice}
          prodottoLabel={`${selected.codice} — ${selected.nome}`}
          initialLotto={lottoCodice}
          onClose={() => setLottoOpen(false)}
          onConfirm={(lotto) => {
            setLottoCodice(lotto);
            setLottoOpen(false);
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium text-[var(--muted)]">Data</th>
              <th className="px-4 py-3 font-medium text-[var(--muted)]">
                Prodotto
              </th>
              <th className="px-4 py-3 font-medium text-[var(--muted)]">
                Quantità
              </th>
              <th className="px-4 py-3 font-medium text-[var(--muted)]">Lotto</th>
              <th className="px-4 py-3 font-medium text-[var(--muted)]">
                Foglio / motivo
              </th>
            </tr>
          </thead>
          <tbody>
            {movimenti.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  Nessun carico manuale registrato.
                </td>
              </tr>
            ) : (
              movimenti.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {new Date(m.createdAt).toLocaleString("it-IT")}
                  </td>
                  <td className="px-4 py-3 font-mono">{m.prodottoCodice}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatQuantitaCarico(m.quantitaKg, m.unita)}
                  </td>
                  <td className="px-4 py-3 font-mono">{m.lottoCodice || "—"}</td>
                  <td className="px-4 py-3">
                    {m.foglioCodice
                      ? m.foglioCodice
                      : m.motivoSenzaFoglio
                        ? MOTIVO_SENZA_FOGLIO_LABEL[m.motivoSenzaFoglio]
                        : "—"}
                    {m.note ? (
                      <span className="block text-xs text-[var(--muted)]">
                        {m.note}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
