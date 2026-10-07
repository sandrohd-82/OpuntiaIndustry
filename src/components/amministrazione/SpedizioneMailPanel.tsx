"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  generaCorpoMailSpedizioneAction,
  getPrenotazioneSpedizioneMailAction,
  casellaMittenteCommercialeAction,
  listCaselleSpedizioneMailAction,
  uploadSpedizioneMailFileAction,
  inviaMailSpedizioneAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import {
  listSediAttiveAction,
  updateSedePartenzaAction,
} from "@/app/actions/impostazioni-sedi";
import { labelSede, type ImpostazioniSede } from "@/lib/impostazioni/sedi";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import {
  SpedizioneDestinatarioMailField,
  type SpedizioneAnagraficaMail,
} from "@/components/amministrazione/SpedizioneDestinatarioMailField";
import {
  type SpedizioneMailAllegato,
  type SpedizioneMailPrenotazione,
} from "@/lib/amministrazione/spedizione-mail";
import {
  AGRINSICILIA_LETTERHEAD,
  AGRINSICILIA_MAIL_FIRMA,
} from "@/lib/amministrazione/preventivo-letterhead";

export type SpedizioneMailBozza = {
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
  mailAccountId: string;
  mailOggetto: string;
  mailCorpo: string;
  prenotazioneId: string;
  mailGiaInviata: boolean;
};

type Props = {
  entityType: "campionatura" | "ordine";
  entityId: string;
  clienteNome: string;
  numero: string;
  prodotti: string;
  destEmailDefault: string;
  anagrafica?: SpedizioneAnagraficaMail | null;
  emailPec?: string;
  emailGeneriche?: string[];
  onSaved?: (item: SpedizioneMailPrenotazione) => void;
  onNeedEntity?: (modo: "prenota" | "compila" | "salva") => void;
  /** Invio campionatura: niente «Salva e attendi tracking». La bozza è sul documento. */
  nascondiAttesaTracking?: boolean;
  onDraftChange?: (draft: SpedizioneMailBozza) => void;
  sedePartenzaIdDefault?: string;
  persistDisabled?: boolean;
  /** La scelta e il testo mail restano quelli salvati in fase di ordine. */
  sceltaOrdineFissa?: boolean;
  /**
   * Ordine: la scelta è un'impostazione del documento.
   * Il salvataggio è il bottone del wizard, non un'azione a parte.
   */
  impostazioneDocumento?: boolean;
};

