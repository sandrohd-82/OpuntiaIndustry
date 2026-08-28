"use client";

import { useEffect, useState } from "react";
import {
  getWebmailMessaggioHtmlAction,
  type WebmailMessaggioAllegatoPublic,
} from "@/app/actions/webmail";

type Props = {
  messaggioId: string;
  /** Fallback se non c’è HTML */
  bodyText: string;
  forcePlain?: boolean;
  onError?: (msg: string) => void;
  reloadToken?: number;
};

/**
 * Corpo mail HTML in iframe sandbox (CSS/head isolati) + elenco allegati non inline.
 */
export function WebmailHtmlBody({
  messaggioId,
  bodyText,
  forcePlain = false,
  onError,
  reloadToken = 0,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [hasHtml, setHasHtml] = useState(false);
  const [html, setHtml] = useState("");
  const [allegati, setAllegati] = useState<WebmailMessaggioAllegatoPublic[]>(
    []
  );

  useEffect(() => {
    if (forcePlain) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getWebmailMessaggioHtmlAction(messaggioId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        onError?.(res.error);
        setHasHtml(false);
        setHtml("");
        setAllegati([]);
        return;
      }
      setHasHtml(res.hasHtml);
      setHtml(res.htmlRewritten);
      setAllegati(res.allegati);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError è callback UI
  }, [messaggioId, forcePlain, reloadToken]);

  if (forcePlain) {
    return (
      <pre className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
        {bodyText || "(vuoto)"}
      </pre>
    );
  }

  if (loading) {
    return (
      <p className="mt-2 text-xs text-[var(--muted)]">Caricamento messaggio…</p>
    );
  }

  if (!hasHtml || !html.trim()) {
    return (
      <pre className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
        {bodyText || "(vuoto)"}
      </pre>
    );
  }

  const downloadable = allegati.filter((a) => !a.isInline && a.url);

  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <iframe
          title="Corpo messaggio HTML"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-downloads"
          srcDoc={html}
          className="min-h-[50vh] w-full border-0 bg-white"
        />
      </div>
      {downloadable.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {downloadable.map((a) => (
            <li key={a.id}>
              <a
                href={a.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-sky-800 hover:bg-sky-50"
              >
                {a.filename || "Allegato"}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
