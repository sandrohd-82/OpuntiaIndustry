import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { actorCanSwitchProfiles } from "@/lib/auth/impersonation-scope";
import {
  isAdminLikeProfile,
  isSuperadminProfile,
  isUnrestrictedSuperadmin,
} from "@/lib/auth/roles";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageAccessToggle } from "@/components/layout/PageAccessToggle";
import { WelcomeModal } from "@/components/layout/WelcomeModal";
import {
  PROFILE_GERARCHIA_LABELS,
  parseProfileGerarchia,
} from "@/lib/auth/gerarchia";
import { formatOperatorShortName } from "@/lib/auth/operator-short-name";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { getAuthContext, getUserAreas } from "@/lib/auth/session";
import { loadAccessMaps } from "@/app/actions/page-access";
import { ActionAccessProvider } from "@/components/layout/ActionAccessProvider";
import { ImpostaAutorizzazioniButton } from "@/components/layout/ImpostaAutorizzazioniButton";
import { SensitiveAuthProvider } from "@/components/layout/SensitiveAuthProvider";
import { canElaboraContabilitaAccess } from "@/lib/auth/action-access";
import {
  applySensitiveLocks,
  isFiscalePath,
  isRicercaSviluppoPath,
  unrestrictedAuthSettings,
} from "@/lib/auth/data-scope";
import { loadProfileAuthBundle } from "@/lib/auth/data-scope-enforce";
import { isNavPathVisible, resolvePageKey } from "@/lib/auth/page-access";
import {
  AREA_ROUTES,
  SIDEBAR_AREA_ORDER,
  withRoleAreaPageDefaults,
} from "@/lib/areas/config";
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
  const unrestricted = isUnrestrictedSuperadmin(auth);
  const applyPageFilter = !unrestricted;
  const { pageAccess: rawPageAccess, actionAccess } = await loadAccessMaps(
    auth.userId
  );
  const { settings: rawAuthSettings, scopes: dataScopes } =
    await loadProfileAuthBundle(auth.userId);
  const authSettings = unrestricted
    ? unrestrictedAuthSettings(rawAuthSettings)
    : rawAuthSettings;
  const pageAccess = applySensitiveLocks(
    withRoleAreaPageDefaults(rawPageAccess, auth.areas),
    authSettings
  );

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "/app/dashboard";
  const pageKey = resolvePageKey(pathname);

  if (
    applyPageFilter &&
    !testMenuMode &&
    ((isFiscalePath(pageKey) && !authSettings.fiscaleUnlocked) ||
      (isRicercaSviluppoPath(pageKey) && !authSettings.rsUnlocked))
  ) {
    const firstOn = SIDEBAR_AREA_ORDER.map((slug) => AREA_ROUTES[slug].path).find(
      (path) =>
        isNavPathVisible(path, pageAccess) &&
        !isFiscalePath(path) &&
        !isRicercaSviluppoPath(path)
    );
    if (firstOn && firstOn !== pageKey) {
      redirect(firstOn);
    }
    if (!auth.impersonating) notFound();
  } else if (
    applyPageFilter &&
    !testMenuMode &&
    !isNavPathVisible(pageKey, pageAccess)
  ) {
    const firstOn = SIDEBAR_AREA_ORDER.map((slug) => AREA_ROUTES[slug].path).find(
      (path) => isNavPathVisible(path, pageAccess)
    );
    if (firstOn && firstOn !== pageKey) {
      redirect(firstOn);
    }
    if (!auth.impersonating) notFound();
  }

  const showNoPageAccess =
    applyPageFilter &&
    !testMenuMode &&
    auth.impersonating &&
    !isNavPathVisible(pageKey, pageAccess);

  const menuAreas = testMenuMode
    ? await getUserAreas(auth.actorUserId)
    : applyPageFilter
      ? filterAreasByPageAccess(auth.areas, pageAccess)
      : auth.areas;

  const roleName =
    PROFILE_GERARCHIA_LABELS[parseProfileGerarchia(auth.profile.gerarchia)] ??
    auth.profile.app_roles?.name ??
    "Utente";
  const userName = formatOperatorShortName({
    first_name: auth.profile.first_name,
    last_name: auth.profile.last_name,
    full_name: auth.profile.full_name,
    email: auth.email,
  });
  const welcomeName = auth.profile.full_name ?? auth.email;
  const actorName =
    auth.actorProfile.full_name ?? auth.actorProfile.email ?? "Super Admin";
  const canImpersonate = actorCanSwitchProfiles(auth.actorProfile);
  const canCreateProfiles = isSuperadminProfile(auth.actorProfile);
  const canElaboraContabilita = canElaboraContabilitaAccess({
    isSuperadminSelf:
      isSuperadminProfile(auth.profile) && !auth.impersonating,
    isCommercialista: authSettings.isCommercialista,
    actionAccess,
  });

  return (
    <SensitiveAuthProvider
      settings={authSettings}
      canElaboraContabilita={canElaboraContabilita}
    >
    <div className="flex min-h-screen">
      <AppSidebar
        areas={menuAreas}
        userName={userName}
        roleName={roleName}
        userId={auth.userId}
        isSuperadmin={isSuperadminProfile(auth.profile)}
        isAdminLike={isAdminLikeProfile(auth.profile)}
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
          userId={auth.userId}
          bypassPrivileges={
            isSuperadminProfile(auth.profile) && !auth.impersonating
          }
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
          {showNoPageAccess ? (
            <div className="mx-auto max-w-lg p-8 text-sm text-slate-600">
              <p className="text-base font-semibold text-slate-900">
                Nessuna pagina abilitata su questo profilo
              </p>
              <p className="mt-2 leading-relaxed">
                Lo switch resta disponibile nel menu a sinistra: torna al Super
                Admin oppure reimposta il profilo in fase Test per configurare
                le pagine On/Off.
              </p>
            </div>
          ) : (
            children
          )}
        </ActionAccessProvider>
      </div>
      {auth.welcomePending ? <WelcomeModal name={welcomeName} /> : null}
    </div>
    </SensitiveAuthProvider>
  );
}
