import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { NotificheInboxBoard } from "@/components/notifiche/NotificheInboxBoard";
import { getAuthContext } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";

export default async function NotifichePage() {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) redirect("/login");

  return (
    <>
      <AppHeader
        title="Notifiche"
        subtitle="Lette e non lette. Puoi eliminare una notifica (resta tracciata)."
      />
      <div className="p-6">
        <Suspense
          fallback={
            <p className="text-sm text-[var(--muted)]">Caricamento…</p>
          }
        >
          <NotificheInboxBoard
            isSuperAdmin={isSuperadminProfile(auth.profile)}
          />
        </Suspense>
      </div>
    </>
  );
}
