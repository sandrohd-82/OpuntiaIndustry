import { notFound } from "next/navigation";
import { OrganigrammaPersonaBoard } from "@/components/amministrazione/organigramma/OrganigrammaPersonaBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string; id: string }>;
};

export default async function AmministrazioneSubIdPage({ params }: Props) {
  await requireAreaAccess("amministrazione");
  const { section, sub, id } = await params;

  if (section !== "organigramma" || sub !== "elenco-e-mansioni") {
    notFound();
  }

  return (
    <>
      <AppHeader
        title="Scheda operatore"
        subtitle="Anagrafica, documenti, autorizzazioni e registro attività"
      />
      <div className="p-6">
        <OrganigrammaPersonaBoard personaId={id} />
      </div>
    </>
  );
}
