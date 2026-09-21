"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaBell } from "react-icons/fa6";
import { countUnreadNotificheAction } from "@/app/actions/notifiche";
import { NOTIFICHE_NAV_EVENT } from "@/lib/notifiche/nav-event";
import { createClient } from "@/lib/supabase/client";

export function NotificheBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      void countUnreadNotificheAction()
        .then((res) => {
          if (cancelled || !res.success) return;
          setUnread(res.totale);
        })
        .catch(() => {
          /* badge opzionale */
        });
    }
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("app-notifiche-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_notifiche" },
        load
      )
      .subscribe();
    window.addEventListener(NOTIFICHE_NAV_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener(NOTIFICHE_NAV_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const label =
    unread > 0
      ? `${unread} notifiche da leggere`
      : "Notifiche";

  return (
    <Link
      href="/app/notifiche"
      title={label}
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-slate-700 hover:bg-slate-50"
    >
      <FaBell size={15} />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
