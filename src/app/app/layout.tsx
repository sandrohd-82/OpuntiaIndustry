import { redirect } from "next/navigation";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ImpersonationSwitcher } from "@/components/layout/ImpersonationSwitcher";
import { getAuthContext } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (!auth.isSecondFactorVerified) {
    redirect("/verify-email");
  }

  const roleName =
    auth.profile.app_roles?.name ?? "Utente";
  const userName = auth.profile.full_name ?? auth.email;
  const actorName =
    auth.actorProfile.full_name ?? auth.actorProfile.email ?? "Super Admin";
  const canImpersonate = isSuperadminProfile(auth.actorProfile);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        areas={auth.areas}
        userName={userName}
        roleName={roleName}
        userId={auth.userId}
        isSuperadmin={isSuperadminProfile(auth.profile)}
        canImpersonate={canImpersonate}
        impersonating={auth.impersonating}
        actorName={actorName}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {auth.impersonating && canImpersonate ? (
          <div className="print:hidden border-b border-amber-300 bg-amber-100 px-4 py-2">
            <ImpersonationSwitcher
              impersonating
              currentLabel={userName}
              currentRole={roleName}
              actorLabel={actorName}
            />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