export function SpedizioneMailPanel({
  entityType,
  entityId,
  clienteNome,
  numero,
  prodotti,
  destEmailDefault,
  anagrafica = null,
  emailPec = "",
  emailGeneriche = [],
  onSaved,
  onNeedEntity,
  nascondiAttesaTracking = false,
  onDraftChange,
  sedePartenzaIdDefault = "",
  persistDisabled = false,
  sceltaOrdineFissa = false,
  impostazioneDocumento = false,
}: Props) {
  const [trackingUrl, setTrackingUrl] = useState("");
  const [sedePartenzaId, setSedePartenzaId] = useState(sedePartenzaIdDefault);
  const [sedi, setSedi] = useState<ImpostazioniSede[]>([]);
  const [letteraPath, setLetteraPath] = useState("");
  const [letteraName, setLetteraName] = useState("");
  const [allegati, setAllegati] = useState<SpedizioneMailAllegato[]>([]);
  const [vuoleMail, setVuoleMail] = useState(false);
  const [destEmail, setDestEmail] = useState(destEmailDefault);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [mailAccountId, setMailAccountId] = useState("");
  const [mailOggetto, setMailOggetto] = useState("");
  const [mailCorpo, setMailCorpo] = useState("");
  const oggettoToccato = useRef(false);
  const corpoToccato = useRef(false);
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
  const [confermaModifica, setConfermaModifica] = useState(false);
  const [confermaInvio, setConfermaInvio] = useState(false);
  const letteraInputRef = useRef<HTMLInputElement>(null);
  const mailRadioName = useId();

  useEffect(() => {
    void listSediAttiveAction().then((res) => {
      if (res.success) setSedi(res.sedi);
    });
    void listCaselleSpedizioneMailAction().then((res) => {
      if (!res.success) return;
      setAccounts(res.accounts);
    });
  }, []);

  useEffect(() => {
    if (entityId) return;
    void casellaMittenteCommercialeAction({ entityType, entityId: "" }).then(
      (res) => {
        if (!res.success || !res.accountId) return;
        setMailAccountId((prev) => prev || res.accountId || "");
      }
    );
  }, [entityType, entityId]);

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
    if (sceltaOrdineFissa) return;
    if (!vuoleMail) return;
    if (oggettoToccato.current && corpoToccato.current) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      void generaCorpoMailSpedizioneAction({
        cliente: clienteNome,
        numero,
        prodotti,
        trackingUrl,
        haLettera: false,
      }).then((res) => {
        if (cancel || !res.success) return;
        if (!oggettoToccato.current) setMailOggetto(res.subject);
        if (!corpoToccato.current) setMailCorpo(res.bodyText);
      });
    }, 400);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [sceltaOrdineFissa, vuoleMail, clienteNome, numero, prodotti, trackingUrl]);

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
      mailAccountId,
      mailOggetto,
      mailCorpo,
      prenotazioneId: item?.id ?? "",
      mailGiaInviata: item?.stato === "inviata",
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
    mailAccountId,
    mailOggetto,
    mailCorpo,
    item?.id,
    item?.stato,
  ]);

  function applyItem(next: SpedizioneMailPrenotazione) {
    setItem(next);
    setTrackingUrl(next.trackingUrl);
    setLetteraPath(next.letteraViaPath);
    setLetteraName(next.letteraViaName);
    setAllegati(next.allegati);
    setDestEmail(next.destinatarioEmail || destEmailDefault);
    if (next.oggetto) {
      oggettoToccato.current = true;
      setMailOggetto(next.oggetto);
    }
    if (next.corpo) {
      corpoToccato.current = true;
      setMailCorpo(next.corpo);
    }
    if (next.accountId) setMailAccountId(next.accountId);
    setVuoleMail(
      sceltaOrdineFissa
        ? next.allegaTracking
        : next.allegaTracking ||
            next.stato === "inviata" ||
            Boolean(next.oggetto)
    );
  }

  const mancaTracking = vuoleMail && !trackingUrl.trim();
  const casella = accounts.find((a) => a.id === mailAccountId);
  const casellaTesto = casella ? `${casella.label} · ${casella.email}` : "—";

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
      let oggetto = mailOggetto.trim();
      let corpo = mailCorpo.trim();
      if (!sceltaOrdineFissa && modo !== "salva" && (!oggetto || !corpo)) {
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
        setMailOggetto(oggetto);
        setMailCorpo(corpo);
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
        destinatarioEmail: destEmail,
        oggetto,
        corpo,
        accountId: mailAccountId || null,
        modo,
        soloTracking: sceltaOrdineFissa,
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
            ? (vuoleMail
                ? "Tracking salvato. La mail non è partita: serve la conferma dell’operatore."
                : "Tracking salvato. Nessuna mail da inviare.")
            : "Salvato. La mail resta in attesa del tracking."
        );
      } else {
        setInfo(
          "Mail salvata. Non parte: l’operatore inserisce il tracking e conferma l’invio."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function apriModificaMail() {
    if (!item) return;
    setConfermaModifica(false);
    setCompose({
      prenotazione: { ...item, trackingUrl },
      subject: mailOggetto,
      bodyText: mailCorpo,
    });
  }

  async function completaTrackingEApri() {
    if (!trackingUrl.trim()) {
      setError("Inserisci il tracking per aprire la bozza.");
      return;
    }
    await salva("compila");
  }

  async function confermaInvioTracking() {
    if (!trackingUrl.trim()) {
      setError("Inserisci il tracking prima di confermare l’invio.");
      return;
    }
    if (!entityId) {
      setError("Salva prima il documento.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const salvata = await upsertPrenotazioneSpedizioneMailAction({
        entityType,
        entityId,
        trackingUrl,
        letteraViaPath: letteraPath,
        letteraViaName: letteraName,
        allegati,
        allegaTracking: true,
        allegaLettera: false,
        allegaFile: false,
        destinatarioEmail: destEmail,
        oggetto: mailOggetto,
        corpo: mailCorpo,
        accountId: mailAccountId || null,
        modo: "salva",
        soloTracking: true,
      });
      if (!salvata.success) {
        setError(salvata.error);
        return;
      }
      const accountId = salvata.item.accountId || mailAccountId;
      if (!accountId || !salvata.item.destinatarioEmail.includes("@")) {
        setError("Manca la casella o il destinatario della mail salvata.");
        return;
      }
      const inviata = await inviaMailSpedizioneAction({
        prenotazioneId: salvata.item.id,
        accountId,
        to: salvata.item.destinatarioEmail,
        subject: salvata.item.oggetto,
        bodyText: salvata.item.corpo,
      });
      if (!inviata.success) {
        applyItem(salvata.item);
        setConfermaInvio(false);
        setError(inviata.error);
        return;
      }
      applyItem({ ...salvata.item, stato: "inviata" });
      setConfermaInvio(false);
      setInfo(
        "Mail inviata. Nel messaggio c’è il bottone Visualizza tracking."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] px-3 py-3">
      <p className="text-sm font-medium">Spedizione</p>
      <p className="text-xs text-[var(--muted)]">
        {persistDisabled
          ? "Bozza spedizione solo in sessione: niente upload, prenotazione mail o invio."
          : (sceltaOrdineFissa
            ? "Inserisci il tracking quando c’è. Se in fase di ordine è stata chiesta la mail, parte solo dopo la tua conferma. Nessuna mail parte da sola."
            : (impostazioneDocumento
              ? "La scelta si salva con l’ordine, come le altre impostazioni. Se chiedi la mail, la scrivi adesso e resta in attesa del tracking."
              : (nascondiAttesaTracking
                ? "Il tracking e la mail al cliente sono facoltativi. Salva bozza tiene il documento in elenco anche se i campi sono vuoti."
                : "Puoi inserire il tracking se ce l’hai, oppure salvare e lasciare il sistema in attesa. La mail al cliente è facoltativa.")))}
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

      <div className="block text-sm">
        <span className="mb-1 block font-medium">
          Foglio di via (solo Agrinsicilia)
        </span>
        <span className="mb-1 block text-xs text-[var(--muted)]">
          Resta al mittente. Non viene allegato alla mail del cliente.
        </span>
        <input
          ref={letteraInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void upload("lettera", file);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => letteraInputRef.current?.click()}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "Caricamento…" : "Scegli file"}
        </button>
        {letteraName ? (
          <span className="mt-1 block text-xs text-emerald-800">
            Caricato: {letteraName}
          </span>
        ) : null}
      </div>

      {sceltaOrdineFissa ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            Vuoi che il tracking venga inviato al cliente?
          </p>
          {!bozzaPronta ? (
            <p className="text-xs text-[var(--muted)]">Caricamento della scelta…</p>
          ) : item?.allegaTracking ? (
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3">
              <p>Sì. Scelta fatta in fase di ordine.</p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">
                    Casella mittente
                  </dt>
                  <dd>{casellaTesto}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">
                    Destinatario
                  </dt>
                  <dd>{destEmail.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">
                    Oggetto
                  </dt>
                  <dd>{mailOggetto.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">
                    Testo
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {mailCorpo.trim() || "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
              No. In fase di ordine non è stato chiesto l’invio del tracking al
              cliente.
            </p>
          )}
        </div>
      ) : (
      <>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">
          Vuoi che il tracking venga inviato al cliente?
        </legend>
        <p className="text-xs text-[var(--muted)]">
          {impostazioneDocumento
            ? "Se sì, scrivi la mail adesso: viene salvata con l’ordine e non parte. Quando l’operatore inserisce il tracking, nella mail compare il bottone Visualizza tracking e l’invio chiede la sua conferma."
            : "Se sì, si crea una bozza mail che aspetta il link del tracking. Al cliente arriva solo quel link, dopo conferma."}
        </p>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={mailRadioName}
            checked={!vuoleMail}
            onChange={() => setVuoleMail(false)}
          />
          No
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={mailRadioName}
            checked={vuoleMail}
            onChange={() => setVuoleMail(true)}
          />
          Sì, crea la bozza in attesa del tracking
        </label>
      </fieldset>

      {vuoleMail ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white px-3 py-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Casella mittente</span>
            <select
              value={mailAccountId}
              onChange={(e) => setMailAccountId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">Seleziona casella…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.email}
                </option>
              ))}
            </select>
            {accounts.length === 0 ? (
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Nessuna casella webmail disponibile.
              </span>
            ) : null}
          </label>
          <SpedizioneDestinatarioMailField
            value={destEmail}
            onChange={setDestEmail}
            anagrafica={anagrafica}
            emailAzienda={destEmailDefault}
            emailPec={emailPec}
            emailGeneriche={emailGeneriche}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Oggetto</span>
            <input
              value={mailOggetto}
              onChange={(e) => {
                oggettoToccato.current = true;
                setMailOggetto(e.target.value);
              }}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Testo</span>
            <textarea
              value={mailCorpo}
              onChange={(e) => {
                corpoToccato.current = true;
                setMailCorpo(e.target.value);
              }}
              rows={8}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-xs text-[var(--muted)]">
              Il bottone Visualizza tracking non va nel testo: il sistema lo
              aggiunge quando l’operatore inserisce il link. In calce partono
              anche il logo e i dati Agrinsicilia. Nessuna mail parte da sola.
            </p>
            <img
              src={AGRINSICILIA_LETTERHEAD.logoSrc}
              alt={AGRINSICILIA_LETTERHEAD.logoAlt}
              className="h-14 w-auto"
            />
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-800">
              {AGRINSICILIA_MAIL_FIRMA}
            </p>
          </div>
        </div>
      ) : null}
      </>
      )}

      {item?.stato === "prenotata" && !vuoleMail ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          In attesa del tracking.
        </p>
      ) : null}
      {item?.stato === "prenotata" && vuoleMail ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {sceltaOrdineFissa
            ? "Bozza salvata. Inserisci il tracking e conferma l’invio. Nessuna mail parte da sola."
            : "Bozza salvata in attesa del tracking. L’invio resta alla conferma dell’operatore."}
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

      {sceltaOrdineFissa && vuoleMail && item?.stato !== "inviata" ? (
        confermaModifica ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p>
              Confermi di modificare la mail inserita in fase di ordine? Il
              cliente non riceve nulla adesso: l’invio resta alla conferma
              dell’operatore, dopo il tracking.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfermaModifica(false)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={apriModificaMail}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Conferma
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfermaModifica(true)}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Modifica mail
          </button>
        )
      ) : null}

      {entityType === "ordine" &&
      sceltaOrdineFissa &&
      vuoleMail &&
      item?.stato !== "inviata" ? (
        confermaInvio ? (
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
            <p>
              Il tracking è nel messaggio. Nella mail compare il bottone
              Visualizza tracking. Confermi l’invio al cliente? Senza questa
              conferma non parte nulla.
            </p>
            <p>
              <span className="inline-block rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">
                Visualizza tracking
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfermaInvio(false)}
                className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy || !trackingUrl.trim()}
                onClick={() => void confermaInvioTracking()}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {busy ? "Invio…" : "Conferma invio"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || !trackingUrl.trim()}
            onClick={() => setConfermaInvio(true)}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            Invia mail con tracking
          </button>
        )
      ) : null}

      {item?.stato !== "inviata" && !sceltaOrdineFissa && !impostazioneDocumento ? (
        <div className="flex flex-wrap gap-2">
          {!vuoleMail && !nascondiAttesaTracking ? (
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
          solaLettura={sceltaOrdineFissa}
          intenzione={sceltaOrdineFissa ? "salva" : "invia"}
          anagrafica={anagrafica}
          emailAzienda={destEmailDefault}
          emailPec={emailPec}
          emailGeneriche={emailGeneriche}
          onClose={() => setCompose(null)}
          onInviata={() => {
            setCompose(null);
            setItem((prev) =>
              prev ? { ...prev, stato: "inviata" } : prev
            );
            setInfo("Mail inviata.");
          }}
          onSalvata={(next) => {
            setCompose(null);
            applyItem(next);
            setInfo(
              "Mail aggiornata. Non parte finché l’operatore non inserisce il tracking e conferma l’invio."
            );
          }}
        />
      ) : null}
    </div>
  );
}
