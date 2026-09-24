"use client";

import { useId, useState } from "react";
import { FaChevronDown, FaPlus, FaTrash } from "react-icons/fa6";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import {
  ANAGRAFICA_SEDE_LABEL,
  ANAGRAFICA_SEDE_TIPI,
  emptyAnagraficaSede,
  ensurePrimaryLegale,
  isSedeAddressEmpty,
  isSedeAddressFilled,
  sedeFromAddress,
  sediFromLegacy,
  sortSediLegalePrima,
  type AnagraficaSede,
  type AnagraficaSedeInput,
  type AnagraficaSedeTipo,
} from "@/lib/amministrazione/anagrafica-extra";
import type { SedeCliente } from "@/lib/amministrazione/clienti";
import {
  ANAGRAFICA_SEDE_TONE,
  AnagraficaSchedaSection,
} from "@/components/amministrazione/AnagraficaSchedaSection";

export type AnagraficaSedeDraft = AnagraficaSede & { open: boolean };

export function draftsFromSedi(sedi: AnagraficaSede[]): AnagraficaSedeDraft[] {
  return ensurePrimaryLegale(sedi).map((s) => ({
    ...s,
    open: s.tipo === "legale" || !isSedeAddressEmpty(s),
  }));
}

export function draftsFromLegacy(
  input: {
    sedeAmministrativa?: SedeCliente | null;
    sedeMagazzino?: SedeCliente | null;
  },
  opts?: { openAmm?: boolean; openPrimary?: boolean }
): AnagraficaSedeDraft[] {
  const openPrimary = opts?.openPrimary ?? opts?.openAmm ?? true;
  const sedi = sediFromLegacy(input);
  if (sedi.length === 0) {
    return [
      {
        ...emptyAnagraficaSede("legale", 0),
        open: openPrimary,
      },
    ];
  }
  return sedi.map((s, i) => ({
    ...s,
    open:
      s.tipo === "legale"
        ? openPrimary || !isSedeAddressEmpty(s)
        : !isSedeAddressEmpty(s) || i === 0,
  }));
}

export function validateSediDrafts(
  sedi: AnagraficaSedeDraft[],
  opts: { requireLegale?: boolean; requireAmministrativa?: boolean }
): string | null {
  const requireLegale = Boolean(opts.requireLegale ?? opts.requireAmministrativa);
  const legaleFilled = sedi.some(
    (s) => s.tipo === "legale" && isSedeAddressFilled(s)
  );
  if (requireLegale && !legaleFilled) {
    return "Completa la sede legale prima di continuare.";
  }
  const ricezioneCamp = sedi.find((s) => s.ricezioneCampionature);
  if (ricezioneCamp && !isSedeAddressFilled(ricezioneCamp)) {
    return "Completa l’indirizzo standard di ricezione campionature.";
  }
  const ricezioneAcq = sedi.find((s) => s.ricezioneAcquisti);
  if (ricezioneAcq && !isSedeAddressFilled(ricezioneAcq)) {
    return "Completa l’indirizzo standard di ricezione acquisti.";
  }
  for (const s of sedi) {
    if (!isSedeAddressEmpty(s) && !isSedeAddressFilled(s)) {
      return `Completa tutti i campi di ${ANAGRAFICA_SEDE_LABEL[s.tipo]}, oppure rimuovila.`;
    }
  }
  return null;
}

export function sediToInput(sedi: AnagraficaSedeDraft[]): AnagraficaSedeInput[] {
  return sortSediLegalePrima(sedi.filter((s) => !isSedeAddressEmpty(s))).map(
    (s, i) => ({
      id: s.id,
      tipo: s.tipo,
      nazione: s.nazione,
      provincia: s.provincia,
      citta: s.citta,
      cap: s.cap,
      indirizzo: s.indirizzo,
      sortOrder: i,
      ricezioneCampionature: Boolean(s.ricezioneCampionature),
      ricezioneAcquisti: Boolean(s.ricezioneAcquisti),
    })
  );
}

export function applyLegacySedeToDrafts(
  prev: AnagraficaSedeDraft[],
  tipo: AnagraficaSedeTipo,
  sede: SedeCliente
): AnagraficaSedeDraft[] {
  const next = [...prev];
  const idx = next.findIndex((s) => s.tipo === tipo);
  const mapped = {
    ...sedeFromAddress(tipo, sede, idx >= 0 ? next[idx].sortOrder : next.length),
    open: true,
  };
  if (idx >= 0) {
    next[idx] = {
      ...mapped,
      id: next[idx].id,
      ricezioneCampionature: next[idx].ricezioneCampionature,
      ricezioneAcquisti: next[idx].ricezioneAcquisti,
    };
  } else {
    next.push(mapped);
  }
  return next;
}

