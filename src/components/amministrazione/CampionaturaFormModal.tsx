"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FaEnvelopeOpen, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import { getWebmailMessaggioTextAction } from "@/app/actions/webmail";
import { WebmailHtmlBody } from "@/components/webmail/WebmailHtmlBody";
import {
  createCampionaturaAction,
  listCommercialiCampionaturaAction,
  previewNumeroCampionaturaAction,
  updateCampionaturaAction,
  type CommercialeCampionaturaOption,
} from "@/app/actions/campionature";
import {
  generaCorpoMailSpedizioneAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { loadAnagraficaExtraAction } from "@/app/actions/anagrafica-extra";
import { getClientePossibileAction } from "@/app/actions/promemorie-e-note";
import { updateSedePartenzaAction } from "@/app/actions/impostazioni-sedi";
import { SpedizioneMailComposeModal } from "@/components/amministrazione/SpedizioneMailComposeModal";
import { SpedizioneMailPanel } from "@/components/amministrazione/SpedizioneMailPanel";
import { anagraficaMailDi } from "@/components/amministrazione/SpedizioneDestinatarioMailField";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { AziendaOrdineSelect } from "@/components/amministrazione/AziendaOrdineSelect";
import { CampionaturaAltroPostoModal } from "@/components/amministrazione/CampionaturaAltroPostoModal";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";
import { useClienti } from "@/hooks/useClienti";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { AnagraficaSede } from "@/lib/amministrazione/anagrafica-extra";
import type { Cliente } from "@/lib/amministrazione/clienti";
import type { AnagraficaOrdineFonte } from "@/lib/amministrazione/ordine-anagrafica";
import { clienteFromPossibile } from "@/lib/promemorie-e-note/types";
import {
  CAMPIONATURA_MEZZI,
  CAMPIONATURA_MEZZI_OPERATIVI,
  CAMPIONATURA_MEZZO_LABEL,
  clienteSpedizioneOptions,
  pickSpedizioneDefault,
  defaultUmCampionaturaPerProdotto,
  opzioniUmCampionaturaPerProdotto,
  type Campionatura,
  type CampionaturaMezzo,
  type CampionaturaOrigine,
  type CampionaturaUm,
} from "@/lib/amministrazione/campionature";

type DraftRiga = {
  prodottoId: string;
  prodottoCodice?: string;
  prodottoNome?: string;
  quantita: number | "";
  unitaMisura: CampionaturaUm;
  lottoCodice: string;
  note: string;
  noteAperta: boolean;
};

type Props = {
  onClose: () => void;
  onSaved: (item: Campionatura) => void;
  /** Stessa procedura di inserimento, già compilata: il salvataggio aggiorna questo record. */
  editing?: Campionatura | null;
};

function righeFromCampionatura(item: Campionatura | null | undefined): DraftRiga[] {
  if (!item || item.righe.length === 0) return [emptyRiga()];
  return item.righe.map((r) => ({
    prodottoId: r.prodottoId,
    prodottoCodice: r.prodottoCodice,
    prodottoNome: r.prodottoNome,
    quantita: r.quantita,
    unitaMisura: r.unitaMisura,
    lottoCodice: r.lottoCodice,
    note: r.note,
    noteAperta: Boolean(r.note.trim()),
  }));
}

function addressKeyFromSaved(
  cliente: Cliente,
  sedi: AnagraficaSede[],
  item: Campionatura
): string {
  if (item.spedizioneTipo === "altro_posto") return "altro";
  const saved = item.indirizzoSpedizione.trim();
  const hit = clienteSpedizioneOptions(cliente, sedi, "campionature").find(
    (opt) => opt.indirizzo.trim() === saved
  );
  if (hit) return hit.key;
  return saved ? "altro" : "";
}

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
    noteAperta: false,
  };
}

