"use client";

import { useCallback, useEffect, useState } from "react";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import {
  confirmPromozioneLeadAction,
  listMiePromozioniAperteAction,
} from "@/app/actions/lead-promozione";
import { listClientiPossibiliAction } from "@/app/actions/promemorie-e-note";
import type { LeadPromozioneAperta } from "@/lib/amministrazione/lead-promozione";
import {
  clienteSchedaFromPossibile,
  type ClientePossibile,
} from "@/lib/promemorie-e-note/types";

function formatEuro(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function LeadPromozioneGate() {
  const [pratica, setPratica] = useState<LeadPromozioneAperta | null>(null);
  const [lead, setLead] = useState<ClientePossibile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await listMiePromozioniAperteAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    const next = res.items[0] ?? null;
    setPratica(next);
    setError(null);
    if (!next) {
      setLead(null);
      return;
    }
    const leads = await listClientiPossibiliAction();
    if (!leads.success) {
      setLead(null);
      return;
    }
    setLead(leads.items.find((item) => item.id === next.leadId) ?? null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!pratica) return null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[120] border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow">
        <p className="font-semibold">
          Passaggio obbligatorio: {pratica.ragioneSociale} deve diventare
          cliente
        </p>
        <p className="mt-1">
          Rilevata fattura
          {pratica.numeroFattura ? ` ${pratica.numeroFattura}` : ""}
          {pratica.dataFattura ? ` del ${pratica.dataFattura}` : ""}
          {pratica.totale != null ? ` · ${formatEuro(pratica.totale)}` : ""}.
          Completa i dati mancanti e conferma: solo la fattura promuove il
          possibile cliente.
        </p>
        {error ? <p className="mt-2 text-red-700">{error}</p> : null}
      </div>
      {lead ? (
        <ClienteFormModal
          mode="edit"
          variant="possibile"
          stackTop
          initial={clienteSchedaFromPossibile(lead)}
          onClose={() => undefined}
          onSave={async (values) => {
            const res = await confirmPromozioneLeadAction({
              promozioneId: pratica.id,
              leadId: pratica.leadId,
              values,
            });
            if (!res.success) {
              setError(res.error);
              return false;
            }
            setPratica(null);
            setLead(null);
            void reload();
            return { id: lead.id };
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[110] bg-slate-950/60" />
      )}
    </>
  );
}
