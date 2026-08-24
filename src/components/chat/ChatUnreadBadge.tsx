"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaComments } from "react-icons/fa6";
import {
  attachChatLifecycleRefresh,
  subscribeUnreadCount,
} from "@/lib/chat/realtime";
import { fetchUnreadCount } from "@/lib/chat/messages";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
};

/** Badge unread per sidebar / header chat */
export function ChatUnreadBadge({ userId }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const load = () => {
      void fetchUnreadCount(supabase).then(setCount);
    };
    load();
    const ch = subscribeUnreadCount(supabase, userId, load);
    const detach = attachChatLifecycleRefresh(load);
    return () => {
      void supabase.removeChannel(ch);
      detach();
    };
  }, [userId]);

  if (count <= 0) return null;
  return (
    <Link
      href="/app/chat/dirette/elenco"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white"
      title="Messaggi non letti"
    >
      <FaComments size={10} />
      {count > 99 ? "99+" : count}
    </Link>
  );
}
