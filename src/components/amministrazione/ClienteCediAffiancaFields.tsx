"use client";

import { useEffect, useState } from "react";
import {
  cediOAffiancaAnagraficaAction,
  contestoCessioneAffiancamentoAction,
} from "@/app/actions/cliente-affiancamento";
import { InfoHint } from "@/components/ui/InfoHint";

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
  onChanged,
}: {
  kind: "cliente" | "possibile";
  recordId: string;
  onCommercialeCeduto?: (
    commercialeId: string,
    intermediarioAzzerato: boolean
  ) => void;
  onChanged?: () => void;
}) {
  const [pronto, setPronto] = useState(false);
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
        if (cancelled) return;
        setPronto(true);
        if (!res.success) return;
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

  if (!pronto || !puoAgire) return null;

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
    onChanged?.();
    setVersione((v) => v + 1);
  }

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-950">
      <p className="text-sm">
        Cedere sposta il commerciale sul sottoposto. Affiancare lo aggiunge:
        la scheda resta tua e la vede anche lui.
      </p>
      {affiancatoNome ? (
        <p className="mt-2 text-sm">
          Affiancato: <span className="font-medium">{affiancatoNome}</span>
        </p>
      ) : null}
      {destinatari.length > 0 ? (
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600"
        >
          <option value="">Scegli un sottoposto</option>
          {destinatari.map((d) => (
            <option key={d.id} value={d.id}>
              {GRADO[d.grado]} · {d.nome}
            </option>
          ))}
        </select>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {destinatari.length > 0 ? (
          <>
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={busy || !targetId}
                onClick={() => void esegui("cedi")}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Cedi
              </button>
              <InfoHint title="Cedi" overlayClassName="z-[200]">
                Cedi assegna la scheda al sottoposto: da quel momento è lui il
                commerciale. Tu la continui a vedere perché sei sopra di lui.
                La provvigione non si sposta da sola.
              </InfoHint>
            </span>
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={busy || !targetId}
                onClick={() => void esegui("affianca")}
                className="rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-sm font-medium text-emerald-950 disabled:opacity-50"
              >
                Affianca
              </button>
              <InfoHint title="Affianca" overlayClassName="z-[200]">
                Affianca lascia te come commerciale e aggiunge il sottoposto.
                Entrambi vedete e lavorate la scheda. La provvigione non
                cambia. Si può affiancare una sola persona.
              </InfoHint>
            </span>
          </>
        ) : null}
        {affiancatoNome ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void esegui("togli")}
            className="rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-sm font-medium text-emerald-950 disabled:opacity-50"
          >
            Togli affiancamento
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {nota ? <p className="mt-2 text-sm">{nota}</p> : null}
    </div>
  );
}
