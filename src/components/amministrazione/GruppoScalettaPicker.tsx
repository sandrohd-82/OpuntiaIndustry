"use client";

import { useEffect, useRef, useState } from "react";
import {
  contestoRaggruppamentoScalettaAction,
  type CandidatoRaggruppamento,
  type RiferimentoDocumento,
} from "@/app/actions/gruppi-scaletta";

export type GruppoScalettaScelta = {
  processo: RiferimentoDocumento[];
  colli: Array<{ etichetta: string; membri: RiferimentoDocumento[] }>;
  spedizioneAttiva: boolean;
  mailGiaInviata: boolean;
  trackingUrl: string;
};

type Collo = {
  id: string;
  etichetta: string;
  keys: string[];
};

function chiave(ref: { entityType: string; entityId: string }) {
  return `${ref.entityType}:${ref.entityId}`;
}

function daChiave(key: string): RiferimentoDocumento | null {
  const [entityType, entityId] = key.split(":");
  if (entityType !== "ordine" && entityType !== "campionatura") return null;
  if (!entityId) return null;
  return { entityType, entityId };
}

type Props = {
  entityType: "ordine" | "campionatura";
  entityId: string;
  numero: string;
  onChange: (scelta: GruppoScalettaScelta) => void;
};

export function GruppoScalettaPicker({
  entityType,
  entityId,
  numero,
  onChange,
}: Props) {
  const [candidati, setCandidati] = useState<CandidatoRaggruppamento[]>([]);
  const [processoEsistente, setProcessoEsistente] = useState("");
  const [spedizioneEsistente, setSpedizioneEsistente] = useState("");
  const [mailGiaInviata, setMailGiaInviata] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [errore, setErrore] = useState("");
  const [processo, setProcesso] = useState<string[]>([]);
  const [spedizione, setSpedizione] = useState<string[]>([]);
  const [colli, setColli] = useState<Collo[]>([
    { id: "scatola-1", etichetta: "Scatola 1", keys: [] },
  ]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancel = false;
    void contestoRaggruppamentoScalettaAction({ entityType, entityId }).then(
      (res) => {
        if (cancel) return;
        if (!res.success) {
          setErrore(res.error);
          return;
        }
        setCandidati(res.contesto.candidati);
        setProcessoEsistente(res.contesto.processo?.numero ?? "");
        setSpedizioneEsistente(res.contesto.spedizione?.numero ?? "");
        setMailGiaInviata(Boolean(res.contesto.spedizione?.mailInviata));
        setTrackingUrl(res.contesto.spedizione?.trackingUrl ?? "");
      }
    );
    return () => {
      cancel = true;
    };
  }, [entityType, entityId]);

  useEffect(() => {
    const principale = { entityType, entityId };
    const membriSpedizione = [chiave(principale), ...spedizione];
    const colliPuliti =
      spedizione.length === 0
        ? []
        : colli.map((collo, index) => ({
            etichetta: collo.etichetta.trim() || `Scatola ${index + 1}`,
            membri: [
              ...(collo.keys.includes(chiave(principale)) ? [] : []),
              ...membriSpedizione.filter((key) => collo.keys.includes(key)),
            ]
              .map(daChiave)
              .filter((ref): ref is RiferimentoDocumento => Boolean(ref)),
          }));
    const primoVuoto = colliPuliti.findIndex((collo) =>
      collo.membri.some((ref) => chiave(ref) === chiave(principale))
    );
    if (spedizione.length > 0 && primoVuoto < 0 && colliPuliti[0]) {
      colliPuliti[0].membri.unshift(principale);
    }
    onChangeRef.current({
      processo: processoEsistente
        ? []
        : processo
            .map(daChiave)
            .filter((ref): ref is RiferimentoDocumento => Boolean(ref)),
      colli: spedizioneEsistente
        ? []
        : colliPuliti.filter((collo) => collo.membri.length > 0),
      spedizioneAttiva: !spedizioneEsistente && spedizione.length > 0,
      mailGiaInviata,
      trackingUrl,
    });
  }, [
    processo,
    spedizione,
    colli,
    processoEsistente,
    spedizioneEsistente,
    mailGiaInviata,
    trackingUrl,
    entityType,
    entityId,
  ]);

  function toggle(lista: string[], key: string, attivo: boolean) {
    return attivo ? [...lista, key] : lista.filter((item) => item !== key);
  }

  function toggleSpedizione(key: string, attivo: boolean) {
    setSpedizione((prev) => toggle(prev, key, attivo));
    setColli((prev) => {
      const senza = prev.map((collo) => ({
        ...collo,
        keys: collo.keys.filter((item) => item !== key),
      }));
      if (!attivo) return senza;
      const principaleKey = chiave({ entityType, entityId });
      return senza.map((collo, index) =>
        index === 0
          ? {
              ...collo,
              keys: [...new Set([principaleKey, ...collo.keys, key])],
            }
          : collo
      );
    });
  }

  function sposta(key: string, colloId: string) {
    setColli((prev) =>
      prev.map((collo) => ({
        ...collo,
        keys:
          collo.id === colloId
            ? [...new Set([...collo.keys, key])]
            : collo.keys.filter((item) => item !== key),
      }))
    );
  }

  const venditaNelProcesso = candidati.some(
    (item) =>
      processo.includes(chiave(item)) &&
      item.entityType === "ordine" &&
      item.tipoOrdine === "vendita"
  );
  const principaleKey = chiave({ entityType, entityId });
  const etichette = new Map(
    candidati.map((item) => [chiave(item), `${item.numero} · ${item.destinatario}`])
  );
  etichette.set(principaleKey, `${numero} · questo documento`);

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] px-3 py-3">
      <p className="text-sm font-medium">Raggruppa</p>
      <p className="text-xs text-[var(--muted)]">
        Il processo e la spedizione sono due scelte distinte. Ogni documento
        tiene il proprio numero.
      </p>
      {errore ? <p className="text-xs text-red-700">{errore}</p> : null}
      {processoEsistente ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          Già nel processo {processoEsistente}.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Unisci nel processo</legend>
          <p className="text-xs text-[var(--muted)]">
            Gli ordini selezionati entrano in scaletta con gli stessi giorni.
            Le campionature restano da processare per il lotto.
          </p>
          {candidati.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              Nessun altro documento da processare.
            </p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {candidati.map((item) => {
                const key = chiave(item);
                return (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={processo.includes(key)}
                      onChange={(e) =>
                        setProcesso((prev) => toggle(prev, key, e.target.checked))
                      }
                    />
                    <span>
                      {item.numero} · {item.destinatario || item.cliente}
                      {item.prodotto ? ` · ${item.prodotto}` : ""}
                      {item.stessoDestinatario ? " · stesso destinatario" : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {venditaNelProcesso ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Gli ordini di vendita selezionati entrano in produzione adesso:
              numero fiscale, SDI e mail al cliente.
            </p>
          ) : null}
        </fieldset>
      )}

      {spedizioneEsistente ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          Già nella spedizione {spedizioneEsistente}.
          {mailGiaInviata
            ? " La mail di tracking è già partita una volta sola."
            : ""}
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Unisci nella spedizione</legend>
          <p className="text-xs text-[var(--muted)]">
            Stesso destinatario e stesso indirizzo sono in evidenza. Puoi usare
            una scatola o più scatole.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {candidati.map((item) => {
              const key = chiave(item);
              return (
                <label key={`sped-${key}`} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={spedizione.includes(key)}
                    onChange={(e) => toggleSpedizione(key, e.target.checked)}
                  />
                  <span>
                    {item.numero} · {item.destinatario || item.cliente}
                    {item.stessoDestinatario ? " · stesso destinatario" : ""}
                  </span>
                </label>
              );
            })}
          </div>
          {spedizione.length > 0 ? (
            <div className="space-y-2">
              {colli.map((collo) => (
                <div
                  key={collo.id}
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <p className="text-sm font-medium">{collo.etichetta}</p>
                  {[principaleKey, ...spedizione].map((key) => (
                    <label
                      key={`${collo.id}-${key}`}
                      className="mt-1 flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{etichette.get(key) ?? key}</span>
                      <select
                        value={
                          colli.find((item) => item.keys.includes(key))?.id ??
                          colli[0]?.id
                        }
                        onChange={(e) => sposta(key, e.target.value)}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                      >
                        {colli.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.etichetta}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setColli((prev) => [
                    ...prev,
                    {
                      id: `scatola-${prev.length + 1}`,
                      etichetta: `Scatola ${prev.length + 1}`,
                      keys: [],
                    },
                  ])
                }
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Aggiungi scatola
              </button>
            </div>
          ) : null}
        </fieldset>
      )}
    </div>
  );
}
