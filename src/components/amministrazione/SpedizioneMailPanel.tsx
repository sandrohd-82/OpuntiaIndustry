"use client";

import { useEffect, useState } from "react";
import {
  generaCorpoMailSpedizioneAction,
  getPrenotazioneSpedizioneMailAction,
  uploadSpedizioneMailFileAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import {
  trackingMancante,
  type SpedizioneMailAllegato,
  type SpedizioneMailPrenotazione,
} from "@/lib/amministrazione/spedizione-mail";

type Props = {
  entityType: "campionatura" | "ordine";
  entityId: string;
  clienteNome: string;
  numero: string;
  prodotti: string;
  destEmailDefault: string;
  onSaved?: (item: SpedizioneMailPrenotazione) => void;
  onNeedEntity?: (modo: "prenota" | "compila") => void;
  onDraftChange?: (draft: {
    trackingUrl: string;
    letteraViaPath: string;
    letteraViaName: string;
    allegati: SpedizioneMailAllegato[];
    allegaTracking: boolean;
    allegaLettera: boolean;
    allegaFile: boolean;
    destinatarioEmail: string;
  }) => void;
};

export function SpedizioneMailPanel({
  entityType,
  entityId,
  clienteNome,
  numero,
  prodotti,
  destEmailDefault,
  onSaved,
  onNeedEntity,
  onDraftChange,
}: Props) {
  const [trackingUrl, setTrackingUrl] = useState("");
  const [letteraPath, setLetteraPath] = useState("");
  const [letteraName, setLetteraName] = useState("");
  const [allegati, setAllegati] = useState<SpedizioneMailAllegato[]>([]);
  const [allegaTracking, setAllegaTracking] = useState(true);
  const [allegaLettera, setAllegaLettera] = useState(false);
  const [allegaFile, setAllegaFile] = useState(false);
  const [destEmail, setDestEmail] = useState(destEmailDefault);
  const [item, setItem] = useState<SpedizioneMailPrenotazione | null>(null);
  const [compose, setCompose] = useState<{
    prenotazione: SpedizioneMailPrenotazione;
    subject: string;
    bodyText: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    void getPrenotazioneSpedizioneMailAction({ entityType, entityId }).then(
      (res) => {
        if (!res.success || !res.item) return;
        applyItem(res.item);
      }
    );
  }, [entityType, entityId]);

  useEffect(() => {
    if (destEmailDefault && !destEmail) setDestEmail(destEmailDefault);
  }, [destEmailDefault, destEmail]);

  useEffect(() => {
    onDraftChange?.({
      trackingUrl,
      letteraViaPath: letteraPath,
      letteraViaName: letteraName,
      allegati,
      allegaTracking,
      allegaLettera,
      allegaFile,
      destinatarioEmail: destEmail,
    });
  }, [
    trackingUrl,
    letteraPath,
    letteraName,
    allegati,
    allegaTracking,
    allegaLettera,
    allegaFile,
    destEmail,
  ]);

  function applyItem(next: SpedizioneMailPrenotazione) {
    setItem(next);
    setTrackingUrl(next.trackingUrl);
    setLetteraPath(next.letteraViaPath);
    setLetteraName(next.letteraViaName);
    setAllegati(next.allegati);
    setAllegaTracking(next.allegaTracking);
    setAllegaLettera(next.allegaLettera);
    setAllegaFile(next.allegaFile);
    setDestEmail(next.destinatarioEmail || destEmailDefault);
  }

  const mancaTracking = trackingMancante(allegaTracking, trackingUrl);

  async function upload(kind: "lettera" | "file", file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadSpedizioneMailFileAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (kind === "lettera") {
        setLetteraPath(res.path);
        setLetteraName(res.name);
        setAllegaLettera(true);
      } else {
        setAllegati((prev) => [
          ...prev,
          { path: res.path, name: res.name, contentType: res.contentType },
        ]);
        setAllegaFile(true);
      }
    } finally {
      setUploading(false);
    }
  }

  async function salva(modo: "prenota" | "compila") {
    if (!entityId) {
      if (onNeedEntity) {
        onNeedEntity(modo);
        return;
      }
      setError("Salva prima il documento, poi prenota o compila la mail.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const testo = await generaCorpoMailSpedizioneAction({
        cliente: clienteNome,
        numero,
        prodotti,
        trackingUrl,
        haLettera: allegaLettera && Boolean(letteraPath),
      });
      if (!testo.success) {
        setError(testo.error);
        return;
      }
      const res = await upsertPrenotazioneSpedizioneMailAction({
        entityType,
        entityId,
        trackingUrl,
        letteraViaPath: letteraPath,
        letteraViaName: letteraName,
        allegati,
        allegaTracking,
        allegaLettera,
        allegaFile,
        destinatarioEmail: destEmail,
        oggetto: testo.subject,
        corpo: testo.bodyText,
        modo,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      applyItem(res.item);
      onSaved?.(res.item);
      if (res.apriBozza) {
        setCompose({
          prenotazione: res.item,
          subject: testo.subject,
          bodyText: testo.bodyText,
        });
      } else {
        setInfo(
          "Mail prenotata. Quando inserirai il tracking si aprirà la bozza già compilata."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function completaTrackingEApri() {
    if (!trackingUrl.trim()) {
      setError("Inserisci il tracking per aprire la bozza.");
      return;
    }
    await salva("compila");
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] px-3 py-3">
      <p className="text-sm font-medium">Spedizione e mail al cliente</p>
      <p className="text-xs text-[var(--muted)]">
        Tracking e lettera di via. Poi Compila mail oppure Prenota mail se il
        tracking manca ancora.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tracking (URL)</span>
        <input
          type="url"
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="https://"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Lettera di via</span>
        <input
          type="file"
          onChange={(e) => void upload("lettera", e.target.files?.[0])}
          className="w-full text-sm"
        />
        {letteraName ? (
          <span className="mt-1 block text-xs text-emerald-800">
            Caricata: {letteraName}
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Altri file</span>
        <input
          type="file"
          onChange={(e) => void upload("file", e.target.files?.[0])}
          className="w-full text-sm"
        />
        {allegati.length ? (
          <span className="mt-1 block text-xs text-slate-600">
            {allegati.map((a) => a.name).join(" · ")}
          </span>
        ) : null}
      </label>

      <div className="space-y-1.5 text-sm">
        <p className="font-medium">Cosa vuoi allegare</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allegaTracking}
            onChange={(e) => setAllegaTracking(e.target.checked)}
          />
          Tracking
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allegaLettera}
            onChange={(e) => setAllegaLettera(e.target.checked)}
          />
          Documento di via
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allegaFile}
            onChange={(e) => setAllegaFile(e.target.checked)}
          />
          File in genere
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email azienda</span>
        <input
          type="email"
          value={destEmail}
          onChange={(e) => setDestEmail(e.target.value)}
          placeholder="commerciale@cliente.it"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      {item?.stato === "prenotata" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Mail prenotata: manca il tracking. Inseriscilo e si apre la bozza.
        </p>
      ) : null}
      {item?.stato === "inviata" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Mail già inviata
          {item.inviataAt
            ? ` · ${new Date(item.inviataAt).toLocaleString("it-IT")}`
            : ""}
          .
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}

      {item?.stato !== "inviata" ? (
        <div className="flex flex-wrap gap-2">
          {mancaTracking ? (
            <button
              type="button"
              disabled={busy || uploading || !entityId}
              onClick={() => void salva("prenota")}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Salvataggio…" : "Prenota mail"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || uploading || !entityId}
              onClick={() => void salva("compila")}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {busy ? "Compilazione…" : "Compila mail"}
            </button>
          )}
          {item?.stato === "prenotata" && trackingUrl.trim() ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void completaTrackingEApri()}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              Apri bozza con tracking
            </button>
          ) : null}
        </div>
      ) : null}

      {compose ? (
        <SpedizioneMailComposeModal
          prenotazione={compose.prenotazione}
          subject={compose.subject}
          bodyText={compose.bodyText}
          to={destEmail}
          onClose={() => setCompose(null)}
          onInviata={() => {
            setCompose(null);
            setItem((prev) =>
              prev ? { ...prev, stato: "inviata" } : prev
            );
            setInfo("Mail inviata.");
          }}
        />
      ) : null}
    </div>
  );
}
