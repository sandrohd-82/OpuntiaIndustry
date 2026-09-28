"use client";

import { useEffect, useState } from "react";
import {
  cediOAffiancaAnagraficaAction,
  contestoCessioneAffiancamentoAction,
} from "@/app/actions/cliente-affiancamento";

type Destinatario = {
  id: string;
  nome: string;
  grado: "professional" | "executive";
};

const GRADO: Record<Destinatario["grado"], string> = {
  professional: "Professional",
  executive: "Executive",
};

export function ClienteCediAffiancaFields({
  kind,
  recordId,
  onCommercialeCeduto,
}: {
  kind: "cliente" | "possibile";
  recordId: string;
  onCommercialeCeduto?: (
    commercialeId: string,
    intermediarioAzzerato: boolean
  ) => void;
}) {
  const [puoAgire, setPuoAgire] = useState(false);
  const [destinatari, setDestinatari] = useState<Destinatario[]>([]);
  const [targetId, setTargetId] = useState("");
  const [affiancatoNome, setAffiancatoNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [versione, setVersione] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void contestoCessioneAffiancamentoAction({ kind, id: recordId }).then(
      (res) => {
        if (cancelled || !res.success) return;
        setPuoAgire(res.puoAgire);
        setDestinatari(res.destinatari);
        setAffiancatoNome(res.affiancatoNome);
        setTargetId((cur) =>
          res.destinatari.some((d) => d.id === cur) ? cur : ""
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [kind, recordId, versione]);

  if (!puoAgire) return null;

  async function esegui(mode: "cedi" | "affianca" | "togli") {
    setBusy(true);
    setError(null);
    setNota(null);
    const res = await cediOAffiancaAnagraficaAction({
      kind,
      id: recordId,
      mode,
      targetUserId: mode === "togli" ? null : targetId || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    if (mode === "cedi" && res.commercialeId) {
      onCommercialeCeduto?.(res.commercialeId, res.intermediarioAzzerato);
      setNota("Scheda ceduta. Il sottoposto è il commerciale.");
    } else if (mode === "affianca") {
      setNota("Affiancato. Il commerciale della scheda non cambia.");
    } else {
      setNota("Affiancamento tolto.");
    }
    setVersione((v) => v + 1);
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-3 sm:col-span-2">
      <p className="text-sm font-medium">Cedi o affianca</p>
      <p className="text-xs text-[var(--muted)]">
        Cedere sposta il commerciale sul sottoposto. Affiancare lo aggiunge:
        la scheda resta tua e la vede anche lui.
      </p>
      {affiancatoNome ? (
        <p className="text-sm">
          Affiancato: <span className="font-medium">{affiancatoNome}</span>
        </p>
      ) : null}
      {destinatari.length > 0 ? (
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        >
          <option value="">Scegli un sottoposto</option>
          {destinatari.map((d) => (
            <option key={d.id} value={d.id}>
              {GRADO[d.grado]} · {d.nome}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {destinatari.length > 0 ? (
          <>
            <button
              type="button"
              disabled={busy || !targetId}
              onClick={() => void esegui("cedi")}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Cedi
            </button>
            <button
              type="button"
              disabled={busy || !targetId}
              onClick={() => void esegui("affianca")}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Affianca
            </button>
          </>
        ) : null}
        {affiancatoNome ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void esegui("togli")}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Togli affiancamento
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {nota ? <p className="text-sm text-[var(--muted)]">{nota}</p> : null}
    </div>
  );
}
