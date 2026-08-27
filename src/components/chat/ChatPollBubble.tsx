"use client";

import { useEffect, useState } from "react";
import {
  getChatPollViewAction,
  voteChatPollAction,
  type ChatPollView,
} from "@/app/actions/chat-share";

type Props = {
  pollId: string;
  mine: boolean;
};

export function ChatPollBubble({ pollId, mine }: Props) {
  const [poll, setPoll] = useState<ChatPollView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const res = await getChatPollViewAction(pollId);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPoll(res.poll);
    setError(null);
  }

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 8000);
    return () => clearInterval(t);
  }, [pollId]);

  async function vote(optionId: string) {
    if (!poll || poll.myOptionId || poll.stato !== "aperto") return;
    setPending(true);
    const res = await voteChatPollAction({ pollId, optionId });
    setPending(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await reload();
  }

  if (!poll) {
    return (
      <p className={`text-xs ${mine ? "text-white/80" : "text-slate-500"}`}>
        {error ?? "Caricamento sondaggio…"}
      </p>
    );
  }

  const denom = Math.max(poll.participantCount, 1);

  return (
    <div className="relative space-y-2">
      <p className="text-sm font-semibold">{poll.titolo}</p>
      {poll.options.map((o) => {
        const pct = Math.round((o.votes / denom) * 100);
        const selected = poll.myOptionId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={pending || Boolean(poll.myOptionId) || poll.stato !== "aperto"}
            onClick={() => void vote(o.id)}
            className={`relative block w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left text-xs disabled:opacity-80 ${
              mine
                ? "border-white/30"
                : "border-slate-200"
            } ${selected ? "ring-1 ring-sky-400" : ""}`}
          >
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 ${
                mine ? "bg-white/20" : "bg-sky-100"
              }`}
              style={{ width: `${pct}%` }}
            />
            <span className="relative flex justify-between gap-2">
              <span>{o.label}</span>
              <span>
                {pct}% ({o.votes}/{denom})
              </span>
            </span>
          </button>
        );
      })}
      {poll.myOptionId ? (
        <p className={`text-[10px] ${mine ? "text-white/70" : "text-slate-500"}`}>
          Hai già votato · base 100% = partecipanti chat ({denom})
        </p>
      ) : (
        <p className={`text-[10px] ${mine ? "text-white/70" : "text-slate-500"}`}>
          Un solo voto · 100% = tutti i partecipanti
        </p>
      )}
      {error ? (
        <p className={`text-[10px] ${mine ? "text-red-100" : "text-red-700"}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
