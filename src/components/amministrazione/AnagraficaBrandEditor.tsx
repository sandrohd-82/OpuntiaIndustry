"use client";

import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import { uploadAnagraficaBrandLogoAction } from "@/app/actions/anagrafica-extra";
import { CanaleInputRow } from "@/components/amministrazione/CanaleAttenzioneControls";
import {
  emptyAnagraficaBrand,
  type AnagraficaBrand,
  type AnagraficaBrandInput,
  type AnagraficaOwnerKind,
} from "@/lib/amministrazione/anagrafica-extra";
import {
  displayContattoName,
  type RubricaContatto,
} from "@/lib/rubrica/types";

export type AnagraficaBrandDraft = AnagraficaBrand & {
  logoFile?: File | null;
};

export function brandsToInput(
  brands: AnagraficaBrandDraft[]
): AnagraficaBrandInput[] {
  return brands
    .filter((b) => b.nome.trim())
    .map((b, i) => ({
      id: b.id,
      nome: b.nome.trim(),
      sitoWeb: b.sitoWeb.trim(),
      email: b.email.trim(),
      telefono: b.telefono.trim(),
      referenteNome: b.referenteNome.trim(),
      referenteContattoId: b.referenteContattoId,
      logoPath: b.logoPath,
      sortOrder: i,
    }));
}

export function validateBrandDrafts(
  brands: AnagraficaBrandDraft[]
): string | null {
  for (const [i, b] of brands.entries()) {
    const hasExtra = Boolean(
      b.sitoWeb.trim() ||
        b.email.trim() ||
        b.telefono.trim() ||
        b.referenteNome.trim() ||
        b.logoFile ||
        b.logoPath.trim()
    );
    if (hasExtra && !b.nome.trim()) {
      return `Inserisci il nome del brand #${i + 1}, oppure rimuovilo.`;
    }
  }
  return null;
}

export async function uploadPendingBrandLogos(opts: {
  ownerKind: AnagraficaOwnerKind;
  ownerId: string;
  brands: AnagraficaBrandDraft[];
}): Promise<string | null> {
  for (const b of opts.brands) {
    if (!b.logoFile || !b.nome.trim()) continue;
    const fd = new FormData();
    fd.set("ownerKind", opts.ownerKind);
    fd.set("ownerId", opts.ownerId);
    fd.set("brandId", b.id);
    fd.set("file", b.logoFile);
    const res = await uploadAnagraficaBrandLogoAction(fd);
    if (!res.success) return res.error;
  }
  return null;
}

function BrandLogoField({
  brand,
  onFile,
}: {
  brand: AnagraficaBrandDraft;
  onFile: (file: File | null) => void;
}) {
  const objectUrl = useMemo(() => {
    if (!brand.logoFile) return null;
    return URL.createObjectURL(brand.logoFile);
  }, [brand.logoFile]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const preview = objectUrl ?? brand.logoUrl ?? null;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Logo</span>
      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={`Logo ${brand.nome || "brand"}`}
            className="h-16 w-16 rounded-lg border border-[var(--border)] object-contain bg-white"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[10px] text-[var(--muted)]">
            Nessun logo
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50">
          {preview ? "Cambia logo" : "Carica logo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <p className="text-xs text-[var(--muted)]">JPG, PNG o WebP · max 5 MB</p>
    </div>
  );
}

export function AnagraficaBrandEditor({
  value,
  onChange,
  referenti,
}: {
  value: AnagraficaBrandDraft[];
  onChange: (next: AnagraficaBrandDraft[]) => void;
  referenti: RubricaContatto[];
}) {
  const [pickFor, setPickFor] = useState<string | null>(null);

  function patch(id: string, partial: Partial<AnagraficaBrandDraft>) {
    onChange(value.map((b) => (b.id === id ? { ...b, ...partial } : b)));
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Brand dell’azienda</p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...value,
              emptyAnagraficaBrand(value.length),
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <FaPlus size={11} />
          Aggiungi brand
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Uno o più marchi: logo, nome, sito, mail, telefono e referente.
      </p>

      {value.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nessun brand inserito.</p>
      ) : null}

      {value.map((brand, index) => (
        <div
          key={brand.id}
          className="space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-slate-50/50 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Brand #{index + 1}
              {brand.nome.trim() ? ` · ${brand.nome.trim()}` : ""}
            </p>
            <button
              type="button"
              onClick={() => onChange(value.filter((b) => b.id !== brand.id))}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <FaTrash size={11} />
              Rimuovi
            </button>
          </div>

          <BrandLogoField
            brand={brand}
            onFile={(file) => patch(brand.id, { logoFile: file })}
          />

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              value={brand.nome}
              onChange={(e) => patch(brand.id, { nome: e.target.value })}
              placeholder="Nome del marchio"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Sito web</span>
            <input
              value={brand.sitoWeb}
              onChange={(e) => patch(brand.id, { sitoWeb: e.target.value })}
              placeholder="https://"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <CanaleInputRow
              label="Mail"
              canale="email"
              type="email"
              inputMode="email"
              value={brand.email}
              onChange={(v) => patch(brand.id, { email: v })}
            />
            <CanaleInputRow
              label="Tel"
              canale="telefono"
              inputMode="tel"
              value={brand.telefono}
              onChange={(v) => patch(brand.id, { telefono: v })}
            />
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Referente</span>
            <input
              value={brand.referenteNome}
              onChange={(e) =>
                patch(brand.id, {
                  referenteNome: e.target.value,
                  referenteContattoId: brand.referenteContattoId,
                })
              }
              placeholder="Nome referente del brand"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>
          {referenti.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() =>
                  setPickFor((cur) => (cur === brand.id ? null : brand.id))
                }
                className="text-xs font-medium text-[var(--primary)] hover:underline"
              >
                {pickFor === brand.id
                  ? "Chiudi elenco referenti"
                  : "Scegli da referenti della scheda"}
              </button>
              {pickFor === brand.id ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-white">
                  {referenti.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          patch(brand.id, {
                            referenteNome: displayContattoName(r),
                            referenteContattoId: r.id,
                          });
                          setPickFor(null);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        {displayContattoName(r)}
                        <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                          Consigliato
                        </span>
                        {r.mansione ? ` · ${r.mansione}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
