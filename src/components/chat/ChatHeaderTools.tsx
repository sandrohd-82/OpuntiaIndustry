"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { FaFilePdf, FaMagnifyingGlass } from "react-icons/fa6";
import {
  ChatSearchExportModal,
  type ChatOpenContext,
} from "@/components/chat/ChatSearchExportModal";

type Props = {
  userId: string;
};

function resolveOpenContext(pathname: string): ChatOpenContext {
  const thread = pathname.match(/^\/app\/chat\/thread\/([^/]+)/);
  if (thread?.[1]) return { kind: "direct", id: thread[1] };
  const topic = pathname.match(/^\/app\/chat\/argomento\/([^/]+)/);
  if (topic?.[1]) return { kind: "topic", id: topic[1] };
  return null;
}

/** Icone lente + PDF a sinistra di Esci (solo area chat). */
export function ChatHeaderTools({ userId }: Props) {
  const pathname = usePathname() || "";
  const openContext = useMemo(
    () => resolveOpenContext(pathname),
    [pathname]
  );
  const [mode, setMode] = useState<"search" | "export" | null>(null);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode("search")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-slate-600 hover:bg-slate-50"
          title="Cerca nelle chat"
          aria-label="Cerca nelle chat"
        >
          <FaMagnifyingGlass size={13} />
        </button>
        <button
          type="button"
          onClick={() => setMode("export")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-red-600 hover:bg-red-50"
          title="Esporta chat in PDF"
          aria-label="Esporta chat in PDF"
        >
          <FaFilePdf size={13} />
        </button>
      </div>
      <ChatSearchExportModal
        open={mode !== null}
        mode={mode ?? "search"}
        userId={userId}
        openContext={openContext}
        onClose={() => setMode(null)}
      />
    </>
  );
}
