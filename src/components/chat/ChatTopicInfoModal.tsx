"use client";

import { useEffect, useState } from "react";
import { FaCircleInfo, FaXmark } from "react-icons/fa6";
import {
  getChatTopicInfoAction,
  type TopicInfoView,
} from "@/app/actions/chat-topic-info";

type Props = {
  open: boolean;
  onClose: () => void;
  topicId: string;
  onError: (msg: string) => void;
};

function formatItDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ChatTopicInfoModal({ open, onClose, topicId, onError }: Props) {
  const [info, setInfo] = useState<TopicInfoView | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setInfo(null);
    void getChatTopicInfoAction(topicId).then((res) => {
      setLoading(false);
      if (!res.success) {
        onError(res.error);
        return;
      }
      setInfo(res.info);
    });
  }, [open, topicId, onError]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FaCircleInfo size={14} className="text-[var(--primary)]" />
            Info gruppo
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500">Caricamento…</p>
        ) : null}

        {info ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-[var(--border)] bg-slate-50/80 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900">{info.titolo}</p>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt>Creato il</dt>
                  <dd className="font-medium text-slate-800">
                    {formatItDate(info.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Creato da</dt>
                  <dd className="font-medium text-slate-800">
                    {info.createdByName}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Partecipanti</dt>
                  <dd className="font-medium text-slate-800">
                    {info.members.length}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Utenti nel gruppo
              </h3>
              <ul className="space-y-2">
                {info.members.map((m) => (
                  <li
                    key={m.userId}
                    className="rounded-xl border border-[var(--border)] px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {m.name}
                          {m.ruolo === "owner" ? (
                            <span className="ml-1 text-[10px] font-normal text-slate-500">
                              (owner)
                            </span>
                          ) : null}
                        </p>
                        {m.email ? (
                          <p className="truncate text-[10px] text-slate-500">
                            {m.email}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-800"
                        title="Messaggi inviati (testo, vocali, allegati)"
                      >
                        NumMess {m.numMess}
                      </span>
                    </div>

                    {m.attachments.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
                        {m.attachments.map((a) => (
                          <li
                            key={a.kind}
                            className="flex justify-between gap-2"
                          >
                            <span>{a.label}</span>
                            <span className="tabular-nums font-medium text-slate-800">
                              ({a.count})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        Nessun allegato inviato
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
