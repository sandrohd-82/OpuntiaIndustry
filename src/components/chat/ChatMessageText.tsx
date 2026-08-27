"use client";

import { useMemo, type ReactNode } from "react";
import { extractHttpUrls } from "@/lib/chat/media-preview";
import { ChatLinkPreviewCard } from "@/components/chat/ChatLinkPreviewCard";

type Props = {
  content: string;
  mine?: boolean;
};

function linkify(text: string, mine: boolean): ReactNode[] {
  const re = /(https?:\/\/[^\s<>"'`)\]]+)/gi;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const raw = m[1];
    const cleaned = raw.replace(/[.,;:!?)]+$/g, "");
    const trailing = raw.slice(cleaned.length);
    nodes.push(
      <a
        key={`u-${i++}`}
        href={cleaned}
        target="_blank"
        rel="noreferrer"
        className={`break-all underline underline-offset-2 ${
          mine ? "text-white" : "text-[var(--primary)]"
        }`}
      >
        {cleaned}
      </a>
    );
    if (trailing) nodes.push(trailing);
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function ChatMessageText({ content, mine = false }: Props) {
  const urls = useMemo(() => extractHttpUrls(content), [content]);
  if (!content.trim()) return null;

  return (
    <div className="relative space-y-1">
      <p className="whitespace-pre-wrap break-words">{linkify(content, mine)}</p>
      {urls.map((u) => (
        <ChatLinkPreviewCard key={u} url={u} mine={mine} />
      ))}
    </div>
  );
}
