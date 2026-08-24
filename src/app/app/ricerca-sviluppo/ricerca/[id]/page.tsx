import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
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
        subtitle="Report giornalieri, collegamenti e allegati"
      />
      <div className="p-6">
        <RsTimelineBoard ricercaId={id} userId={auth.userId} />
      </div>
    </>
  );
}
