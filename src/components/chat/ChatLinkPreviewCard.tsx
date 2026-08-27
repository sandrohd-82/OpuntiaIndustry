"use client";

import { useEffect, useState } from "react";
import { fetchChatLinkPreviewAction } from "@/app/actions/chat-link-preview";

type Props = {
  url: string;
  mine?: boolean;
};

export function ChatLinkPreviewCard({ url, mine = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void (async () => {
      const res = await fetchChatLinkPreviewAction(url);
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setFailed(true);
        return;
      }
      setTitle(res.preview.title);
      setDescription(res.preview.description);
      setImageUrl(res.preview.imageUrl);
      setSiteName(res.preview.siteName);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed && !loading) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`mt-1.5 block truncate text-xs underline ${
          mine ? "text-white/90" : "text-[var(--primary)]"
        }`}
      >
        {url}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`mt-1.5 block overflow-hidden rounded-lg border text-left no-underline transition hover:opacity-95 ${
        mine
          ? "border-white/25 bg-white/10"
          : "border-slate-200 bg-white"
      }`}
    >
      {loading ? (
        <div
          className={`px-2.5 py-3 text-[11px] ${
            mine ? "text-white/70" : "text-slate-400"
          }`}
        >
          Carico anteprima…
        </div>
      ) : (
        <>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-28 w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="space-y-0.5 px-2.5 py-2">
            {siteName ? (
              <p
                className={`truncate text-[10px] uppercase tracking-wide ${
                  mine ? "text-white/60" : "text-slate-400"
                }`}
              >
                {siteName}
              </p>
            ) : null}
            <p
              className={`line-clamp-2 text-xs font-semibold leading-snug ${
                mine ? "text-white" : "text-slate-900"
              }`}
            >
              {title || url}
            </p>
            {description ? (
              <p
                className={`line-clamp-2 text-[11px] leading-snug ${
                  mine ? "text-white/75" : "text-slate-500"
                }`}
              >
                {description}
              </p>
            ) : null}
          </div>
        </>
      )}
    </a>
  );
}
