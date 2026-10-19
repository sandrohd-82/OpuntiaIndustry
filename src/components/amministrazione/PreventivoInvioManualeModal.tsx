"use client";

import { useEffect, useState } from "react";
import {
  collegaInvioManualePreventivoAction,
  listMailInviatePerPreventivoAction,
  type MailInviataCollegabile,
} from "@/app/actions/preventivi";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";

export function PreventivoInvioManualeModal({
  preventivoId,
  numero,
  onClose,
  onSaved,
}: {
  preventivoId: string;
  numero: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [messaggi, setMessaggi] = useState<MailInviataCollegabile[]>([]);
  const [verso, setVerso] = useState("");
  const [scelto, setScelto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listMailInviatePerPreventivoAction(preventivoId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setMessaggi(res.messaggi);
      setVerso(res.verso);
    });
    return () => {
      cancelled = true;
    };
  }, [preventivoId]);

  const mirate =
    verso.includes("@") &&
    messaggi.some((row) => row.destinatario.toLowerCase().includes(verso));

  return (
    <PreventivoEditModal
      sopra
      title={`Preventivo inviato · ${numero}`}
      confirmLabel={saving ? "Salvataggio…" : "Collega e segna inviato"}
      confirmDisabled={saving || loading || !scelto}
      notice={error}
      onClose={onClose}
      onConfirm={() => {
        setSaving(true);
        setError(null);
        void collegaInvioManualePreventivoAction({
          preventivoId,
          messaggioId: scelto,
        }).then((res) => {
          setSaving(false);
          if (!res.success) {
            setError(res.error);
            return;
          }
          onSaved();
        });
      }}
    >
      <p className="text-sm text-slate-700">
        Scegli la mail già inviata con cui hai mandato questo preventivo. Il
        passaggio a Inviato è facoltativo, ma va fatto appena l&apos;invio è
        partito.
      </p>
      {loading ? (
        <p className="text-sm text-slate-500">Caricamento mail inviate…</p>
      ) : messaggi.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nessuna mail inviata negli ultimi 30 giorni dalla tua casella.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {verso.includes("@") && !mirate ? (
            <p className="text-xs text-amber-800">
              Nessuna mail verso {verso}. Qui sotto ci sono le ultime inviate
              dalla casella.
            </p>
          ) : null}
          {messaggi.map((row) => (
            <label
              key={row.id}
              className="flex cursor-pointer gap-2 rounded border border-slate-200 px-2 py-2 text-sm"
            >
              <input
                type="radio"
                name="mail-invio"
                checked={scelto === row.id}
                onChange={() => setScelto(row.id)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">
                  {row.oggetto}
                </span>
                <span className="block text-xs text-slate-500">
                  {row.destinatario || "Destinatario non indicato"}
                  {row.inviataIl
                    ? ` · ${new Date(row.inviataIl).toLocaleString("it-IT")}`
                    : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </PreventivoEditModal>
  );
}
