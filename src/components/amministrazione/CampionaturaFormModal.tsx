"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createCampionaturaAction,
  previewNumeroCampionaturaAction,
} from "@/app/actions/campionature";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { CampionaturaAltroPostoModal } from "@/components/amministrazione/CampionaturaAltroPostoModal";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  CAMPIONATURA_MEZZI,
  CAMPIONATURA_MEZZO_LABEL,
  CAMPIONATURA_UM,
  clienteSpedizioneOptions,
  type Campionatura,
  type CampionaturaMezzo,
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
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [dataInvio, setDataInvio] = useState(todayInputValue);
  const [mezzo, setMezzo] = useState<CampionaturaMezzo | null>(null);
  const [nota, setNota] = useState<{ id: string; titolo: string } | null>(null);
  const [mail, setMail] = useState<{ id: string; subject: string } | null>(
    null
  );
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

  useEffect(() => {
    if (!cliente?.codiceTarga || !dataInvio) {
      setNumeroPreview(null);
      return;
    }
    let cancelled = false;
    void previewNumeroCampionaturaAction({
      codiceTargaCliente: cliente.codiceTarga,
      dataInvio,
    }).then((r) => {
      if (cancelled) return;
      setNumeroPreview(r.success ? r.numeroInterno : null);
    });
    return () => {
      cancelled = true;
    };
  }, [cliente?.codiceTarga, dataInvio]);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cliente) {
      setFormError("Seleziona un’azienda.");
      return;
    }
    if (!mezzo) {
      setFormError("Indica a mezzo di.");
      return;
    }
    if (!nota) {
      setFormError("Collega o crea una nota della timeline.");
      return;
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
        quantita: r.quantita === "" ? 0 : r.quantita,
        unitaMisura: r.unitaMisura,
        lottoCodice: r.lottoCodice,
        note: r.note,
      };
    });
    setSaving(true);
    setFormError(null);
    const result = await createCampionaturaAction({
      clienteId: cliente.id,
      cliente: cliente.ragioneSociale,
      codiceTargaCliente: cliente.codiceTarga,
      dataInvio,
      mezzo,
      pnNotaId: nota.id,
      webmailMessaggioId: mail?.id ?? null,
      spedizioneTipo: addressKey === "altro" ? "altro_posto" : "sede_azienda",
      spedizionePrivato,
      referenteRicezioneId: referenteRicezione?.id ?? null,
      destinatario: destinatario.trim() || cliente.ragioneSociale,
      indirizzoSpedizione: indirizzo,
      note,
      righe: mapped,
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    onSaved(result.item);
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
          Invio campionatura
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
          . Salvataggio = inviata e approvata (ISO 9001).
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Azienda</span>
              <ClienteSelectField
                value={cliente?.id ?? ""}
                onChange={applyCliente}
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Data richiesta
              </span>
              <span className="mb-1 block text-xs text-[var(--muted)]">
                Data in cui è arrivata la richiesta, non la spedizione.
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
              <span className="mb-1 block font-medium">A mezzo di</span>
              <div className="flex flex-wrap gap-2">
                {CAMPIONATURA_MEZZI.map((m) => (
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
                      setOrigineOpen(true);
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
              {nota || mail ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {nota ? (
                    <>
                      Nota: <span className="font-medium">{nota.titolo}</span>
                    </>
                  ) : null}
                  {nota && mail ? " · " : null}
                  {mail ? (
                    <>
                      Mail: <span className="font-medium">{mail.subject}</span>
                    </>
                  ) : null}
                </p>
              ) : mezzo ? (
                <p className="mt-2 text-xs text-amber-800">
                  Collega una nota della timeline (obbligatoria).
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
                      onChange={(e) =>
                        updateRiga(index, { prodottoId: e.target.value })
                      }
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
                      {CAMPIONATURA_UM.map((um) => (
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
                      required
                      value={riga.lottoCodice}
                      onChange={(e) =>
                        updateRiga(index, { lottoCodice: e.target.value })
                      }
                      placeholder="Codice lotto"
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
              {saving ? "Salvataggio…" : "Registra invio"}
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
                ? "Collega la mail oppure una nota della timeline. La nota è obbligatoria."
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
          aziendaTipo="cliente"
          aziendaId={cliente.id}
          aziendaLabel={cliente.ragioneSociale}
          onClose={() => setTimelinePick(null)}
          pickMode={
            timelinePick === "mail"
              ? {
                  purpose: "campionatura-mail",
                  onPicked: (picked) => {
                    setMail(picked);
                    setTimelinePick(null);
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
    </div>
  );
}