export function AnagraficaSediEditor({
  value,
  onChange,
  requireLegale = false,
  requireAmministrativa = false,
}: {
  value: AnagraficaSedeDraft[];
  onChange: (next: AnagraficaSedeDraft[]) => void;
  requireLegale?: boolean;
  /** @deprecated usa requireLegale: l’indirizzo primario è la sede legale. */
  requireAmministrativa?: boolean;
}) {
  const mustHaveLegale = requireLegale || requireAmministrativa;
  const radioName = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstLegale = value.find((s) => s.tipo === "legale");

  function add(tipo: AnagraficaSedeTipo) {
    const next = [
      ...value,
      { ...emptyAnagraficaSede(tipo, value.length), open: true },
    ];
    onChange(tipo === "legale" ? sortSediLegalePrima(next) : next);
    setMenuOpen(false);
  }

  function remove(id: string) {
    const target = value.find((s) => s.id === id);
    if (
      target?.tipo === "legale" &&
      value.filter((s) => s.tipo === "legale").length <= 1
    ) {
      onChange(
        value.map((s) =>
          s.id === id
            ? { ...emptyAnagraficaSede("legale", s.sortOrder), id: s.id, open: true }
            : s
        )
      );
      return;
    }
    onChange(value.filter((s) => s.id !== id));
  }

  function patch(id: string, nextSede: SedeCliente) {
    onChange(
      value.map((s) => (s.id === id ? { ...s, ...nextSede } : s))
    );
  }

  function setRicezione(
    id: string,
    kind: "ricezioneCampionature" | "ricezioneAcquisti"
  ) {
    onChange(
      value.map((s) => ({
        ...s,
        [kind]: s.id === id,
        open: s.id === id ? true : s.open,
      }))
    );
  }

  function copyFromLegale(id: string) {
    if (!firstLegale) return;
    onChange(
      value.map((s) =>
        s.id === id
          ? {
              ...s,
              nazione: firstLegale.nazione,
              provincia: firstLegale.provincia,
              citta: firstLegale.citta,
              cap: firstLegale.cap,
              indirizzo: firstLegale.indirizzo,
              open: true,
            }
          : s
      )
    );
  }

  return (
    <AnagraficaSchedaSection tone="sedi" title="Sedi">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white/80"
            aria-expanded={menuOpen}
          >
            <FaPlus size={11} />
            Aggiungi sede
            <FaChevronDown
              size={11}
              className={`text-[var(--muted)] transition-transform ${
                menuOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {menuOpen ? (
            <ul className="absolute right-0 z-20 mt-1 min-w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg">
              {ANAGRAFICA_SEDE_TIPI.map((tipo) => (
                <li key={tipo}>
                  <button
                    type="button"
                    onClick={() => add(tipo)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {tipo === "produttiva"
                      ? "Aggiungi Sede Produzione"
                      : ANAGRAFICA_SEDE_LABEL[tipo]}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        L’indirizzo primario è la Sede Legale. Puoi impostare un indirizzo per
        le campionature (piccoli pacchi) e uno per gli acquisti (quantitativi).
        Possono coincidere.
      </p>

      {value.map((sede, index) => {
        const countSame = value.filter((s) => s.tipo === sede.tipo).length;
        const title =
          countSame > 1
            ? `${ANAGRAFICA_SEDE_LABEL[sede.tipo]} #${
                value.filter((s, i) => s.tipo === sede.tipo && i <= index).length
              }`
            : ANAGRAFICA_SEDE_LABEL[sede.tipo];
        return (
          <div
            key={sede.id}
            className="overflow-hidden rounded-lg border border-sky-200 bg-white"
          >
            <div
              className={`flex items-center gap-2 px-3 py-2 ${ANAGRAFICA_SEDE_TONE[sede.tipo]}`}
            >
              <button
                type="button"
                onClick={() =>
                  onChange(
                    value.map((s) =>
                      s.id === sede.id ? { ...s, open: !s.open } : s
                    )
                  )
                }
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-semibold"
                aria-expanded={sede.open}
              >
                <span className="truncate">{title}</span>
                <FaChevronDown
                  size={11}
                  className={`shrink-0 text-[var(--muted)] transition-transform ${
                    sede.open ? "rotate-180" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => remove(sede.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <FaTrash size={11} />
                Rimuovi
              </button>
            </div>
            <div className="space-y-3 border-t border-sky-100 p-3">
              <label className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`${radioName}-campionature`}
                  checked={Boolean(sede.ricezioneCampionature)}
                  onChange={() => setRicezione(sede.id, "ricezioneCampionature")}
                  className="mt-0.5"
                />
                <span>
                  Rendi questo l&apos;indirizzo standard di ricezione
                  Campionature
                  <span className="mt-0.5 block text-xs text-teal-800">
                    Piccoli pacchi
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`${radioName}-acquisti`}
                  checked={Boolean(sede.ricezioneAcquisti)}
                  onChange={() => setRicezione(sede.id, "ricezioneAcquisti")}
                  className="mt-0.5"
                />
                <span>
                  Rendi questo l&apos;indirizzo standard di ricezione Acquisti
                  <span className="mt-0.5 block text-xs text-orange-800">
                    Quantitativi più importanti
                  </span>
                </span>
              </label>
              {sede.open ? (
                <>
                  {sede.tipo !== "legale" && firstLegale ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          !isSedeAddressEmpty(firstLegale) &&
                          firstLegale.nazione === sede.nazione &&
                          firstLegale.provincia === sede.provincia &&
                          firstLegale.citta === sede.citta &&
                          firstLegale.cap === sede.cap &&
                          firstLegale.indirizzo === sede.indirizzo
                        }
                        onChange={(e) => {
                          if (e.target.checked) copyFromLegale(sede.id);
                        }}
                        className="rounded border-[var(--border)]"
                      />
                      Uguale alla sede legale
                    </label>
                  ) : null}
                  <AddressSedeFields
                    title="Indirizzo"
                    embedded
                    requiredFields={mustHaveLegale && sede.tipo === "legale"}
                    value={sede}
                    onChange={(next) => patch(sede.id, next)}
                  />
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </AnagraficaSchedaSection>
  );
}