export function CampionaturaFormModal({
  onClose,
  onSaved,
  editing = null,
}: Props) {
  const titleId = useId();
  const { prodotti, ready: prodottiReady } = useProdottiPropri();
  const { clienti } = useClienti();
  const hydratedAddress = useRef(false);
  const [anagraficaFonte, setAnagraficaFonte] =
    useState<AnagraficaOrdineFonte>(
      editing?.clienteId
        ? "cliente"
        : editing?.possibileClienteId
          ? "possibile"
          : "cliente"
    );
  const [possibileClienteId, setPossibileClienteId] = useState(
    editing?.possibileClienteId ?? ""
  );
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [origine, setOrigine] = useState<CampionaturaOrigine>(
    editing?.origine ?? "da_inviare"
  );
  const [destinazione, setDestinazione] = useState<"azienda" | "commerciale">(
    editing?.destinazione ?? "azienda"
  );
  const [commercialePersonaId, setCommercialePersonaId] = useState(
    editing?.commercialePersonaId ?? ""
  );
  const [commerciali, setCommerciali] = useState<CommercialeCampionaturaOption[]>(
    []
  );
  const [dataInvio, setDataInvio] = useState(
    editing?.dataInvio ?? todayInputValue()
  );
  const [trackingUrl, setTrackingUrl] = useState(editing?.trackingUrl ?? "");
  const [mezzo, setMezzo] = useState<CampionaturaMezzo | null>(
    editing?.mezzo ?? null
  );
  const [nota, setNota] = useState<{ id: string; titolo: string } | null>(
    editing?.pnNotaId
      ? { id: editing.pnNotaId, titolo: editing.pnNotaTitolo || "Nota" }
      : null
  );
  const [mail, setMail] = useState<{ id: string; subject: string } | null>(
    editing?.webmailMessaggioId
      ? {
          id: editing.webmailMessaggioId,
          subject: editing.webmailOggetto || "Mail collegata",
        }
      : null
  );
  const [mailPreviewOpen, setMailPreviewOpen] = useState(false);
  const [origineOpen, setOrigineOpen] = useState(false);
  const [timelinePick, setTimelinePick] = useState<
    null | "nota" | "nota-create" | "mail"
  >(null);
  const [destinatario, setDestinatario] = useState(editing?.destinatario ?? "");
  const [indirizzo, setIndirizzo] = useState(
    editing?.indirizzoSpedizione ?? ""
  );
  const [addressKey, setAddressKey] = useState<string | "altro">(
    editing?.spedizioneTipo === "altro_posto" ? "altro" : ""
  );
  const [sediExtra, setSediExtra] = useState<AnagraficaSede[]>([]);
  const [spedizionePrivato, setSpedizionePrivato] = useState(
    editing?.spedizionePrivato ?? false
  );
  const [referenteRicezione, setReferenteRicezione] = useState<{
    id: string;
    label: string;
  } | null>(
    editing?.referenteRicezioneId
      ? {
          id: editing.referenteRicezioneId,
          label: editing.referenteRicezioneLabel || "Referente",
        }
      : null
  );
  const [altroPostoOpen, setAltroPostoOpen] = useState(false);
  const [note, setNote] = useState(editing?.note ?? "");
  const spedDraft = useRef({
    trackingUrl: "",
    letteraViaPath: "",
    letteraViaName: "",
    allegati: [] as Array<{ path: string; name: string; contentType: string }>,
    allegaTracking: false,
    allegaLettera: false,
    allegaFile: false,
    destinatarioEmail: "",
    sedePartenzaId: editing?.sedePartenzaId ?? "",
    bozzaPronta: !editing?.id,
    mailAccountId: "",
    mailOggetto: "",
    mailCorpo: "",
  });
  const [composeAfter, setComposeAfter] = useState<{
    prenotazione: SpedizioneMailPrenotazione;
    subject: string;
    bodyText: string;
    to: string;
    item: Campionatura;
  } | null>(null);
  const [righe, setRighe] = useState<DraftRiga[]>(() =>
    righeFromCampionatura(editing)
  );
  const [numeroPreview, setNumeroPreview] = useState<string | null>(
    editing?.numeroInterno ?? null
  );
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

  const commercialeScelto =
    commerciali.find((c) => c.id === commercialePersonaId) ?? null;
  const targaDocumento =
    destinazione === "commerciale"
      ? commercialeScelto?.matricola || (commercialePersonaId ? "CM" : "")
      : anagraficaFonte === "possibile"
        ? "Pc"
        : (cliente?.codiceTarga ?? "");

  useEffect(() => {
    if (editing) {
      setNumeroPreview(editing.numeroInterno);
      return;
    }
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
  }, [targaDocumento, dataInvio, editing, destinazione]);

  useEffect(() => {
    if (!editing || hydratedAddress.current) return;
    if (editing.clienteId) {
      const found = clienti.find((c) => c.id === editing.clienteId);
      if (!found) return;
      hydratedAddress.current = true;
      setCliente(found);
      setAnagraficaFonte("cliente");
      void loadAnagraficaExtraAction({
        ownerKind: "cliente",
        ownerId: found.id,
      }).then((res) => {
        const sedi = res.success ? res.sedi : [];
        setSediExtra(sedi);
        setAddressKey(addressKeyFromSaved(found, sedi, editing));
      });
      return;
    }
    if (!editing.possibileClienteId) return;
    let cancel = false;
    void getClientePossibileAction(editing.possibileClienteId).then((res) => {
      if (cancel || hydratedAddress.current || !res.success || !res.item) return;
      hydratedAddress.current = true;
      const asCliente = clienteFromPossibile(res.item);
      setCliente(asCliente);
      setAnagraficaFonte("possibile");
      setPossibileClienteId(res.item.id);
      void loadAnagraficaExtraAction({
        ownerKind: "cliente_possibile",
        ownerId: res.item.id,
      }).then((sediRes) => {
        if (cancel) return;
        const sedi = sediRes.success ? sediRes.sedi : [];
        setSediExtra(sedi);
        setAddressKey(addressKeyFromSaved(asCliente, sedi, editing));
      });
    });
    return () => {
      cancel = true;
    };
  }, [editing, clienti]);

  function applySpedizioneOptions(next: Cliente, sedi: AnagraficaSede[]) {
    const options = clienteSpedizioneOptions(next, sedi, "campionature");
    const preferred = pickSpedizioneDefault(options, "campionature");
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

  const sediLoadSeq = useRef(0);

  function applyCliente(
    next: Cliente | null,
    owner?: { kind: "cliente" | "cliente_possibile"; id: string }
  ) {
    setCliente(next);
    setNota(null);
    setMail(null);
    setReferenteRicezione(null);
    setSpedizionePrivato(false);
    if (!next) {
      sediLoadSeq.current += 1;
      setSediExtra([]);
      setDestinatario("");
      setIndirizzo("");
      setAddressKey("");
      return;
    }
    setSediExtra([]);
    applySpedizioneOptions(next, []);
    const ownerId = owner?.id.trim() || next.id;
    if (!ownerId) return;
    const token = ++sediLoadSeq.current;
    void loadAnagraficaExtraAction({
      ownerKind: owner?.kind ?? "cliente",
      ownerId,
    }).then((res) => {
      if (sediLoadSeq.current !== token) return;
      if (!res.success) {
        setFormError(
          res.error || "Impossibile leggere le sedi della scheda."
        );
        return;
      }
      setSediExtra(res.sedi);
      applySpedizioneOptions(next, res.sedi);
    });
  }

  function updateRiga(index: number, patch: Partial<DraftRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  useEffect(() => {
    let cancelled = false;
    void listCommercialiCampionaturaAction().then((res) => {
      if (cancelled || !res.success) return;
      setCommerciali(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistVersoCommerciale() {
    if (!commercialePersonaId) {
      setFormError("Seleziona un commerciale.");
      return;
    }
    if (commercialeScelto && !commercialeScelto.residenzaCompleta) {
      setFormError(
        `Nella scheda di ${commercialeScelto.nome} manca l'indirizzo di residenza completo (via, CAP, città, provincia, paese).`
      );
      return;
    }
    if (righe.some((r) => !r.prodottoId)) {
      setFormError("Seleziona un prodotto per ogni riga.");
      return;
    }
    if (
      righe.some(
        (r) => !Number.isInteger(numberOrZero(r.quantita)) || numberOrZero(r.quantita) < 1
      )
    ) {
      setFormError("Indica un numero intero di confezioni, almeno 1.");
      return;
    }
    const mapped = righe.map((r) => {
      const prodotto = prodotti.find((p) => p.id === r.prodottoId);
      return {
        prodottoId: r.prodottoId,
        prodottoCodice: prodotto?.codice || r.prodottoCodice || "",
        prodottoNome: prodotto?.nome || r.prodottoNome || "",
        quantita: numberOrZero(r.quantita),
        unitaMisura: "pz" as const,
        lottoCodice: "",
        note: r.note,
      };
    });
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        destinazione: "commerciale" as const,
        commercialePersonaId,
        dataInvio,
        note,
        righe: mapped,
      };
      const result = editing
        ? await updateCampionaturaAction({ ...payload, id: editing.id })
        : await createCampionaturaAction(payload);
      if (!result.success) {
        setFormError(result.error);
        return;
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

  async function persistCampionatura(
    modoMail?: "prenota" | "compila" | "salva"
  ) {
    if (destinazione === "commerciale") {
      await persistVersoCommerciale();
      return;
    }
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
          ? "Seleziona come è stata fatta la richiesta (mail, telefono o altro)."
          : "Seleziona A mezzo di: come è arrivata la richiesta (mail, telefono o altro)."
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
        prodottoCodice: prodotto?.codice || r.prodottoCodice || "",
        prodottoNome: prodotto?.nome || r.prodottoNome || "",
        quantita: numberOrZero(r.quantita),
        unitaMisura: r.unitaMisura,
        lottoCodice: r.lottoCodice,
        note: r.note,
      };
    });
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
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
      };
      const result = editing
        ? await updateCampionaturaAction({ ...payload, id: editing.id })
        : await createCampionaturaAction(payload);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      const saved: Campionatura = {
        ...result.item,
        pnNotaTitolo: nota?.titolo || result.item.pnNotaTitolo,
        webmailOggetto: mail?.subject || result.item.webmailOggetto,
        referenteRicezioneLabel:
          referenteRicezione?.label || result.item.referenteRicezioneLabel,
      };
      const bozzaPronta =
        (spedDraft.current as { bozzaPronta?: boolean }).bozzaPronta !== false;
      if (spedDraft.current.sedePartenzaId && (!editing || bozzaPronta)) {
        await updateSedePartenzaAction({
          entityType: "campionatura",
          entityId: result.item.id,
          sedeId: spedDraft.current.sedePartenzaId,
        });
      }
      if (modoMail && (!editing || bozzaPronta)) {
        const d = spedDraft.current;
        let oggetto = d.mailOggetto.trim();
        let corpo = d.mailCorpo.trim();
        if (modoMail !== "salva" && (!oggetto || !corpo)) {
          const testo = await generaCorpoMailSpedizioneAction({
            cliente: result.item.cliente,
            numero: result.item.numeroInterno,
            prodotti: result.item.righe
              .map((r) => `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura}`)
              .join(", "),
            trackingUrl: d.trackingUrl,
            haLettera: false,
          });
          if (!testo.success) {
            setFormError(testo.error);
            onSaved(saved);
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
          allegaLettera: false,
          allegaFile: false,
          destinatarioEmail: d.destinatarioEmail || cliente.email,
          oggetto,
          corpo,
          accountId: d.mailAccountId || null,
          modo: modoMail,
          soloTracking: Boolean(editing),
        });
        if (!up.success) {
          setFormError(up.error);
          onSaved(saved);
          return;
        }
        if (up.apriBozza && oggetto) {
          setComposeAfter({
            prenotazione: up.item,
            subject: oggetto,
            bodyText: corpo,
            to: d.destinatarioEmail || cliente.email,
            item: saved,
          });
          return;
        }
      }
      onSaved(saved);
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
    const d = spedDraft.current;
    const modo = !d.allegaTracking
      ? "salva"
      : d.trackingUrl.trim()
        ? "compila"
        : "prenota";
    await persistCampionatura(modo);
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {editing
              ? "Modifica campionatura"
              : destinazione === "commerciale"
                ? "Invio campionatura a commerciale"
                : origine === "storico"
                  ? "Registra campionatura in storico"
                  : "Invio campionatura"}
          </h2>
          {editing ? null : (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                if (destinazione === "commerciale") {
                  setDestinazione("azienda");
                  return;
                }
                setDestinazione("commerciale");
                setOrigine("da_inviare");
                setRighe((prev) =>
                  prev.map((r) => ({ ...r, unitaMisura: "pz", lottoCodice: "" }))
                );
              }}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              {destinazione === "commerciale"
                ? "Torna all'invio all'azienda"
                : "Invia campionatura a commerciale"}
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Documento distinto dall’ordine. Numero interno{" "}
          <span className="font-mono">
            {editing ? editing.numeroInterno : "Cp-AA-TARGA/N"}
          </span>
          {numeroPreview && !editing ? (
            <>
              {" "}
              — anteprima{" "}
              <span className="font-mono font-medium text-slate-800">
                {numeroPreview}
              </span>
            </>
          ) : null}
          {editing
            ? ". Il salvataggio aggiorna questa campionatura, con lo stesso numero interno."
            : origine === "storico"
              ? ". Non crea un ordine da processare: risulta già inviata nella timeline alla data indicata."
              : ". Salvataggio = Inserito (da processare) e documento approvato (ISO 9001)."}
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          {destinazione === "commerciale" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">Commerciale</span>
                <select
                  required
                  value={commercialePersonaId}
                  onChange={(e) => setCommercialePersonaId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
                >
                  <option value="">Seleziona…</option>
                  {commerciali.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.matricola ? ` · ${c.matricola}` : ""}
                      {c.residenzaCompleta ? "" : " · residenza incompleta"}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {commercialeScelto?.residenzaCompleta
                    ? `Spedizione a ${commercialeScelto.indirizzoCompleto}.`
                    : "L'indirizzo è quello di residenza sulla scheda operatore. Non si sceglie un'altra sede."}
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Data richiesta</span>
                <input
                  type="date"
                  required
                  value={dataInvio}
                  onChange={(e) => setDataInvio(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            </div>
          ) : null}
          {destinazione === "commerciale" ? null : (
          <>
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
                preferenza="campionature"
                fonte={anagraficaFonte}
                clienteId={
                  anagraficaFonte === "cliente"
                    ? (cliente?.id || editing?.clienteId || "")
                    : ""
                }
                possibileClienteId={possibileClienteId}
                autoFocus
                onFonteChange={setAnagraficaFonte}
                onChange={(sel) => {
                  setAnagraficaFonte(sel.fonte);
                  setPossibileClienteId(sel.possibile?.id ?? "");
                  if (sel.cliente) {
                    applyCliente(sel.cliente, {
                      kind: "cliente",
                      id: sel.cliente.id,
                    });
                    return;
                  }
                  if (sel.possibile) {
                    applyCliente(clienteFromPossibile(sel.possibile), {
                      kind: "cliente_possibile",
                      id: sel.possibile.id,
                    });
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
                Di default l&apos;indirizzo segnato in scheda per le
                campionature. Si possono scegliere tutte le sedi inserite.
                Destinatario: {destinatario || "—"}.
              </p>
              <div className="space-y-2">
                {(cliente
                  ? clienteSpedizioneOptions(cliente, sediExtra, "campionature")
                  : []
                ).map((opt) => (
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
          </>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {destinazione === "commerciale"
                    ? "Prodotti e confezioni"
                    : "Prodotti e lotti"}
                </p>
                {destinazione === "commerciale" ? (
                  <p className="text-xs text-[var(--muted)]">
                    Si conta il numero di confezioni, non la grammatura. Ogni
                    confezione ha il peso standard. Un peso diverso si scrive
                    nella nota.
                  </p>
                ) : null}
              </div>
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
                  className={`grid gap-2 rounded-lg border border-[var(--border)] bg-slate-50/70 p-3 ${
                  destinazione === "commerciale"
                    ? "sm:grid-cols-[1fr_8rem_auto]"
                    : "sm:grid-cols-[1fr_5.5rem_4.5rem_8rem_auto]"
                }`}
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
                    <button
                      type="button"
                      onClick={() =>
                        updateRiga(index, { noteAperta: !riga.noteAperta })
                      }
                      className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                    >
                      Nota
                    </button>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-slate-600">
                      {destinazione === "commerciale" ? "N. confezioni" : "Q.tà"}
                    </span>
                    <ClearableNumberInput
                      required
                      min={destinazione === "commerciale" ? 1 : 0}
                      step={destinazione === "commerciale" ? 1 : "any"}
                      value={riga.quantita}
                      onValueChange={(v) => updateRiga(index, { quantita: v })}
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                    />
                  </label>
                  {destinazione === "commerciale" ? null : (
                  <>
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
                  </>
                  )}
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
                  {riga.noteAperta ? (
                    <label className="block text-xs sm:col-span-full">
                      <span className="mb-1 block font-medium text-slate-600">
                        Nota del prodotto
                      </span>
                      <input
                        type="text"
                        maxLength={500}
                        value={riga.note}
                        onChange={(e) =>
                          updateRiga(index, { note: e.target.value })
                        }
                        placeholder={
                          destinazione === "commerciale"
                            ? "Solo se il peso non è quello standard"
                            : "Es. Nopal dry C da 50 micron"
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {origine === "storico" && destinazione !== "commerciale" ? (
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

          {destinazione === "commerciale" ? null : (
          <SpedizioneMailPanel
            entityType="campionatura"
            entityId={editing?.id ?? ""}
            sedePartenzaIdDefault={editing?.sedePartenzaId ?? ""}
            clienteNome={cliente?.ragioneSociale || editing?.cliente || ""}
            numero={editing?.numeroInterno ?? numeroPreview ?? "campionatura"}
            prodotti={righe
              .map((r) => {
                const p = prodotti.find((x) => x.id === r.prodottoId);
                return p ? `${p.codice} ${r.quantita} ${r.unitaMisura}` : "";
              })
              .filter(Boolean)
              .join(", ")}
            destEmailDefault={cliente?.email ?? ""}
            anagrafica={anagraficaMailDi({
              fonte: anagraficaFonte,
              possibileId: possibileClienteId,
              clienteId: cliente?.id ?? "",
            })}
            emailPec={cliente?.pec ?? ""}
            emailGeneriche={cliente?.emailGeneriche ?? []}
            onDraftChange={(d) => {
              spedDraft.current = d;
            }}
            onNeedEntity={(modo) => void persistCampionatura(modo)}
            sceltaOrdineFissa={Boolean(editing)}
          />
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            {destinazione === "commerciale" ? (
              <span className="mb-1 block text-xs text-[var(--muted)]">
                Per una richiesta particolare indica qui il peso diverso da
                quello standard.
              </span>
            ) : null}
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
                : editing
                  ? "Salva modifiche"
                  : destinazione === "commerciale"
                    ? "Registra campionatura"
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
                  prodotti: righe
                    .map((r) => {
                      const p = prodotti.find((x) => x.id === r.prodottoId);
                      return [p?.codice, p?.nome].filter(Boolean).join(" ");
                    })
                    .filter(Boolean),
                  extra: [
                    cliente.ragioneSociale,
                    ...righe
                      .filter((r) => r.quantita !== "" && Number(r.quantita) > 0)
                      .map((r) => `${r.quantita} ${r.unitaMisura}`),
                  ],
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
          anagrafica={anagraficaMailDi({
            fonte: anagraficaFonte,
            possibileId: possibileClienteId,
            clienteId: cliente?.id ?? "",
          })}
          emailAzienda={cliente?.email ?? ""}
          emailPec={cliente?.pec ?? ""}
          emailGeneriche={cliente?.emailGeneriche ?? []}
          solaLettura={Boolean(editing)}
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
