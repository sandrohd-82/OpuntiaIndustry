"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listFogliApertiMagazzinoAction,
  listMovimentiAgrinsiciliaAction,
  listProdottiPropriMagazzinoAction,
  movimentoManualeAgrinsiciliaAction,
} from "@/app/actions/magazzino";
import { listImballaggiCiMagazzinoAction } from "@/app/actions/magazzino-lotti";
import { anteprimaLottoUscitaAction } from "@/app/actions/lotti-esterni";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import { LottoAgrinsiciliaModal } from "@/components/magazzino/LottoAgrinsiciliaModal";
import { lottoMaskPlaceholder } from "@/lib/magazzino/lotto-agrinsicilia";
import { stampaSchedaLottoUscita } from "@/lib/produzione/stampa-scheda-lotto-uscita";
import {
  formatQuantitaCarico,
  MAGAZZINO_CARICO_UNITA_OPTIONS,
  MOTIVO_SENZA_FOGLIO_LABEL,
  unitaStockDaCarico,
  type FoglioApertoOption,
  type MagazzinoCaricoUnita,
  type ImballaggioMagazzinoOpt,
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
  const [lottoUscita, setLottoUscita] = useState<{
    codice: string;
    settimana: number;
    anno: number;
  } | null>(null);
  const [lottoUscitaBusy, setLottoUscitaBusy] = useState(false);
  const [confezioni, setConfezioni] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [isolamenti, setIsolamenti] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [confezioneId, setConfezioneId] = useState("");
  const [isolamentoId, setIsolamentoId] = useState("");
  const [rimandaCi, setRimandaCi] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);

  async function reload() {
    const [p, f, m, ci] = await Promise.all([
      listProdottiPropriMagazzinoAction(),
      listFogliApertiMagazzinoAction(),
      listMovimentiAgrinsiciliaAction(),
      listImballaggiCiMagazzinoAction(),
    ]);
    if (p.success) setProdotti(p.prodotti);
    if (f.success) setFogli(f.items);
    if (m.success) setMovimenti(m.items);
    if (ci.success) {
      setConfezioni(ci.confezioni);
      setIsolamenti(ci.isolamenti);
    }
    if (!p.success) setError(p.error);
    else if (!f.success) setError(f.error);
    else if (!m.success) setError(m.error);
    else if (!ci.success) setError(ci.error);
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
  }, []);

  const selected = useMemo(
    () => prodotti.find((p) => p.id === prodottoId) ?? null,
    [prodotti, prodottoId]
  );

  async function associaLottoUscita() {
    setError(null);
    setLottoUscitaBusy(true);
    try {
      const res = await anteprimaLottoUscitaAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setLottoUscita({
        codice: res.codice,
        settimana: res.settimana,
        anno: res.anno,
      });
    } finally {
      setLottoUscitaBusy(false);
    }
  }

  function stampaAnteprimaUscita() {
    if (!lottoUscita) return;
    const canvas = printRootRef.current?.querySelector("canvas");
    const qr =
      canvas instanceof HTMLCanvasElement ? canvas.toDataURL("image/png") : null;
    stampaSchedaLottoUscita({
      codice: lottoUscita.codice,
      publicUrl: "",
      prodotto: selected
        ? `${selected.codice} — ${selected.nome}`
        : "Prodotto Agrinsicilia",
      settimana: lottoUscita.settimana,
      anno: lottoUscita.anno,
      qrDataUrl: qr,
    });
  }

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
    if (!rimandaCi && (!confezioneId || !isolamentoId)) {
      setError(
        "Seleziona confezionamento e isolamento, oppure spunta «Completa in un secondo momento»."
      );
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
        confezioneId: confezioneId || null,
        isolamentoId: isolamentoId || null,
        rimandaConfezIsolamento: rimandaCi,
        associaLottoUscita: Boolean(lottoUscita),
        lottoUscitaAnteprima: lottoUscita?.codice ?? null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const lottoMsg = result.lottoUscitaCodice
        ? result.lottoUscitaCodiceCambiato
          ? ` Lotto in uscita registrato ${result.lottoUscitaCodice} (il codice stampato era già usato).`
          : ` Lotto in uscita ${result.lottoUscitaCodice} registrato.`
        : "";
      setOk(
        `Carico registrato. Giacenza attuale: ${formatQuantitaCarico(
          result.giacenzaKg,
          unitaStockDaCarico(selected?.unitaScheda ?? unitaMisura)
        )}.${
          result.foglioMpCodice
            ? ` Foglio Codice MP Lavorata ${result.foglioMpCodice} archiviato (Storico / Archivio).`
            : ""
        }${lottoMsg}`
      );
      setQuantita("");
      setLottoCodice("");
      setLottoUscita(null);
      setNote("");
      setConfezioneId("");
      setIsolamentoId("");
      setRimandaCi(false);
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

        <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-slate-50/70 p-4">
          <legend className="px-1 text-sm font-medium">
            Confezionamento e isolamento
          </legend>
          <p className="text-xs text-[var(--muted)]">
            Obbligatorio per chiudere la scheda. Puoi rimandarlo: la quantità
            si salva lo stesso.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tipo di confezionamento</span>
              <select
                value={confezioneId}
                onChange={(e) => setConfezioneId(e.target.value)}
                disabled={rimandaCi}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Seleziona…</option>
                {confezioni.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codice} — {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Isolamento</span>
              <select
                value={isolamentoId}
                onChange={(e) => setIsolamentoId(e.target.value)}
                disabled={rimandaCi}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Seleziona…</option>
                {isolamenti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codice} — {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {confezioni.length === 0 && isolamenti.length === 0 ? (
            <p className="text-xs text-amber-800">
              Catalogo imballaggi vuoto. Spunta «Completa in un secondo
              momento» oppure chiedi ad Amministrazione di inserire le voci.
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={rimandaCi}
              onChange={(e) => setRimandaCi(e.target.checked)}
              className="mt-0.5"
            />
            <span>Completa in un secondo momento (non blocca il carico)</span>
          </label>
        </fieldset>

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
                  {f.lottoUscitaCodice ? ` · uscita ${f.lottoUscitaCodice}` : ""}
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

        <section
          ref={printRootRef}
          className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4"
        >
          <p className="text-sm font-medium text-sky-900">
            Lotto prodotto in uscita (esterno)
          </p>
          <p className="text-xs text-sky-800">
            Si stampa ora; si registra in anagrafica solo con «Registra
            carico». Se chiudi senza salvare, il codice non esiste.
          </p>
          {collegaFoglio &&
          fogli.find((f) => f.id === foglioId)?.lottoUscitaCodice &&
          !lottoUscita ? (
            <p className="text-xs text-slate-600">
              Il foglio ha già il lotto{" "}
              <span className="font-mono">
                {fogli.find((f) => f.id === foglioId)?.lottoUscitaCodice}
              </span>
              . Verrà usato sul carico, salvo se associ un lotto nuovo.
            </p>
          ) : null}
          {lottoUscita ? (
            <div className="grid gap-3 md:grid-cols-[140px_1fr]">
              <BarcodePreview value={lottoUscita.codice} format="qrcode" />
              <div>
                <p className="font-mono text-2xl font-semibold tracking-wide">
                  {lottoUscita.codice}
                </p>
                <p className="text-xs text-slate-600">
                  Settimana ISO {lottoUscita.settimana} · {lottoUscita.anno}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={stampaAnteprimaUscita}
                    className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Stampa etichetta
                  </button>
                  <button
                    type="button"
                    onClick={() => setLottoUscita(null)}
                    className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-800"
                  >
                    Togli associazione
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={lottoUscitaBusy}
              onClick={() => void associaLottoUscita()}
              className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {lottoUscitaBusy
                ? "Preparazione…"
                : "Associa nuovo lotto di uscita"}
            </button>
          )}
        </section>

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
              <th className="px-4 py-3 font-medium text-[var(--muted)]">
                Foglio MP
              </th>
            </tr>
          </thead>
          <tbody>
            {movimenti.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
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
                  <td className="px-4 py-3 font-mono">
                    {m.lottoCodice || "—"}
                    {m.lottoUscitaCodice ? (
                      <span className="mt-1 block text-xs text-sky-800">
                        uscita {m.lottoUscitaCodice}
                      </span>
                    ) : null}
                  </td>
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
                  <td className="px-4 py-3">
                    {m.foglioIngressoCodice ? (
                      <>
                        <span className="font-medium">
                          {m.foglioIngressoCodice}
                        </span>
                        {m.foglioIngressoLotto ? (
                          <span className="block font-mono text-xs text-[var(--muted)]">
                            {m.foglioIngressoLotto}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
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
