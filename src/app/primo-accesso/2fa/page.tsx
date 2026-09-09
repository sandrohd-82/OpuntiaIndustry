import { redirect } from "next/navigation";
import { PrimoAccessoTotpForm } from "@/components/auth/PrimoAccessoTotpForm";
import { getAuthUser, getProfile } from "@/lib/auth/session";
import { parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { createServiceClient } from "@/lib/supabase/server";

export default async function PrimoAccesso2faPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  if (!profile || parseProfileStatoOperativo(profile.stato_operativo) !== "operativo") {
    redirect("/login");
  }

  const service = createServiceClient();
  const { data: factor } = await service
    .from("user_second_factor")
    .select("method, totp_secret_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (factor?.method === "app" && factor.totp_secret_encrypted) {
    redirect("/app/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Google Authenticator</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ultimo passo: configura il secondo fattore. Poi accederai al
          gestionale.
        </p>
        <div className="mt-6">
          <PrimoAccessoTotpForm />
        </div>
      </div>
    </main>
  );
}
