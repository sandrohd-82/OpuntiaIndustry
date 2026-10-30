"use client";

import { useEffect, useState } from "react";
import {
  inviaProformaOrdineAction,
  scaricaProformaOrdineAction,
} from "@/app/actions/fattura-da-ordine";
import { listCaselleSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import {
  EMAIL_CONTROLLO_DEFAULT,
  FASE_TEST_INVIO,
} from "@/lib/amministrazione/prova-ordine";

function scaricaBase64(fileName: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProformaElencoAzioni({
  ordineId,
  numero,
  compatto = false,
}: {
  ordineId: string;
  numero: string;
  compatto?: boolean;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scaricando, setScaricando] = useState(false);
  const [invioAperto, setInvioAperto] = useState(false);
  const btn = compatto
    ? "rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    : "rounded-lg border border-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] disabled:opacity-50";

  async function scarica() {
    setErrore(null);
    setMsg(null);
    setScaricando(true);
    const res = await scaricaProformaOrdineAction(ordineId);
    setScaricando(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    scaricaBase64(res.fileName, res.base64);
  }

  return (
    <>
      <button
        type="button"
        className={btn}
        disabled={scaricando}
        title={`Scarica la proforma ${numero}`}
        onClick={(e) => {
          e.stopPropagation();
          void scarica();
        }}
      >
        {scaricando ? "Scarico…" : `Scarica proforma ${numero}`}
      </button>
      <button
        type="button"
        className={btn}
        title="Invia la proforma a mano"
        onClick={(e) => {
          e.stopPropagation();
          setErrore(null);
          setMsg(null);
          setInvioAperto(true);
        }}
      >
        Invia proforma
      </button>
      {errore ? (
        <span className="text-xs text-red-700">{errore}</span>
      ) : null}
      {msg ? <span className="text-xs text-emerald-800">{msg}</span> : null}
      {invioAperto ? (
        <InviaProformaElencoModal
          ordineId={ordineId}
          numero={numero}
          onClose={() => setInvioAperto(false)}
          onInviata={(testo) => {
            setInvioAperto(false);
            setMsg(testo);
          }}
        />
      ) : null}
    </>
  );
}

function InviaProformaElencoModal({
  ordineId,
  numero,
  onClose,
  onInviata,
}: {
  ordineId: string;
  numero: string;
  onClose: () => void;
  onInviata: (testo: string) => void;
}) {
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [accountId, setAccountId] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listCaselleSpedizioneMailAction().then((res) => {
      if (cancelled || !res.success) {
        if (!cancelled && !res.success) setErrore(res.error);
        return;
      }
      setAccounts(res.accounts);
      setAccountId(res.accounts[0]?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function invia() {
    setErrore(null);
    setInvio(true);
    const res = await inviaProformaOrdineAction({ ordineId, accountId });
    setInvio(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    onInviata(
      res.prova
        ? `Proforma ${res.numero} inviata solo a ${EMAIL_CONTROLLO_DEFAULT}.`
        : `Proforma ${res.numero} inviata a ${res.destinatario}.`
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-900">
          Invia proforma {numero}
        </h3>
        <p className="text-sm text-slate-700">
          {FASE_TEST_INVIO
            ? `Fase di prova: la mail parte solo verso ${EMAIL_CONTROLLO_DEFAULT}. Lo SDI non parte.`
            : "La mail parte all'indirizzo del cliente già salvato sulla proforma. Lo SDI non parte."}
        </p>
        <label className="block text-sm">
          Casella mittente
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.length === 0 ? (
              <option value="">Nessuna casella</option>
            ) : null}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.email})
              </option>
            ))}
          </select>
        </label>
        {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onClick={onClose}
            disabled={invio}
          >
            Chiudi
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={invio || !accountId}
            onClick={() => void invia()}
          >
            {invio ? "Invio…" : "Invia proforma"}
          </button>
        </div>
      </div>
    </div>
  );
}
