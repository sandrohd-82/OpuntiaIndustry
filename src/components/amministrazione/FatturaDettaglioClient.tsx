"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFatturaByIdAction } from "@/app/actions/fatture";
import { FatturaDettaglioView } from "@/components/amministrazione/FatturaDettaglioView";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import type { Fattura } from "@/lib/amministrazione/fatture";

type Props = {
  initial: Fattura;
};

export function FatturaDettaglioClient({ initial }: Props) {
  const router = useRouter();
  const [fattura, setFattura] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [collegata, setCollegata] = useState<Fattura | null>(null);
  const [sostitutiva, setSostitutiva] = useState<Fattura | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto w-[94%] max-w-none space-y-8">
      <FatturaDettaglioView
        fattura={fattura}
        layoutWidth="full"
        onEdit={
          fattura.kind === "nota_credito"
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
      />

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
    </div>
  );
}
