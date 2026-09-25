"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadAnagraficaExtraAction } from "@/app/actions/anagrafica-extra";
import {
  listAziendaSchedeCardAction,
  openSchedaFromTimelineAction,
  type AziendaSchedaCardItem,
} from "@/app/actions/schede-ordini";
import { listEntityReferentiAction } from "@/app/actions/rubrica";
import { SchedaOrdineModal } from "@/components/produzione/SchedaOrdineModal";
import { CanaleReadonlyActions } from "@/components/amministrazione/CanaleAttenzioneControls";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { TrattativaBadge } from "@/components/amministrazione/TrattativaSelectField";
import {
  ANAGRAFICA_SEDE_LABEL,
  ensurePrimaryLegale,
  isSedeAddressEmpty,
  type AnagraficaBrand,
  type AnagraficaSede,
} from "@/lib/amministrazione/anagrafica-extra";
import type { ConsegnaAltraAzienda, SedeCliente } from "@/lib/amministrazione/clienti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import type { ClientePossibileTrattativa } from "@/lib/promemorie-e-note/trattativa";
import { displayContattoName, type RubricaContatto } from "@/lib/rubrica/types";
import { AnagraficaDocumentiPanel } from "@/components/amministrazione/AnagraficaDocumentiPanel";
import {
  ANAGRAFICA_SEDE_TONE,
  AnagraficaSchedaSection,
} from "@/components/amministrazione/AnagraficaSchedaSection";

export type AnagraficaSchedaDetailModel = {
  id: string;
  kind: "cliente" | "cliente_possibile";
  codiceTarga?: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  isPrivato: boolean;
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
  emailGeneriche: string[];
  telefoniGenerici: string[];
  sitiWebGenerici: string[];
  sedeAmministrativa: SedeCliente;
  sedeMagazzino: SedeCliente;
  consegneAltraAzienda: ConsegnaAltraAzienda[];
  prodotti: string[];
  prodottiLabel: string;
  commercialeLabel: string;
  trattativa?: ClientePossibileTrattativa;
  statoLabel?: string;
  referente?: string;
  noteInterne?: string;
  cancellazionePrenotata?: boolean;
};

