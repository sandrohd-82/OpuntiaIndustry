"use client";

import { useEffect, useState } from "react";
import { FaClockRotateLeft, FaFileInvoice, FaPen } from "react-icons/fa6";
import {
  listAziendeCommercialePersonaAction,
  type AziendaCommercialePortfolio,
} from "@/app/actions/commerciale-anagrafica";
import { updateClienteAction } from "@/app/actions/clienti";
import { AziendaFattureModal } from "@/components/amministrazione/AziendaFattureModal";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { useAnagraficaPrivileges } from "@/components/layout/ActionAccessProvider";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import {
  commercialeAziendaOrigineLabel,
  isCommercialOwnRecord,
  isRepartoCommerciale,
} from "@/lib/auth/commerciale";
import type { OrganigrammaPersona } from "@/lib/amministrazione/organigramma";

type Props = {
  persona: OrganigrammaPersona;
  lineageIds: string[];
};

export function AziendeCommercialeCard({ persona, lineageIds }: Props) {
  const priv = useAnagraficaPrivileges("cliente");
  const [aziende, setAziende] = useState<AziendaCommercialePortfolio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<AziendaCommercialePortfolio | null>(
    null
  );
  const [timelineFor, setTimelineFor] =
    useState<AziendaCommercialePortfolio | null>(null);
  const [fattureFor, setFattureFor] =
    useState<AziendaCommercialePortfolio | null>(null);
  const [refresh, setRefresh] = useState(0);

  const showForCommerciale =
    Boolean(persona.userId) &&
    (isRepartoCommerciale({
      codice: persona.repartoCodice,
      nome: persona.repartoNome,
    }) ||
      Boolean(persona.commercialeGrado));

  useEffect(() => {
    if (!persona.userId) {
      setAziende([]);
      setReady(true);
      return;
    }
    void (async () => {
      const res = await listAziendeCommercialePersonaAction({
        personaId: persona.id,
      });
      if (!res.success) {
        setError(res.error);
        setAziende([]);
        setReady(true);
        return;
      }
      setError(null);
      setAziende(res.aziende);
      setReady(true);
    })();
  }, [persona.id, persona.userId, refresh]);

  if (!persona.userId) return null;
  if (ready && aziende.length === 0 && !showForCommerciale && !error) {
    return null;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-base font-semibold">Aziende del commerciale</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Stesso perimetro delle aziende caricate da lui: modifica, timeline e
        fatture anche per le schede solo collegate.
      </p>
      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : !ready ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Caricamento…</p>
      ) : aziende.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Nessuna azienda caricata o collegata.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {aziende.map((az) => {
            const treatAsOwn = isCommercialOwnRecord({
              userId: priv.userId,
              createdBy: az.createdBy,
              commercialeId: az.commercialeId,
              lineageIds,
            });
            const canTl = priv.canTimelineRecord(treatAsOwn);
            const canEdit = priv.canEdit(az.createdBy, treatAsOwn);
            return (
              <li
                key={az.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              >
                <CodiceTargaBadge code={az.codiceTarga} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{az.ragioneSociale}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {commercialeAziendaOrigineLabel(az.origine)}
                    {az.partitaIva ? ` · P.IVA ${az.partitaIva}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {canTl ? (
                    <button
                      type="button"
                      onClick={() => setTimelineFor(az)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FaClockRotateLeft size={11} />
                      Timeline
                    </button>
                  ) : null}
                  {canTl ? (
                    <button
                      type="button"
                      onClick={() => setFattureFor(az)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FaFileInvoice size={11} />
                      Fatture
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing(az)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
                    >
                      <FaPen size={11} />
                      Modifica
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <ClienteFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const res = await updateClienteAction(editing.id, values);
            if (!res.success) return false;
            setEditing(null);
            setRefresh((n) => n + 1);
            return { id: editing.id };
          }}
        />
      ) : null}

      {timelineFor ? (
        <AziendaTimelineModal
          aziendaTipo="cliente"
          aziendaId={timelineFor.id}
          aziendaLabel={timelineFor.ragioneSociale}
          onClose={() => setTimelineFor(null)}
        />
      ) : null}

      {fattureFor ? (
        <AziendaFattureModal
          clienteId={fattureFor.id}
          clienteLabel={fattureFor.ragioneSociale}
          onClose={() => setFattureFor(null)}
          onOpenTimeline={() => {
            setTimelineFor(fattureFor);
            setFattureFor(null);
          }}
        />
      ) : null}
    </section>
  );
}
