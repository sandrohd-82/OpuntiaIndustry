"use client";

import { useEffect, useState } from "react";
import {
  generaCorpoMailSpedizioneAction,
  getPrenotazioneSpedizioneMailAction,
  uploadSpedizioneMailFileAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import {
  listSediAttiveAction,
  updateSedePartenzaAction,
} from "@/app/actions/impostazioni-sedi";
import { labelSede, type ImpostazioniSede } from "@/lib/impostazioni/sedi";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import {
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
  onNeedEntity?: (modo: "prenota" | "compila" | "salva") => void;
  onDraftChange?: (draft: {
    trackingUrl: string;
    letteraViaPath: string;
    letteraViaName: string;
    allegati: SpedizioneMailAllegato[];
    allegaTracking: boolean;
    allegaLettera: boolean;
    allegaFile: boolean;
    destinatarioEmail: string;
    sedePartenzaId: string;
    bozzaPronta: boolean;
  }) => void;
  sedePartenzaIdDefault?: string;
  persistDisabled?: boolean;
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
  sedePartenzaIdDefault = "",
  persistDisabled = false,
}: Props) {
  const [trackingUrl, setTrackingUrl] = useState("");
  const [sedePartenzaId, setSedePartenzaId] = useState(sedePartenzaIdDefault);
  const [sedi, setSedi] = useState<ImpostazioniSede[]>([]);
  const [letteraPath, setLetteraPath] = useState("");
  const [letteraName, setLetteraName] = useState("");
  const [allegati, setAllegati] = useState<SpedizioneMailAllegato[]>([]);
  const [vuoleMail, setVuoleMail] = useState(false);
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
  const [bozzaPronta, setBozzaPronta] = useState(!entityId);

  useEffect(() => {
    void listSediAttiveAction().then((res) => {
      if (res.success) setSedi(res.sedi);
    });
  }, []);

  useEffect(() => {
    if (sedePartenzaIdDefault) setSedePartenzaId(sedePartenzaIdDefault);
  }, [sedePartenzaIdDefault]);

  useEffect(() => {
    if (!entityId) {
      setBozzaPronta(true);
      return;
    }
    setBozzaPronta(false);
    void getPrenotazioneSpedizioneMailAction({ entityType, entityId }).then(
      (res) => {
        if (res.success && res.item) applyItem(res.item);
        setBozzaPronta(true);
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
      allegaTracking: vuoleMail,
      allegaLettera: false,
      allegaFile: false,
      destinatarioEmail: destEmail,
      sedePartenzaId,
      bozzaPronta,
    });
  }, [
    trackingUrl,
    letteraPath,
    letteraName,
    allegati,
    vuoleMail,
    destEmail,
    sedePartenzaId,
    bozzaPronta,
  ]);

  function applyItem(next: SpedizioneMailPrenotazione) {
    setItem(next);
    setTrackingUrl(next.trackingUrl);
    setLetteraPath(next.letteraViaPath);
    setLetteraName(next.letteraViaName);
    setAllegati(next.allegati);
    setDestEmail(next.destinatarioEmail || destEmailDefault);
    setVuoleMail(
      next.allegaTracking ||
        next.stato === "inviata" ||
        Boolean(next.oggetto)
    );
  }

  const mancaTracking = vuoleMail && !trackingUrl.trim();

  async function upload(kind: "lettera" | "file", file: File | undefined) {
    if (!file) return;
    if (persistDisabled) {
      setError(
        "Caricamento file disattivato: in questa fase si salva solo in sessione."
      );
      return;
    }
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
      } else {
        setAllegati((prev) => [
          ...prev,
          { path: res.path, name: res.name, contentType: res.contentType },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function salva(modo: "prenota" | "compila" | "salva") {
    if (persistDisabled) {
      onNeedEntity?.(modo);
      setError(null);
      setInfo(
        "Spedizione e mail restano solo in sessione. Niente prenotazione, upload o invio sul server."
      );
      return;
    }
    if (!entityId) {
      if (onNeedEntity) {
        onNeedEntity(modo);
        return;
      }
      setError("Salva prima il documento, poi conferma la spedizione.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      let oggetto = "";
      let corpo = "";
      if (modo !== "salva") {
        const testo = await generaCorpoMailSpedizioneAction({
          cliente: clienteNome,
          numero,
          prodotti,
          trackingUrl,
          haLettera: false,
        });
        if (!testo.success) {
          setError(testo.error);
          return;
        }
        oggetto = testo.subject;
        corpo = testo.bodyText;
      }
      const res = await upsertPrenotazioneSpedizioneMailAction({
        entityType,
        entityId,
        trackingUrl,
        letteraViaPath: letteraPath,
        letteraViaName: letteraName,
        allegati,
        allegaTracking: vuoleMail,
        allegaLettera: false,
        allegaFile: false,
        destinatarioEmail: vuoleMail ? destEmail : destEmail,
        oggetto,
        corpo,
        modo,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      applyItem(res.item);
      if (sedePartenzaId || sedePartenzaIdDefault) {
        await updateSedePartenzaAction({
          entityType,
          entityId,
          sedeId: sedePartenzaId || null,
        });
      }
      onSaved?.(res.item);
      if (res.apriBozza && oggetto) {
        setCompose({
          prenotazione: res.item,
          subject: oggetto,
          bodyText: corpo,
        });
      } else if (modo === "salva") {
        setInfo(
          trackingUrl.trim()
            ? "Tracking salvato. Nessuna mail da inviare."
            : "Salvato. Il sistema resta in attesa del tracking."
        );
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
      <p className="text-sm font-medium">Spedizione</p>
      <p className="text-xs text-[var(--muted)]">
        {persistDisabled
          ? "Bozza spedizione solo in sessione: niente upload, prenotazione mail o invio."
          : "Puoi inserire il tracking se ce l’hai, oppure salvare e lasciare il sistema in attesa. La mail al cliente è facoltativa."}
      </p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tracking (URL)</span>
        <input
          type="url"
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="https:// — se non c’è, si resta in attesa"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Luogo di partenza</span>
        <span className="mb-1 block text-xs text-[var(--muted)]">
          Sede da cui parte o si ritira la merce. Elenco da Impostazioni →
          Sedi.
        </span>
        <select
          value={sedePartenzaId}
          onChange={(e) => {
            const next = e.target.value;
            setSedePartenzaId(next);
            if (entityId && !persistDisabled) {
              void updateSedePartenzaAction({
                entityType,
                entityId,
                sedeId: next || null,
              });
            }
          }}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">
            {sedi.length ? "Seleziona sede…" : "Nessuna sede in catalogo"}
          </option>
          {sedi.map((s) => (
            <option key={s.id} value={s.id}>
              {labelSede(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          Foglio di via (solo Agrinsicilia)
        </span>
        <span className="mb-1 block text-xs text-[var(--muted)]">
          Resta al mittente. Non viene allegato alla mail del cliente.
        </span>
        <input
          type="file"
          onChange={(e) => void upload("lettera", e.target.files?.[0])}
          className="w-full text-sm"
        />
        {letteraName ? (
          <span className="mt-1 block text-xs text-emerald-800">
            Caricato: {letteraName}
          </span>
        ) : null}
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">
          Vuoi che il tracking venga inviato al cliente?
        </legend>
        <p className="text-xs text-[var(--muted)]">
          Se sì, si crea una bozza mail che aspetta il link del tracking. Al
          cliente arriva solo quel link.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="vuole-mail"
            checked={!vuoleMail}
            onChange={() => setVuoleMail(false)}
          />
          No
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="vuole-mail"
            checked={vuoleMail}
            onChange={() => setVuoleMail(true)}
          />
          Sì, crea la bozza in attesa del tracking
        </label>
      </fieldset>

      {vuoleMail ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email del cliente</span>
          <input
            type="email"
            value={destEmail}
            onChange={(e) => setDestEmail(e.target.value)}
            placeholder="commerciale@cliente.it"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      {item?.stato === "prenotata" && !vuoleMail ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          In attesa del tracking.
        </p>
      ) : null}
      {item?.stato === "prenotata" && vuoleMail ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Bozza in attesa del tracking. Quando inserisci il link, si apre la
          mail per il cliente.
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
          {!vuoleMail ? (
            <button
              type="button"
              disabled={busy || uploading || (!entityId && !onNeedEntity)}
              onClick={() => void salva("salva")}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {busy
                ? "Salvataggio…"
                : trackingUrl.trim()
                  ? "Salva tracking"
                  : "Salva e attendi tracking"}
            </button>
          ) : mancaTracking ? (
            <button
              type="button"
              disabled={busy || uploading || (!entityId && !onNeedEntity)}
              onClick={() => void salva("prenota")}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Salvataggio…" : "Crea bozza in attesa del tracking"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || uploading || (!entityId && !onNeedEntity)}
              onClick={() => void salva("compila")}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {busy ? "Compilazione…" : "Compila mail"}
            </button>
          )}
          {vuoleMail && item?.stato === "prenotata" && trackingUrl.trim() ? (
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
