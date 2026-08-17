"use client";

import { useEffect, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  getCompanyFiscalProfileAction,
  listFiscalOpenDataCacheAction,
  listFiscalProfileAuditAction,
  refreshFiscalOpenDataPlaceholderAction,
  updateCompanyFiscalProfileAction,
} from "@/app/actions/fiscal-profile";
import {
  labelFormaGiuridica,
  labelRegimeIva,
  type CompanyFiscalProfile,
} from "@/lib/amministrazione/fiscal-profile";
import type { FiscalTipoColtura } from "@/types/database";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";

export function ProfiloFiscaleForm() {
  const [profile, setProfile] = useState<CompanyFiscalProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<
    Array<{
      id: string;
      changedAt: string;
      reasonForChange: string;
      versioneNext: number | null;
    }>
  >([]);
  const [sources, setSources] = useState<
    Array<{
      sourceKey: string;
      sourceLabel: string;
      sourceUrl: string;
      fetchedAt: string;
      note: string;
    }>
  >([]);

  // editable local state
  const [regimeIva, setRegimeIva] =
    useState<CompanyFiscalProfile["regimeIva"]>("ordinario");
  const [ivaPeriodo, setIvaPeriodo] =
    useState<CompanyFiscalProfile["ivaPeriodo"]>("trimestrale");
  const [l381, setL381] = useState(true);
  const [zona, setZona] = useState(false);
  const [otd, setOtd] = useState<number | "">(0);
  const [oti, setOti] = useState<number | "">(0);
  const [tipi, setTipi] = useState<FiscalTipoColtura[]>([]);
  const [ires, setIres] = useState<number | "">(12);
  const [irap, setIrap] = useState<number | "">(3.9);
  const [stimaGen, setStimaGen] = useState<number | "">(24);
  const [inpsOtd, setInpsOtd] = useState<number | "">(0);
  const [inpsOti, setInpsOti] = useState<number | "">(0);
  const [inpsSgravio, setInpsSgravio] = useState<number | "">(0);
  const [inpsFissa, setInpsFissa] = useState<number | "">(0);
  const [note, setNote] = useState("");
  const [openData, setOpenData] = useState(false);

  function applyProfile(p: CompanyFiscalProfile) {
    setProfile(p);
    setRegimeIva(p.regimeIva);
    setIvaPeriodo(p.ivaPeriodo);
    setL381(p.cooperativaSocialeL381);
    setZona(p.zonaSvantaggiata);
    setOtd(p.otdCount);
    setOti(p.otiCount);
    setTipi(p.tipiColture);
    setIres(p.aliquotaIresPct);
    setIrap(p.aliquotaIrapPct);
    setStimaGen(p.aliquotaStimaGenericaPct);
    setInpsOtd(p.inpsParametri.contribuzione_otd_pct);
    setInpsOti(p.inpsParametri.contribuzione_oti_pct);
    setInpsSgravio(p.inpsParametri.sgravio_zona_svantaggiata_pct);
    setInpsFissa(p.inpsParametri.stima_mensile_fissa_eur);
    setNote(p.note);
    setOpenData(p.openDataEnabled);
  }

  async function reload() {
    const [p, a, s] = await Promise.all([
      getCompanyFiscalProfileAction(),
      listFiscalProfileAuditAction(),
      listFiscalOpenDataCacheAction(),
    ]);
    if (!p.success) {
      setError(p.error);
      return;
    }
    setError(null);
    applyProfile(p.profile);
    if (a.success) setAudit(a.rows);
    if (s.success) setSources(s.sources);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const result = await updateCompanyFiscalProfileAction({
        formaGiuridica: "cooperativa_agricola_sociale_arl",
        regimeIva,
        ivaPeriodo,
        cooperativaSocialeL381: l381,
        zonaSvantaggiata: zona,
        otdCount: numberOrZero(otd),
        otiCount: numberOrZero(oti),
        tipiColture: tipi,
        inpsParametri: {
          contribuzione_otd_pct: numberOrZero(inpsOtd),
          contribuzione_oti_pct: numberOrZero(inpsOti),
          sgravio_zona_svantaggiata_pct: numberOrZero(inpsSgravio),
          stima_mensile_fissa_eur: numberOrZero(inpsFissa),
        },
        aliquotaIresPct: numberOrZero(ires),
        aliquotaIrapPct: numberOrZero(irap),
        aliquotaStimaGenericaPct: numberOrZero(stimaGen),
        note,
        openDataEnabled: openData,
        reasonForChange: reason,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      applyProfile(result.profile);
      setReason("");
      setInfo(`Profilo salvato (v${result.profile.versione}).`);
      const a = await listFiscalProfileAuditAction();
      if (a.success) setAudit(a.rows);
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !error) {
    return <p className="text-sm text-[var(--muted)]">Caricamento profilo…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profilo fiscale aziendale</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Parametri per Cooperativa Agricola e Sociale A.R.L. Ogni modifica
          richiede motivo e audit (ISO 9001).
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </p>
      ) : null}

      {profile ? (
        <form
          className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Forma giuridica
              </label>
              <input
                readOnly
                value={labelFormaGiuridica(profile.formaGiuridica)}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Regime IVA
              </label>
              <select
                value={regimeIva}
                onChange={(e) =>
                  setRegimeIva(
                    e.target.value as CompanyFiscalProfile["regimeIva"]
                  )
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="speciale_agricolo_art34">
                  {labelRegimeIva("speciale_agricolo_art34")}
                </option>
                <option value="ordinario">{labelRegimeIva("ordinario")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Liquidazione IVA
              </label>
              <select
                value={ivaPeriodo}
                onChange={(e) =>
                  setIvaPeriodo(
                    e.target.value as CompanyFiscalProfile["ivaPeriodo"]
                  )
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="trimestrale">Trimestrale</option>
                <option value="mensile">Mensile</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 pt-5 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={l381}
                  onChange={(e) => setL381(e.target.checked)}
                />
                Cooperativa sociale L. 381/91 (agevolazioni IRES/IRAP)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={zona}
                  onChange={(e) => setZona(e.target.checked)}
                />
                Zona svantaggiata (sgravi INPS agricoli)
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Operai OTD
              </label>
              <ClearableNumberInput
                min={0}
                value={otd}
                onValueChange={setOtd}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Operai OTI
              </label>
              <ClearableNumberInput
                min={0}
                value={oti}
                onValueChange={setOti}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Aliquota IRES %
              </label>
              <ClearableNumberInput
                min={0}
                max={100}
                value={ires}
                onValueChange={setIres}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Aliquota IRAP %
              </label>
              <ClearableNumberInput
                min={0}
                max={100}
                value={irap}
                onValueChange={setIrap}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Colture / prodotti (compensazione art. 34)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setTipi((prev) => [
                    ...prev,
                    {
                      codice: `tipo_${prev.length + 1}`,
                      label: "Nuovo tipo",
                      percentuale_compensazione: 0,
                      aliquota_iva: 4,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
              >
                <FaPlus size={10} /> Aggiungi
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-2 py-2 text-left">Codice</th>
                    <th className="px-2 py-2 text-left">Label</th>
                    <th className="px-2 py-2 text-left">Comp. %</th>
                    <th className="px-2 py-2 text-left">IVA %</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tipi.map((t, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-2 py-1.5">
                        <input
                          value={t.codice}
                          onChange={(e) =>
                            setTipi((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, codice: e.target.value }
                                  : row
                              )
                            )
                          }
                          className="w-full rounded border border-[var(--border)] px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={t.label}
                          onChange={(e) =>
                            setTipi((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, label: e.target.value }
                                  : row
                              )
                            )
                          }
                          className="w-full rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={t.percentuale_compensazione}
                          onChange={(e) =>
                            setTipi((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? {
                                      ...row,
                                      percentuale_compensazione:
                                        Number(e.target.value) || 0,
                                    }
                                  : row
                              )
                            )
                          }
                          className="w-20 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={t.aliquota_iva}
                          onChange={(e) =>
                            setTipi((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? {
                                      ...row,
                                      aliquota_iva: Number(e.target.value) || 0,
                                    }
                                  : row
                              )
                            )
                          }
                          className="w-20 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={tipi.length <= 1}
                          onClick={() =>
                            setTipi((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="rounded p-1 text-red-600 disabled:opacity-40"
                        >
                          <FaTrash size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                INPS coeff. OTD
              </label>
              <ClearableNumberInput
                min={0}
                value={inpsOtd}
                onValueChange={setInpsOtd}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                INPS coeff. OTI
              </label>
              <ClearableNumberInput
                min={0}
                value={inpsOti}
                onValueChange={setInpsOti}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                Sgravio zona %
              </label>
              <ClearableNumberInput
                min={0}
                max={100}
                value={inpsSgravio}
                onValueChange={setInpsSgravio}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
                INPS fisso €/mese
              </label>
              <ClearableNumberInput
                min={0}
                value={inpsFissa}
                onValueChange={setInpsFissa}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={openData}
              onChange={(e) => setOpenData(e.target.checked)}
            />
            Abilita consultazione open data AdE/INPS (predisposizione)
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-[var(--muted)]">
              Motivo modifica (obbligatorio)
            </label>
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Es. Adeguamento % compensazione 2026"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : "Salva profilo fiscale"}
            </button>
            <button
              type="button"
              onClick={() => void refreshFiscalOpenDataPlaceholderAction().then(reload)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Refresh open data (placeholder)
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Versione corrente: v{profile.versione}
          </p>
        </form>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Fonti open data</h3>
        <ul className="space-y-2 text-sm">
          {sources.map((s) => (
            <li
              key={s.sourceKey}
              className="rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <p className="font-medium">{s.sourceLabel}</p>
              <p className="text-xs text-[var(--muted)]">{s.note}</p>
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-700 hover:underline"
              >
                {s.sourceUrl}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Audit modifiche parametri</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuna modifica ancora.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {audit.map((r) => (
              <li
                key={r.id}
                className="rounded border border-[var(--border)] px-3 py-2"
              >
                <span className="text-[var(--muted)]">
                  {new Date(r.changedAt).toLocaleString("it-IT")}
                  {r.versioneNext != null ? ` · v${r.versioneNext}` : ""}
                </span>
                <p>{r.reasonForChange}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
