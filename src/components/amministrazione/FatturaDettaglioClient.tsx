"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fatturaRichiedePromozioneSdiAction, inviaFatturaSalvataAction } from "@/app/actions/fattura-da-ordine";
import { ConfermaPromozioneSdiModal } from "@/components/amministrazione/ConfermaPromozioneSdiModal";
import { getFatturaByIdAction } from "@/app/actions/fatture";
import { FatturaDettaglioView } from "@/components/amministrazione/FatturaDettaglioView";
import { DocumentoOriginaleFattura } from "@/components/amministrazione/DocumentoOriginaleFattura";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import { useActionAccess } from "@/components/layout/ActionAccessProvider";
import { PaperInvoiceViewer } from "@/components/PaperInvoiceViewer";
import { AZ } from "@/lib/auth/action-access";
import type { Fattura } from "@/lib/amministrazione/fatture";
import { isFatturaProva } from "@/lib/amministrazione/prova-ordine";

type Props = {
  initial: Fattura;
};

export function FatturaDettaglioClient({ initial }: Props) {
  const router = useRouter();
  const { privilegedAllowed } = useActionAccess();
  const canModifica = privilegedAllowed(AZ.modificaFattura);
  const [fattura, setFattura] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [collegata, setCollegata] = useState<Fattura | null>(null);
  const [sostitutiva, setSostitutiva] = useState<Fattura | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [inviaBusy, setInviaBusy] = useState(false);
  const [inviaMsg, setInviaMsg] = useState<string | null>(null);
  const [passoInvio, setPassoInvio] = useState(0);
  const [chiediPromozione, setChiediPromozione] = useState(false);
  const [nomePromozione, setNomePromozione] = useState("");

  useEffect(() => {
    setFattura(initial);
  }, [initial]);

  useEffect(() => {
    if (fattura.kind !== "nota_credito") {
      setCollegata(null);
      setSostitutiva(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setPreviewError(null);
      const tasks: Promise<void>[] = [];
      if (fattura.fatturaCollegataId) {
        tasks.push(
          getFatturaByIdAction("emessa", fattura.fatturaCollegataId).then(
            (res) => {
              if (cancelled) return;
              if (res.success) setCollegata(res.fattura);
              else {
                setCollegata(null);
                setPreviewError(
                  (prev) =>
                    prev ??
                    `Anteprima fattura stornata: ${res.error}`
                );
              }
            }
          )
        );
      } else {
        setCollegata(null);
      }
      if (
        fattura.modalitaCollegamento === "sostituzione" &&
        fattura.fatturaSostitutivaId
      ) {
        tasks.push(
          getFatturaByIdAction("emessa", fattura.fatturaSostitutivaId).then(
            (res) => {
              if (cancelled) return;
              if (res.success) setSostitutiva(res.fattura);
              else {
                setSostitutiva(null);
                setPreviewError(
                  (prev) =>
                    prev ??
                    `Anteprima fattura di rimpiazzo: ${res.error}`
                );
              }
            }
          )
        );
      } else {
        setSostitutiva(null);
      }
      await Promise.all(tasks);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    fattura.kind,
    fattura.fatturaCollegataId,
    fattura.fatturaSostitutivaId,
    fattura.modalitaCollegamento,
  ]);

  async function inviaSdi(confermaPromozione: boolean) {
    setChiediPromozione(false);
    setInviaBusy(true);
    setInviaMsg(null);
    const res = await inviaFatturaSalvataAction({
      fatturaId: fattura.id,
      sendToSdi: true,
      sendCourtesyEmail: false,
      doppiaConferma: true,
      confermaPromozione,
    });
    setInviaBusy(false);
    if (!res.success) {
      setInviaMsg(res.error);
      setPassoInvio(0);
      return;
    }
    setPassoInvio(2);
    const esito =
      `Inviata ${res.numeroFattura}` +
      (res.sdiSent ? " allo SDI" : "") +
      (res.courtesyEmailSent ? " e per email" : "") +
      ".";
    setInviaMsg(res.warning ? `${esito} ${res.warning}` : esito);
    const refreshed = await getFatturaByIdAction("emessa", fattura.id);
    if (refreshed.success) setFattura(refreshed.fattura);
    router.refresh();
  }

  const prova = isFatturaProva(fattura);
  return (
    <div className="mx-auto w-[94%] max-w-none space-y-8">
      {prova ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Fattura di prova {fattura.numeroFattura || fattura.numeroInterno}. Non
          viene inviata allo SDI, non riceve un numero fiscale e non entra nel
          registro. Per rifarla usa Cancella e ripeti il test nella coda ordini.
        </p>
      ) : null}
      {inviaMsg ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          {inviaMsg}
        </p>
      ) : null}
      <FatturaDettaglioView
        fattura={fattura}
        layoutWidth="full"
        inviaBusy={inviaBusy}
        inviaLabel={
          passoInvio === 1
            ? "Confermo l'invio allo SDI"
            : "Invia fattura attraverso SDI"
        }
        onInviaFic={
          !prova && fattura.kind === "emessa" && !fattura.ficId
            ? () => {
                void (async () => {
                  if (passoInvio < 1) {
                    try {
                      const probe = await fatturaRichiedePromozioneSdiAction(fattura.id);
                      if (probe.promuove) {
                        setNomePromozione(probe.nome);
                        setChiediPromozione(true);
                        return;
                      }
                    } catch (err) {
                      setInviaMsg(
                        err instanceof Error ? err.message : "Verifica del cliente non riuscita."
                      );
                      return;
                    }
                    setPassoInvio(1);
                    setInviaMsg(
                      "Prima conferma. Premi di nuovo: solo allora la fattura prende il numero progressivo e parte allo SDI. Nessuna mail parte da qui."
                    );
                    return;
                  }
                  void inviaSdi(false);
                })();
              }
            : undefined
        }
        onEdit={
          canModifica
            ? () => {
                void (async () => {
                  const res = await getFatturaByIdAction(
                    fattura.kind,
                    fattura.id
                  );
                  if (res.success) setFattura(res.fattura);
                  setEditing(true);
                })();
              }
            : undefined
        }
        extraActions={
          fattura.kind === "ricevuta" ? (
            <DocumentoOriginaleFattura
              fatturaId={fattura.id}
              allegato={fattura.documentoOriginale}
              onChanged={(allegato) =>
                setFattura((prev) => ({ ...prev, documentoOriginale: allegato }))
              }
            />
          ) : null
        }
      />

      {fattura.kind === "ricevuta" ? (
        <PaperInvoiceViewer fattura={fattura} />
      ) : null}

      {previewError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {previewError}
        </p>
      ) : null}

      {collegata ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Anteprima fattura stornata / collegata
          </h3>
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50/50 p-4 sm:p-6">
            <FatturaDettaglioView
              fattura={collegata}
              layoutWidth="full"
              variant="preview"
              previewTitle={`Fattura collegata · ${collegata.numeroInterno}`}
            />
          </div>
        </section>
      ) : null}

      {sostitutiva ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Anteprima fattura di rimpiazzo
          </h3>
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 sm:p-6">
            <FatturaDettaglioView
              fattura={sostitutiva}
              layoutWidth="full"
              variant="preview"
              previewTitle={`Fattura sostitutiva · ${sostitutiva.numeroInterno}`}
            />
          </div>
        </section>
      ) : null}

      {editing ? (
        <FatturaRegistrazioneModal
          kind={fattura.kind}
          initial={fattura}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setFattura(updated);
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
      {chiediPromozione ? (
        <ConfermaPromozioneSdiModal
          nome={nomePromozione}
          occupato={inviaBusy}
          onAnnulla={() => setChiediPromozione(false)}
          onConferma={() => void inviaSdi(true)}
        />
      ) : null}
    </div>
  );
}
