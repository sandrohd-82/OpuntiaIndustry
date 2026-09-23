"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FaEnvelopeOpen, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import { getWebmailMessaggioTextAction } from "@/app/actions/webmail";
import { WebmailHtmlBody } from "@/components/webmail/WebmailHtmlBody";
import {
  createCampionaturaAction,
  previewNumeroCampionaturaAction,
} from "@/app/actions/campionature";
import {
  generaCorpoMailSpedizioneAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { updateSedePartenzaAction } from "@/app/actions/impostazioni-sedi";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import { SpedizioneMailPanel } from "@/components/amministrazione/SpedizioneMailPanel";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { AziendaOrdineSelect } from "@/components/amministrazione/AziendaOrdineSelect";
import { CampionaturaAltroPostoModal } from "@/components/amministrazione/CampionaturaAltroPostoModal";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Cliente } from "@/lib/amministrazione/clienti";
import type { AnagraficaOrdineFonte } from "@/lib/amministrazione/ordine-anagrafica";
import { clienteFromPossibile } from "@/lib/promemorie-e-note/types";
import {
  CAMPIONATURA_MEZZI,
  CAMPIONATURA_MEZZI_OPERATIVI,
  CAMPIONATURA_MEZZO_LABEL,
  clienteSpedizioneOptions,
  defaultUmCampionaturaPerProdotto,
  opzioniUmCampionaturaPerProdotto,
  type Campionatura,
  type CampionaturaMezzo,
  type CampionaturaOrigine,
  type CampionaturaUm,
} from "@/lib/amministrazione/campionature";

type DraftRiga = {
  prodottoId: string;
  quantita: number | "";
  unitaMisura: CampionaturaUm;
  lottoCodice: string;
  note: string;
};

