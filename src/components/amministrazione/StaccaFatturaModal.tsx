"use client";

import { useEffect, useState } from "react";
import {
  convertProformaInFatturaAction,
  getFatturaA4ContextAction,
  inviaFatturaAttraversoSdiAction,
} from "@/app/actions/fattura-da-ordine";
import {
  getPrenotazioneSpedizioneMailAction,
  listCaselleSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { ConfermaPromozioneSdiModal } from "@/components/amministrazione/ConfermaPromozioneSdiModal";
import { FatturaA4Modal } from "@/components/amministrazione/FatturaA4Modal";
import { testoMailFatturaCortesia } from "@/lib/amministrazione/ordine-mail-bozza";
import type { Ordine } from "@/lib/amministrazione/ordini";
import {
  EMAIL_CONTROLLO_DEFAULT,
  FASE_TEST_INVIO,
} from "@/lib/amministrazione/prova-ordine";

export function StaccaFatturaModal({
  ordine,
  onClose,
  onFatto,
}: {
  ordine: Ordine;
  onClose: () => void;
  onFatto: (messaggio: string) => void;
}) {
  const promozioneRichiesta =
    !ordine.clienteId &&
    Boolean(ordine.possibileClienteId) &&
    ordine.tipo !== "campionatura";
  const [promozioneOk, setPromozioneOk] = useState(false);
  const [fase, setFase] = useState<"fattura" | "mail">("fattura");
  const [sceltaMail, setSceltaMail] = useState<boolean | null>(null);
  const [chiediPromozione, setChiediPromozione] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [proformaId, setProformaId] = useState<string | null>(null);
  const [inviaCopia, setInviaCopia] = useState(false);
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [caselle, setCaselle] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let cancel = false;
    const testo = testoMailFatturaCortesia({
      numeroOrdine: ordine.numeroInterno,
      prodotti: "indicate in fattura",
    });
    setOggetto(testo.subject);
    setCorpo(testo.bodyText);
    void (async () => {
      const [ctx, pren, elenco] = await Promise.all([
        getFatturaA4ContextAction({ ordineId: ordine.id }),
        getPrenotazioneSpedizioneMailAction({
          entityType: "ordine",
          entityId: ordine.id,
        }),
        listCaselleSpedizioneMailAction(),
      ]);
      if (cancel) return;
      if (ctx.success && ctx.proformaId) setProformaId(ctx.proformaId);
      if (elenco.success) setCaselle(elenco.accounts);
      if (pren.success && pren.item) {
        if (pren.item.accountId) setAccountId(pren.item.accountId);
        const salvati = `${pren.item.oggetto}\n${pren.item.corpo}`;
        const tracking =
          pren.item.allegaTracking && pren.item.trackingUrl.trim()
            ? pren.item.trackingUrl.trim()
            : "";
        if (/proforma/i.test(salvati)) {
          const fattura = testoMailFatturaCortesia({
            numeroOrdine: ordine.numeroInterno,
            prodotti: "indicate in fattura",
            trackingUrl: tracking,
          });
          setOggetto(fattura.subject);
          setCorpo(fattura.bodyText);
        } else if (pren.item.oggetto.trim() && pren.item.corpo.trim()) {
          setOggetto(pren.item.oggetto);
          setCorpo(pren.item.corpo);
        }
      }
      setPronto(true);
    })();
    return () => {
      cancel = true;
    };
  }, [ordine.id, ordine.numeroInterno]);

  async function conferma(confermaPromozione: boolean) {
    if (promozioneRichiesta && !confermaPromozione) {
      setChiediPromozione(true);
      return;
    }
    setOccupato(true);
    setErrore(null);
    let fatturaId = ordine.fatturaElenco?.id ?? "";
    if (proformaId) {
      const conv = await convertProformaInFatturaAction({ proformaId });
      if (!conv.success) {
        setOccupato(false);
        setErrore(conv.error);
        return;
      }
      fatturaId = conv.fatturaId;
    }
    if (!fatturaId) {
      setOccupato(false);
      setErrore("Manca la proforma o la fattura da staccare.");
      return;
    }
    if (inviaCopia && !accountId) {
      setOccupato(false);
      setErrore(
        "Scegli la casella di partenza. La mail non parte da un'altra casella."
      );
      return;
    }
    const res = await inviaFatturaAttraversoSdiAction(
      fatturaId,
      true,
      confermaPromozione,
      inviaCopia
        ? {
            invia: true,
            oggetto,
            corpo,
            accountId,
          }
        : undefined
    );
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const testo = res.sdiSent
      ? `Fattura ${res.numeroFattura} inviata allo SDI.${res.warning ? ` ${res.warning}` : ""}`
      : (res.warning ||
        `Fattura di ${ordine.numeroInterno}: lo SDI non è partito.`);
    onFatto(testo);
  }

  if (fase === "fattura") {
    return (
      <FatturaA4Modal
        ordineId={ordine.id}
        etichettaDocumento="fattura"
        bloccaInvio
        onApprova={() => setFase("mail")}
        onClose={onClose}
      />
    );
  }

  if (chiediPromozione) {
    return (
      <ConfermaPromozioneSdiModal
        nome={ordine.cliente}
        occupato={occupato}
        etichettaConferma="Continua"
        nota={
          FASE_TEST_INVIO
            ? "In questa prova lo SDI non parte, quindi il possibile cliente resta tale."
            : undefined
        }
        onAnnulla={() => {
          if (!occupato) setChiediPromozione(false);
        }}
        onConferma={() => {
          setPromozioneOk(true);
          setChiediPromozione(false);
          void conferma(true);
        }}
      />
    );
  }

  let etichettaInvio = "Scegli se inviare la mail";
  if (sceltaMail === true) etichettaInvio = "Invia mail e fattura allo SDI";
  if (sceltaMail === false) etichettaInvio = "Invia fattura allo SDI";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">Bozza mail</h2>
        <p className="mt-3 text-sm text-slate-800">
          La fattura di {ordine.numeroInterno} è approvata. Se invii la mail, qui
          sotto c&apos;è la bozza. Poi parte insieme alla fattura allo SDI.
        </p>
        {FASE_TEST_INVIO ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            Fase di prova: il clic su invia allo SDI non trasmette nulla e non
            assegna il numero fiscale. La mail, se la prepari, parte solo verso{" "}
            {EMAIL_CONTROLLO_DEFAULT}.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={() => {
              setSceltaMail(true);
              setInviaCopia(true);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              sceltaMail === true
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-800"
            }`}
          >
            Invia la mail
          </button>
          <button
            type="button"
            disabled={occupato}
            onClick={() => {
              setSceltaMail(false);
              setInviaCopia(false);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              sceltaMail === false
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-800"
            }`}
          >
            Senza mail
          </button>
        </div>
        {sceltaMail ? (
          <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            {FASE_TEST_INVIO ? (
              <>
                <p className="text-sm text-slate-800">
                  Indirizzo: {EMAIL_CONTROLLO_DEFAULT}
                </p>
                <p className="text-xs text-slate-600">
                  In questa prova la copia non va al cliente. Oggetto, testo e
                  casella sono quelli della mail fattura dell&apos;ultima fase
                  dell&apos;ordine.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-600">
                Oggetto, testo e casella sono quelli della mail fattura
                dell&apos;ultima fase dell&apos;ordine. L&apos;indirizzo è quello
                del cliente.
              </p>
            )}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Casella di partenza</span>
              <select
                value={accountId}
                disabled={occupato}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Seleziona casella…</option>
                {caselle.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Oggetto</span>
              <input
                value={oggetto}
                disabled={occupato}
                onChange={(e) => setOggetto(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Testo</span>
              <textarea
                value={corpo}
                disabled={occupato}
                onChange={(e) => setCorpo(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        ) : null}
        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errore}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={() => setFase("fattura")}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Torna alla fattura
          </button>
          <button
            type="button"
            disabled={occupato}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={occupato || !pronto || sceltaMail === null}
            onClick={() => void conferma(promozioneOk)}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {occupato ? "Invio…" : etichettaInvio}
          </button>
        </div>
      </div>
    </div>
  );
}