function SedeBlock({
  title,
  sede,
  ricezioneCampionature = false,
  ricezioneAcquisti = false,
  tipo,
}: {
  title: string;
  sede: SedeCliente;
  ricezioneCampionature?: boolean;
  ricezioneAcquisti?: boolean;
  tipo?: AnagraficaSede["tipo"];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/60 bg-white">
      <p
        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
          tipo ? ANAGRAFICA_SEDE_TONE[tipo] : "bg-slate-100 text-slate-800"
        }`}
      >
        {title}
      </p>
      <div className="space-y-1.5 px-3 py-2">
        {ricezioneCampionature ? (
          <p className="rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-900">
            Ricezione campionature
          </p>
        ) : null}
        {ricezioneAcquisti ? (
          <p className="rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-900">
            Ricezione acquisti
          </p>
        ) : null}
        <p className="text-sm">
          {sede.indirizzo || "—"}
          <br />
          {[sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" ")}
          {sede.nazione ? ` — ${sede.nazione}` : ""}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm">
        {value.trim() || "—"} {extra}
      </p>
    </div>
  );
}

export function AnagraficaSchedaDetail({
  model,
  prodottiByCode,
  canEditDocumenti = false,
  hideDocumenti = false,
}: {
  model: AnagraficaSchedaDetailModel;
  prodottiByCode: Map<string, ProdottoProprio>;
  canEditDocumenti?: boolean;
  hideDocumenti?: boolean;
}) {
  const [referenti, setReferenti] = useState<RubricaContatto[]>([]);
  const [sediExtra, setSediExtra] = useState<AnagraficaSede[]>([]);
  const [brandExtra, setBrandExtra] = useState<AnagraficaBrand[]>([]);
  const [schede, setSchede] = useState<AziendaSchedaCardItem[]>([]);
  const [schedaApertaId, setSchedaApertaId] = useState<string | null>(null);

  useEffect(() => {
    void listEntityReferentiAction({
      tipo: model.kind === "cliente" ? "cliente" : "cliente_possibile",
      entityId: model.id,
    }).then((res) => {
      if (res.success) setReferenti(res.items);
    });
    void loadAnagraficaExtraAction({
      ownerKind: model.kind === "cliente" ? "cliente" : "cliente_possibile",
      ownerId: model.id,
    }).then((res) => {
      if (!res.success) return;
      setSediExtra(res.sedi);
      setBrandExtra(res.brand);
    });
    void listAziendaSchedeCardAction({
      ownerKind: model.kind === "cliente" ? "cliente" : "cliente_possibile",
      ownerId: model.id,
    }).then((res) => {
      if (res.success) setSchede(res.items);
    });
  }, [model.id, model.kind]);

  async function apriScheda(item: AziendaSchedaCardItem) {
    const res = await openSchedaFromTimelineAction({
      schedaId: item.schedaId,
      ordineId: item.ordineId,
      campionaturaId: item.campionaturaId,
    });
    if (res.success) setSchedaApertaId(res.schedaId);
  }

  return (
    <div className="space-y-4">
      {model.cancellazionePrenotata ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Cancellazione prenotata: in attesa di conferma Super Admin.
        </p>
      ) : null}
      <AnagraficaSchedaSection title="Identità" tone="identita">
        <div className="grid gap-3 sm:grid-cols-2">
      {model.codiceTarga ? (
        <Field label="Targa" value={model.codiceTarga} />
      ) : null}
      <Field
        label="Tipo"
        value={model.isPrivato ? "Privato" : "Azienda"}
      />
      {model.statoLabel ? (
        <Field label="Stato" value={model.statoLabel} />
      ) : null}
      {model.trattativa ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Trattativa
          </p>
          <p className="mt-1">
            <TrattativaBadge value={model.trattativa} />
          </p>
        </div>
      ) : null}
      <Field label="Ragione sociale" value={model.ragioneSociale} />
      <Field label="P. IVA" value={model.partitaIva} />
      <Field label="Codice fiscale" value={model.codiceFiscale} />
      <Field label="Commerciale" value={model.commercialeLabel} />
      {model.referente ? (
        <Field label="Referente (testo)" value={model.referente} />
      ) : null}
        </div>
      </AnagraficaSchedaSection>
      <AnagraficaSchedaSection title="Contatti" tone="contatti">
        <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Mail
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{model.email || "—"}</span>
          {model.email ? (
            <CanaleReadonlyActions email={model.email} />
          ) : null}
        </p>
        {model.emailGeneriche.length > 0 ? (
          <ul className="mt-1 space-y-1 text-sm">
            {model.emailGeneriche.map((e) => (
              <li key={e} className="flex flex-wrap items-center gap-2">
                {e}
                <CanaleReadonlyActions email={e} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Telefono
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{model.telefono || "—"}</span>
          {model.telefono ? (
            <CanaleReadonlyActions telefono={model.telefono} />
          ) : null}
        </p>
        {model.telefoniGenerici.length > 0 ? (
          <ul className="mt-1 space-y-1 text-sm">
            {model.telefoniGenerici.map((t) => (
              <li key={t} className="flex flex-wrap items-center gap-2">
                {t}
                <CanaleReadonlyActions telefono={t} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          PEC
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{model.pec || "—"}</span>
          {model.pec ? <CanaleReadonlyActions email={model.pec} /> : null}
        </p>
      </div>
      <Field label="SDI" value={model.sdiCode} />
      <Field label="Sito web" value={model.sitoWeb} />
      {model.sitiWebGenerici.length > 0 ? (
        <Field label="Altri siti" value={model.sitiWebGenerici.join(", ")} />
      ) : null}
        </div>
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection title="Schede ordine / campionature" tone="schede">
        {schede.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuna scheda</p>
        ) : (
          <ul className="space-y-2">
            {schede.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => void apriScheda(item)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-lime-300 bg-white px-3 py-2 text-left text-sm hover:bg-lime-100"
                >
                  <span>
                    <span className="font-semibold">
                      {item.kind === "campionatura" ? "Campionatura" : "Ordine"}
                    </span>
                    {` ${item.numero}`}
                  </span>
                  <span className="text-xs font-medium text-lime-900">
                    Stato: {item.statoLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection title="Sedi" tone="sedi">
        <div className="grid gap-3 sm:grid-cols-2">
      {sediExtra.length > 0 ? (
        ensurePrimaryLegale(sediExtra).map((sede) => (
          <SedeBlock
            key={sede.id}
            title={ANAGRAFICA_SEDE_LABEL[sede.tipo]}
            sede={sede}
            tipo={sede.tipo}
            ricezioneCampionature={sede.ricezioneCampionature}
            ricezioneAcquisti={sede.ricezioneAcquisti}
          />
        ))
      ) : (
        <>
          <SedeBlock
            title="Sede Legale"
            sede={model.sedeAmministrativa}
            tipo="legale"
          />
          {!isSedeAddressEmpty(model.sedeMagazzino) ? (
            <SedeBlock
              title="Sede Magazzino"
              sede={model.sedeMagazzino}
              tipo="magazzino"
            />
          ) : null}
        </>
      )}
        </div>
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection title="Brand" tone="brand">
        {brandExtra.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Nessun brand</p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {brandExtra.map((b) => (
              <li
                key={b.id}
                className="flex gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5"
              >
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.logoUrl}
                    alt={`Logo ${b.nome}`}
                    className="h-14 w-14 shrink-0 rounded-md border border-[var(--border)] object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-[10px] text-[var(--muted)]">
                    Logo
                  </div>
                )}
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{b.nome}</p>
                  {b.sitoWeb ? (
                    <p className="text-[var(--muted)]">{b.sitoWeb}</p>
                  ) : null}
                  {b.email ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      {b.email}
                      <CanaleReadonlyActions email={b.email} />
                    </p>
                  ) : null}
                  {b.telefono ? (
                    <p className="flex flex-wrap items-center gap-2">
                      {b.telefono}
                      <CanaleReadonlyActions telefono={b.telefono} />
                    </p>
                  ) : null}
                  {b.referenteNome ? (
                    <p className="mt-1 text-[var(--muted)]">
                      Referente: {b.referenteNome}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection
        title="Consegne presso altre aziende"
        tone="consegne"
      >
        {model.consegneAltraAzienda.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuna</p>
        ) : (
          <ul className="space-y-3">
            {model.consegneAltraAzienda.map((consegna, index) => (
              <li
                key={`${consegna.ragioneSociale}-${index}`}
                className="rounded-lg border border-amber-100 bg-white px-3 py-2.5"
              >
                <p className="text-sm font-semibold">{consegna.ragioneSociale}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {consegna.indirizzo || "—"}
                  <br />
                  {[consegna.cap, consegna.citta, consegna.provincia]
                    .filter(Boolean)
                    .join(" ")}
                  {consegna.nazione ? ` — ${consegna.nazione}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection title="Referenti" tone="referenti">
        {referenti.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessun referente</p>
        ) : (
          <ul className="space-y-2">
            {referenti.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm"
              >
                <span>
                  {displayContattoName(r)}
                  {r.mansione ? ` · ${r.mansione}` : ""}
                  {r.telefono ? ` · ${r.telefono}` : ""}
                  {r.email ? ` · ${r.email}` : ""}
                </span>
                <CanaleReadonlyActions email={r.email} telefono={r.telefono} />
              </li>
            ))}
          </ul>
        )}
      </AnagraficaSchedaSection>

      <AnagraficaSchedaSection title={model.prodottiLabel} tone="prodotti">
        {model.prodotti.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuno</p>
        ) : (
          <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {model.prodotti.map((code) => (
              <li key={code}>
                <ProdottoProprioProductTag
                  code={code}
                  prodotto={prodottiByCode.get(code) ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </AnagraficaSchedaSection>

      {!hideDocumenti && model.kind === "cliente" ? (
        <AnagraficaDocumentiPanel
          clienteId={model.id}
          canEdit={canEditDocumenti}
        />
      ) : null}

      {model.noteInterne ? (
        <AnagraficaSchedaSection title="Note interne" tone="note">
          <p className="whitespace-pre-wrap text-sm">{model.noteInterne}</p>
        </AnagraficaSchedaSection>
      ) : null}

      {schedaApertaId ? (
        <SchedaOrdineModal
          schedaId={schedaApertaId}
          overlayClassName="z-[120]"
          onClose={() => setSchedaApertaId(null)}
        />
      ) : null}
    </div>
  );
}
