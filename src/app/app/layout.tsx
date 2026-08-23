import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
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

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        areas={auth.areas}
        userName={auth.profile.full_name ?? auth.email}
        roleName={roleName}
        userId={auth.userId}
      />

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
