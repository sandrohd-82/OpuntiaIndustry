import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { RsNoteTimeline } from "@/components/ricerca-sviluppo/RsNoteTimeline";
import { RsTimelineBoard } from "@/components/ricerca-sviluppo/RsTimelineBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RicercaTimelinePage({ params }: Props) {
  await requireAreaAccess("ricerca-sviluppo");
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth?.userId) redirect("/login");

  return (
    <>
      <AppHeader
        title="Timeline ricerca"
        subtitle="Note numerate, semaforo e report giornalieri"
      />
      <div className="space-y-8 p-6">
        <RsNoteTimeline ricercaId={id} />
        <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Report giornalieri
          </summary>
          <div className="mt-4">
            <RsTimelineBoard ricercaId={id} userId={auth.userId} />
          </div>
        </details>
      </div>
    </>
  );
}
