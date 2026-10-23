"use client";

import { useEffect, useId, useState } from "react";
import {
  elencoRaggruppoScalettaAction,
  raggruppaEProcessaAction,
  type CandidatoRaggruppamento,
  type RiferimentoDocumento,
} from "@/app/actions/gruppi-scaletta";

function chiave(ref: RiferimentoDocumento) {
  return `${ref.entityType}:${ref.entityId}`;
}

type Props = {
  onClose: () => void;
  onDone: (avviso: string) => void;
};

export function RaggruppaDocumentiModal({ onClose, onDone }: Props) {
  const titleId = useId();
  const [coda, setCoda] = useState<CandidatoRaggruppamento[]>([]);
  const [giaProcessati, setGiaProcessati] = useState<CandidatoRaggruppamento[]>(
    []
  );
  const [scelti, setScelti] = useState<string[]>([]);
  const [giaId, setGiaId] = useState("");
  const [unicoPacco, setUnicoPacco] = useState(true);
  const [unicaMail, setUnicaMail] = useState(true);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [errore, setErrore] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void elencoRaggruppoScalettaAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setCoda(res.coda);
      setGiaProcessati(res.giaProcessati);
    });
  }, []);

  const vendita = coda.some(
    (item) =>
      scelti.includes(chiave(item)) &&
      item.entityType === "ordine" &&
      item.tipoOrdine === "vendita"
  );

  async function conferma() {
    setErrore("");
    const documenti = scelti
      .map((key) => coda.find((item) => chiave(item) === key))
      .filter((item): item is CandidatoRaggruppamento => Boolean(item))
      .map((item) => ({
        entityType: item.entityType,
        entityId: item.entityId,
      }));
    const gia = giaProcessati.find((item) => chiave(item) === giaId);
    if (documenti.length + (gia ? 1 : 0) < 2) {
      setErrore(
        "Seleziona almeno due documenti, oppure uno e un ordine già in scaletta."
      );
      return;
    }
    if (unicaMail && !trackingUrl.trim()) {
      setErrore("Con la mail unica inserisci il link di tracking.");
      return;
    }
    setSaving(true);
    try {
      const res = await raggruppaEProcessaAction({
        documenti,
        giaProcessato: gia
          ? { entityType: gia.entityType, entityId: gia.entityId }
          : null,
        unicoPacco,
        unicaMail,
        trackingUrl,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      onDone(res.avviso);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Raggruppa
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Seleziona i documenti ancora da processare. Alla conferma entrano in
          scaletta insieme. Puoi unirli a uno già processato.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">Da processare</legend>
          {coda.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Nessun documento libero in coda.
            </p>
          ) : (
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {coda.map((item) => {
                const key = chiave(item);
                return (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={scelti.includes(key)}
                      onChange={(e) =>
                        setScelti((prev) =>
                          e.target.checked
                            ? [...prev, key]
                            : prev.filter((id) => id !== key)
                        )
                      }
                    />
                    <span>
                      {item.numero} · {item.destinatario || item.cliente}
                      {item.prodotto ? ` · ${item.prodotto}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Associa a un documento già in scaletta
          </span>
          <select
            value={giaId}
            onChange={(e) => setGiaId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Nessuno</option>
            {giaProcessati.map((item) => (
              <option key={chiave(item)} value={chiave(item)}>
                {item.numero} · {item.destinatario || item.cliente}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="font-medium">Unico pacco</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="unico-pacco"
              checked={unicoPacco}
              onChange={() => setUnicoPacco(true)}
            />
            Sì, tutti nello stesso pacco
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="unico-pacco"
              checked={!unicoPacco}
              onChange={() => setUnicoPacco(false)}
            />
            No, un pacco per documento
          </label>
        </fieldset>

        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="font-medium">Unica mail</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="unica-mail"
              checked={unicaMail}
              onChange={() => setUnicaMail(true)}
            />
            Sì, una sola mail e un solo tracking
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="unica-mail"
              checked={!unicaMail}
              onChange={() => setUnicaMail(false)}
            />
            No, ogni documento tiene la propria mail
          </label>
          {unicaMail ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium">
                Link di tracking
              </span>
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </fieldset>

        {vendita ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Gli ordini di vendita selezionati entrano in produzione: numero
            fiscale, SDI e mail al cliente.
          </p>
        ) : null}
        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errore}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void conferma()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {saving ? "Elaborazione…" : "Processa insieme"}
          </button>
        </div>
      </div>
    </div>
  );
}