type Props = {
  onClose: () => void;
  onSaved: (item: Campionatura) => void;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyRiga(): DraftRiga {
  return {
    prodottoId: "",
    quantita: "",
    unitaMisura: "g",
    lottoCodice: "",
    note: "",
  };
}

export function CampionaturaFormModal({ onClose, onSaved }: Props) {
  const titleId = useId();
  const { prodotti, ready: prodottiReady } = useProdottiPropri();
  const [anagraficaFonte, setAnagraficaFonte] =
    useState<AnagraficaOrdineFonte>("cliente");
  const [possibileClienteId, setPossibileClienteId] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [origine, setOrigine] = useState<CampionaturaOrigine>("da_inviare");
  const [dataInvio, setDataInvio] = useState(todayInputValue);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [mezzo, setMezzo] = useState<CampionaturaMezzo | null>(null);
  const [nota, setNota] = useState<{ id: string; titolo: string } | null>(null);
  const [mail, setMail] = useState<{ id: string; subject: string } | null>(
    null
  );
  const [mailPreviewOpen, setMailPreviewOpen] = useState(false);
  const [origineOpen, setOrigineOpen] = useState(false);
  const [timelinePick, setTimelinePick] = useState<
    null | "nota" | "nota-create" | "mail"
  >(null);
  const [destinatario, setDestinatario] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [addressKey, setAddressKey] = useState<string | "altro">("");
  const [spedizionePrivato, setSpedizionePrivato] = useState(false);
  const [referenteRicezione, setReferenteRicezione] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [altroPostoOpen, setAltroPostoOpen] = useState(false);
  const [note, setNote] = useState("");
  const spedDraft = useRef({
    trackingUrl: "",
    letteraViaPath: "",
    letteraViaName: "",
    allegati: [] as Array<{ path: string; name: string; contentType: string }>,
    allegaTracking: false,
    allegaLettera: false,
    allegaFile: false,
    destinatarioEmail: "",
    sedePartenzaId: "",
  });
  const [composeAfter, setComposeAfter] = useState<{
    prenotazione: SpedizioneMailPrenotazione;
    subject: string;
    bodyText: string;
    to: string;
    item: Campionatura;
  } | null>(null);
  const [righe, setRighe] = useState<DraftRiga[]>([emptyRiga()]);
  const [numeroPreview, setNumeroPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || saving) return;
      if (timelinePick) {
        setTimelinePick(null);
        return;
      }
      if (altroPostoOpen) {
        setAltroPostoOpen(false);
        return;
      }
      if (origineOpen) {
        setOrigineOpen(false);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving, timelinePick, origineOpen, altroPostoOpen]);

  const targaDocumento =
    anagraficaFonte === "possibile" ? "Pc" : (cliente?.codiceTarga ?? "");

  useEffect(() => {
    if (!targaDocumento || !dataInvio) {
      setNumeroPreview(null);
      return;
    }
    let cancelled = false;
    void previewNumeroCampionaturaAction({
      codiceTargaCliente: targaDocumento,
      dataInvio,
    }).then((r) => {
      if (cancelled) return;
      setNumeroPreview(r.success ? r.numeroInterno : null);
    });
    return () => {
      cancelled = true;
    };
  }, [targaDocumento, dataInvio]);

  function applyCliente(next: Cliente | null) {
    setCliente(next);
    setNota(null);
    setMail(null);
    setReferenteRicezione(null);
    setSpedizionePrivato(false);
    if (!next) {
      setDestinatario("");
      setIndirizzo("");
      setAddressKey("");
      return;
    }
    const options = clienteSpedizioneOptions(next);
    const preferred =
      options.find((o) => o.key === "mag") ?? options[0] ?? null;
    if (preferred) {
      setAddressKey(preferred.key);
      setDestinatario(preferred.destinatario);
      setIndirizzo(preferred.indirizzo);
    } else {
      setAddressKey("");
      setDestinatario(next.ragioneSociale);
      setIndirizzo("");
    }
  }

  function updateRiga(index: number, patch: Partial<DraftRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  async function persistCampionatura(
    modoMail?: "prenota" | "compila" | "salva"
  ) {
    if (
      anagraficaFonte === "possibile"
        ? !possibileClienteId || !cliente
        : !cliente?.id || !cliente.codiceTarga
    ) {
      setFormError("Seleziona un’azienda.");
      return;
    }
    if (!cliente) {
      setFormError("Seleziona un’azienda.");
      return;
    }
    if (!mezzo) {
      setFormError(
        origine === "storico"
          ? "Indica a mezzo di (richiesta fatta a mezzo)."
          : "Indica a mezzo di."
      );
      return;
    }
    if (origine === "da_inviare") {
      if (mezzo === "mail") {
        if (!mail && !nota) {
          setFormError("Collega la mail oppure una nota della timeline.");
          return;
        }
      } else if (!nota) {
        setFormError("Collega o crea una nota della timeline.");
        return;
      }
    }
    const trackingDaSalvare =
      origine === "storico"
        ? trackingUrl.trim()
        : spedDraft.current.trackingUrl.trim();
    if (trackingDaSalvare) {
      try {
        const u = new URL(trackingDaSalvare);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error("protocol");
        }
      } catch {
        setFormError("URL tracking non valido (usa http o https).");
        return;
      }
    }
    if (!indirizzo.trim()) {
      setFormError("Seleziona un indirizzo di spedizione o spedisci in altro posto.");
      return;
    }
    const mapped = righe.map((r) => {
      const prodotto = prodotti.find((p) => p.id === r.prodottoId);
      return {
        prodottoId: r.prodottoId,
        prodottoCodice: prodotto?.codice ?? "",
        prodottoNome: prodotto?.nome ?? "",
        quantita: numberOrZero(r.quantita),
        unitaMisura: r.unitaMisura,
        lottoCodice: r.lottoCodice,
        note: r.note,
      };
    });
    setSaving(true);
    setFormError(null);
    try {
      const result = await createCampionaturaAction({
        anagraficaFonte,
        possibileClienteId: possibileClienteId || null,
        clienteId: cliente.id || undefined,
        cliente: cliente.ragioneSociale,
        codiceTargaCliente: targaDocumento || "Pc",
        origine,
        dataInvio,
        mezzo,
        trackingUrl: trackingDaSalvare,
        pnNotaId: origine === "storico" ? null : (nota?.id ?? null),
        webmailMessaggioId: origine === "storico" ? null : (mail?.id ?? null),
        spedizioneTipo: addressKey === "altro" ? "altro_posto" : "sede_azienda",
        spedizionePrivato,
        referenteRicezioneId: referenteRicezione?.id ?? null,
        destinatario: destinatario.trim() || cliente.ragioneSociale,
        indirizzoSpedizione: indirizzo,
        note,
        righe: mapped,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      if (spedDraft.current.sedePartenzaId) {
        await updateSedePartenzaAction({
          entityType: "campionatura",
          entityId: result.item.id,
          sedeId: spedDraft.current.sedePartenzaId,
        });
      }
      if (modoMail) {
        const d = spedDraft.current;
        let oggetto = "";
        let corpo = "";
        if (modoMail !== "salva") {
          const testo = await generaCorpoMailSpedizioneAction({
            cliente: result.item.cliente,
            numero: result.item.numeroInterno,
            prodotti: result.item.righe
              .map((r) => `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura}`)
              .join(", "),
            trackingUrl: d.trackingUrl,
            haLettera: d.allegaLettera && Boolean(d.letteraViaPath),
          });
          if (!testo.success) {
            setFormError(testo.error);
            onSaved(result.item);
            return;
          }
          oggetto = testo.subject;
          corpo = testo.bodyText;
        }
        const up = await upsertPrenotazioneSpedizioneMailAction({
          entityType: "campionatura",
          entityId: result.item.id,
          trackingUrl: d.trackingUrl,
          letteraViaPath: d.letteraViaPath,
          letteraViaName: d.letteraViaName,
          allegati: d.allegati,
          allegaTracking: modoMail === "salva" ? false : d.allegaTracking,
          allegaLettera: modoMail === "salva" ? false : d.allegaLettera,
          allegaFile: modoMail === "salva" ? false : d.allegaFile,
          destinatarioEmail: d.destinatarioEmail || cliente.email,
          oggetto,
          corpo,
          modo: modoMail,
        });
        if (!up.success) {
          setFormError(up.error);
          onSaved(result.item);
          return;
        }
        if (up.apriBozza && oggetto) {
          setComposeAfter({
            prenotazione: up.item,
            subject: oggetto,
            bodyText: corpo,
            to: d.destinatarioEmail || cliente.email,
            item: result.item,
          });
          return;
        }
      }
      onSaved(result.item);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Salvataggio non riuscito. Riprova."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await persistCampionatura("salva");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {origine === "storico"
            ? "Registra campionatura in storico"
            : "Invio campionatura"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Documento distinto dall’ordine. Numero interno{" "}
          <span className="font-mono">Cp-AA-TARGA/N</span>
          {numeroPreview ? (
            <>
              {" "}
              — anteprima{" "}
              <span className="font-mono font-medium text-slate-800">
                {numeroPreview}
              </span>
            </>
          ) : null}
          {origine === "storico"
            ? ". Non crea un ordine da processare: risulta già inviata nella timeline alla data indicata."
            : ". Salvataggio = Inserito (da processare) e documento approvato (ISO 9001)."}
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="block text-sm">
            <span className="mb-1 block font-medium">Modalità</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["da_inviare", "Da inviare"],
                  ["storico", "Registra in storico"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setOrigine(value);
                    setFormError(null);
                    if (value === "da_inviare" && mezzo === "non_ricordo") {
                      setMezzo(null);
                    }
                    if (value === "storico") {
                      setOrigineOpen(false);
                    }
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    origine === value
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)] bg-white hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Azienda</span>
              <AziendaOrdineSelect
                fonte={anagraficaFonte}
                clienteId={
                  anagraficaFonte === "cliente" ? (cliente?.id ?? "") : ""
                }
                possibileClienteId={possibileClienteId}
                autoFocus
                onFonteChange={setAnagraficaFonte}
                onChange={(sel) => {
                  setAnagraficaFonte(sel.fonte);
                  setPossibileClienteId(sel.possibile?.id ?? "");
                  if (sel.cliente) {
                    applyCliente(sel.cliente);
                    return;
                  }
                  if (sel.possibile) {
                    applyCliente(clienteFromPossibile(sel.possibile));
                    return;
                  }
                  applyCliente(null);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {origine === "storico" ? "Data invio" : "Data richiesta"}
              </span>
              <span className="mb-1 block text-xs text-[var(--muted)]">
                {origine === "storico"
                  ? "Data in cui la campionatura è stata inviata (comparirà in storico e timeline)."
                  : "Data in cui è arrivata la richiesta, non la spedizione."}
              </span>
              <input
                type="date"
                required
                value={dataInvio}
                onChange={(e) => setDataInvio(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <div className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                {origine === "storico"
                  ? "Richiesta fatta a mezzo"
                  : "A mezzo di"}
              </span>
              <div className="flex flex-wrap gap-2">
                {(origine === "storico"
                  ? CAMPIONATURA_MEZZI
                  : CAMPIONATURA_MEZZI_OPERATIVI
                ).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (!cliente) {
                        setFormError("Seleziona prima un’azienda.");
                        return;
                      }
                      setFormError(null);
                      setMezzo(m);
                      if (origine === "da_inviare") {
                        setOrigineOpen(true);
                      }
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      mezzo === m
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-white hover:bg-slate-50"
                    }`}
                  >
                    {CAMPIONATURA_MEZZO_LABEL[m]}
                  </button>
                ))}
              </div>
              {origine === "storico" ? null : nota || mail ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {nota ? (
                    <>
                      Nota: <span className="font-medium">{nota.titolo}</span>
                    </>
                  ) : null}
                  {nota && mail ? " · " : null}
                  {mail ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      Mail: <span className="font-medium">{mail.subject}</span>
                      <button
                        type="button"
                        onClick={() => setMailPreviewOpen(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900 hover:bg-sky-100"
                      >
                        <FaEnvelopeOpen size={10} />
                        Leggi mail
                      </button>
                    </span>
                  ) : null}
                </p>
              ) : mezzo ? (
                <p className="mt-2 text-xs text-amber-800">
                  {mezzo === "mail"
                    ? "Collega la mail (la nota è facoltativa)."
                    : "Collega una nota della timeline (obbligatoria)."}
                </p>
              ) : null}
            </div>
            <div className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Indirizzo di spedizione
              </span>
              <p className="mb-2 text-xs text-[var(--muted)]">
                Di default le sedi dell’azienda. Destinatario: {destinatario || "—"}.
              </p>
              <div className="space-y-2">
                {(cliente ? clienteSpedizioneOptions(cliente) : []).map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${
                      addressKey === opt.key
                        ? "border-[var(--primary)] bg-slate-50"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="spedizione-indirizzo"
                      checked={addressKey === opt.key}
                      onChange={() => {
                        setAddressKey(opt.key);
                        setDestinatario(opt.destinatario);
                        setIndirizzo(opt.indirizzo);
                        setReferenteRicezione(null);
                        setSpedizionePrivato(false);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {opt.indirizzo}
                      </span>
                    </span>
                  </label>
                ))}
                {addressKey === "altro" && indirizzo ? (
                  <label className="flex cursor-pointer gap-2 rounded-lg border border-[var(--primary)] bg-slate-50 px-3 py-2">
                    <input type="radio" checked readOnly className="mt-1" />
                    <span>
                      <span className="font-medium">
                        Altro posto
                        {referenteRicezione
                          ? ` · ${referenteRicezione.label}`
                          : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {destinatario} — {indirizzo}
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!cliente}
                onClick={() => {
                  if (!cliente) {
                    setFormError("Seleziona prima un’azienda.");
                    return;
                  }
                  setAltroPostoOpen(true);
                }}
                className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Spedisci in altro posto
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Prodotti e lotti</p>
              <button
                type="button"
                onClick={() => setRighe((prev) => [...prev, emptyRiga()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                <FaPlus size={10} />
                Aggiungi riga
              </button>
            </div>
            <div className="space-y-3">
              {righe.map((riga, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[var(--border)] bg-slate-50/70 p-3 sm:grid-cols-[1fr_5.5rem_4.5rem_8rem_auto]"
                >
                  <label className="block text-xs sm:col-span-1">
                    <span className="mb-1 block font-medium text-slate-600">
                      Prodotto
                    </span>
                    <select
                      required
                      value={riga.prodottoId}
                      disabled={!prodottiReady}
                      onChange={(e) => {
                        const prodottoId = e.target.value;
                        const p = prodotti.find((x) => x.id === prodottoId);
                        const nextUm = defaultUmCampionaturaPerProdotto(
                          p?.codice
                        );
                        const allowed = opzioniUmCampionaturaPerProdotto(
                          p?.codice,
                          riga.unitaMisura
                        );
                        updateRiga(index, {
                          prodottoId,
                          unitaMisura: allowed.includes(riga.unitaMisura)
                            ? riga.unitaMisura
                            : nextUm,
                        });
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    >
                      <option value="">Seleziona…</option>
                      {prodotti.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codice} — {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      Q.tà
                    </span>
                    <ClearableNumberInput
                      required
                      min={0}
                      step="any"
                      value={riga.quantita}
                      onValueChange={(v) => updateRiga(index, { quantita: v })}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      UM
                    </span>
                    <select
                      value={riga.unitaMisura}
                      onChange={(e) =>
                        updateRiga(index, {
                          unitaMisura: e.target.value as CampionaturaUm,
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    >
                      {opzioniUmCampionaturaPerProdotto(
                        prodotti.find((p) => p.id === riga.prodottoId)?.codice,
                        riga.unitaMisura
                      ).map((um) => (
                        <option key={um} value={um}>
                          {um}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      Lotto
                    </span>
                    <input
                      type="text"
                      value={riga.lottoCodice}
                      onChange={(e) =>
                        updateRiga(index, { lottoCodice: e.target.value })
                      }
                      placeholder="Facoltativo"
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      title="Rimuovi riga"
                      disabled={righe.length === 1}
                      onClick={() =>
                        setRighe((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <FaTrash size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {origine === "storico" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tracking (URL)</span>
              <span className="mb-1 block text-xs text-[var(--muted)]">
                Facoltativo. Se presente, crea il monitoraggio spedizione.
              </span>
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          ) : null}

          <SpedizioneMailPanel
            entityType="campionatura"
            entityId=""
            clienteNome={cliente?.ragioneSociale ?? ""}
            numero={numeroPreview ?? "campionatura"}
            prodotti={righe
              .map((r) => {
                const p = prodotti.find((x) => x.id === r.prodottoId);
                return p ? `${p.codice} ${r.quantita} ${r.unitaMisura}` : "";
              })
              .filter(Boolean)
              .join(", ")}
            destEmailDefault={cliente?.email ?? ""}
            onDraftChange={(d) => {
              spedDraft.current = d;
            }}
            onNeedEntity={(modo) => void persistCampionatura(modo)}
          />

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving
                ? "Salvataggio…"
                : origine === "storico"
                  ? "Salva in storico e timeline"
                  : "Registra ordine"}
            </button>
          </div>
        </form>
      </div>

      {origineOpen && cliente ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOrigineOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold">
              Collegamento richiesta
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {mezzo === "mail"
                ? "Collega la mail della richiesta. La nota della timeline è facoltativa."
                : "Collega una nota già creata o creane una sulla timeline dell’azienda."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {mezzo === "mail" ? (
                <button
                  type="button"
                  onClick={() => setTimelinePick("mail")}
                  className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-950 hover:bg-sky-100"
                >
                  Collega Mail
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTimelinePick("nota")}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Nota creata
              </button>
              <button
                type="button"
                onClick={() => setTimelinePick("nota-create")}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
              >
                Creane una
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOrigineOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {altroPostoOpen && cliente ? (
        <CampionaturaAltroPostoModal
          clienteId={cliente.id}
          clienteLabel={cliente.ragioneSociale}
          onClose={() => setAltroPostoOpen(false)}
          onSaved={(r) => {
            setAddressKey("altro");
            setDestinatario(r.destinatario);
            setIndirizzo(r.indirizzo);
            setSpedizionePrivato(r.isPrivato);
            setReferenteRicezione({ id: r.referenteId, label: r.label });
            setAltroPostoOpen(false);
          }}
        />
      ) : null}

      {timelinePick && cliente ? (
        <AziendaTimelineModal
          elevated
          aziendaTipo={
            anagraficaFonte === "possibile" && !cliente.codiceTarga
              ? "cliente_possibile"
              : "cliente"
          }
          aziendaId={
            anagraficaFonte === "possibile" && !cliente.codiceTarga
              ? possibileClienteId
              : cliente.id
          }
          aziendaLabel={cliente.ragioneSociale}
          onClose={() => setTimelinePick(null)}
          pickMode={
            timelinePick === "mail"
              ? {
                  purpose: "campionatura-mail",
                  onPicked: (picked) => {
                    setMail(picked);
                    setTimelinePick(null);
                    setOrigineOpen(false);
                  },
                }
              : {
                  purpose: "campionatura-nota",
                  dataRichiesta: dataInvio,
                  openCreate: timelinePick === "nota-create",
                  onPicked: (picked) => {
                    setNota(picked);
                    setTimelinePick(null);
                    setOrigineOpen(false);
                  },
                }
          }
        />
      ) : null}

      {mailPreviewOpen && mail ? (
        <CampionaturaMailPreviewModal
          mail={mail}
          onClose={() => setMailPreviewOpen(false)}
        />
      ) : null}

      {composeAfter ? (
        <SpedizioneMailComposeModal
          prenotazione={composeAfter.prenotazione}
          subject={composeAfter.subject}
          bodyText={composeAfter.bodyText}
          to={composeAfter.to}
          onClose={() => {
            const item = composeAfter.item;
            setComposeAfter(null);
            onSaved(item);
          }}
          onInviata={() => {
            const item = composeAfter.item;
            setComposeAfter(null);
            onSaved(item);
          }}
        />
      ) : null}
    </div>
  );
}

function CampionaturaMailPreviewModal({
  mail,
  onClose,
}: {
  mail: { id: string; subject: string };
  onClose: () => void;
}) {
  const titleId = useId();
  const [bodyText, setBodyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWebmailMessaggioTextAction(mail.id).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBodyText(res.bodyText);
    });
    return () => {
      cancelled = true;
    };
  }, [mail.id]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold">
              Leggi mail
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--muted)]">
              {mail.subject}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <FaXmark />
          </button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Caricamento contenuto…
          </p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <WebmailHtmlBody messaggioId={mail.id} bodyText={bodyText} />
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
