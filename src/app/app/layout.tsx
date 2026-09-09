import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { actorCanSwitchProfiles } from "@/lib/auth/impersonation-scope";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageAccessToggle } from "@/components/layout/PageAccessToggle";
import { WelcomeModal } from "@/components/layout/WelcomeModal";
import {
  PROFILE_GERARCHIA_LABELS,
  parseProfileGerarchia,
} from "@/lib/auth/gerarchia";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { getAuthContext, getUserAreas } from "@/lib/auth/session";
import { loadAccessMaps } from "@/app/actions/page-access";
import { ActionAccessProvider } from "@/components/layout/ActionAccessProvider";
import { ImpostaAutorizzazioniButton } from "@/components/layout/ImpostaAutorizzazioniButton";
import { SensitiveAuthProvider } from "@/components/layout/SensitiveAuthProvider";
import { applySensitiveLocks, isFiscalePath, isRicercaSviluppoPath } from "@/lib/auth/data-scope";
import { loadProfileAuthBundle } from "@/lib/auth/data-scope-enforce";
import { isNavPathVisible, resolvePageKey } from "@/lib/auth/page-access";
import { AREA_ROUTES, SIDEBAR_AREA_ORDER } from "@/lib/areas/config";
import { isTestImpersonation } from "@/lib/areas/guard";
import type { UserArea } from "@/types/database";

function filterAreasByPageAccess(
  areas: UserArea[],
  pageAccess: Record<string, boolean>
): UserArea[] {
  return areas.filter((area) => {
    const path =
      AREA_ROUTES[area.slug]?.path ?? `/app/${area.slug}`;
    return isNavPathVisible(path, pageAccess);
  });
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (auth.mustEnrollTotp) {
    redirect("/primo-accesso/2fa");
  }

  if (!auth.isSecondFactorVerified) {
    redirect("/verify-email");
  }

  const stato = parseProfileStatoOperativo(auth.profile.stato_operativo);
  const testMenuMode = isTestImpersonation(auth);
  const applyPageFilter =
    !isSuperadminProfile(auth.profile) || auth.impersonating;
  const { pageAccess: rawPageAccess, actionAccess } = await loadAccessMaps(
    auth.userId
  );
  const { settings: authSettings, scopes: dataScopes } =
    await loadProfileAuthBundle(auth.userId);
  const pageAccess = applySensitiveLocks(rawPageAccess, authSettings);

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "/app/dashboard";
  const pageKey = resolvePageKey(pathname);

  if (
    applyPageFilter &&
    !testMenuMode &&
    ((isFiscalePath(pageKey) && !authSettings.fiscaleUnlocked) ||
      (isRicercaSviluppoPath(pageKey) && !authSettings.rsUnlocked))
  ) {
    notFound();
  }

  if (applyPageFilter && !testMenuMode && !isNavPathVisible(pageKey, pageAccess)) {
    const firstOn = SIDEBAR_AREA_ORDER.map((slug) => AREA_ROUTES[slug].path).find(
      (path) => isNavPathVisible(path, pageAccess)
    );
    if (firstOn && firstOn !== pageKey) {
      redirect(firstOn);
    }
    notFound();
  }

  const menuAreas = testMenuMode
    ? await getUserAreas(auth.actorUserId)
    : applyPageFilter
      ? filterAreasByPageAccess(auth.areas, pageAccess)
      : auth.areas;

  const roleName =
    PROFILE_GERARCHIA_LABELS[parseProfileGerarchia(auth.profile.gerarchia)] ??
    auth.profile.app_roles?.name ??
    "Utente";
  const userName = auth.profile.full_name ?? auth.email;
  const actorName =
    auth.actorProfile.full_name ?? auth.actorProfile.email ?? "Super Admin";
  const canImpersonate = actorCanSwitchProfiles(auth.actorProfile);
  const canCreateProfiles = isSuperadminProfile(auth.actorProfile);

  return (
    <SensitiveAuthProvider settings={authSettings}>
    <div className="flex min-h-screen">
      <AppSidebar
        areas={menuAreas}
        userName={userName}
        roleName={roleName}
        userId={auth.userId}
        isSuperadmin={isSuperadminProfile(auth.profile)}
        canImpersonate={canImpersonate}
        canCreateProfiles={canCreateProfiles}
        impersonating={auth.impersonating}
        actorName={actorName}
        statoOperativo={stato}
        pageAccess={pageAccess}
        testMenuMode={testMenuMode}
        applyPageFilter={applyPageFilter && !testMenuMode}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ActionAccessProvider
          actionAccess={actionAccess}
          testMenuMode={testMenuMode}
        >
          {testMenuMode && canCreateProfiles ? (
            <div className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 print:hidden">
              <ImpostaAutorizzazioniButton
                actionAccess={actionAccess}
                dataScopes={dataScopes}
                authSettings={authSettings}
              />
              <PageAccessToggle pageAccess={pageAccess} />
            </div>
          ) : null}
          {children}
        </ActionAccessProvider>
      </div>
      {auth.welcomePending ? <WelcomeModal name={userName} /> : null}
    </div>
    </SensitiveAuthProvider>
  );
}
