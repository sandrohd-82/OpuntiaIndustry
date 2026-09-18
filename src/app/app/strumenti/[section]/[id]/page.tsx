import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MagazzinoMappaBoard } from "@/components/magazzino/MagazzinoMappaBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveStrumentiPage } from "@/lib/areas/strumenti";

type Props = {
  params: Promise<{ section: string; id: string }>;
};

export default async function StrumentiEditorAreePage({ params }: Props) {
  await requireAreaAccess("strumenti");
  const { section, id } = await params;
  if (section !== "editor-aree") notFound();
  const page = resolveStrumentiPage([section]);
  if (!page) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  return (
    <>
      <AppHeader
        title="Editor di aree"
        subtitle="Bozza: salva e collega all'area. Approva per renderla definitiva in Magazzino."
      />
      <div className="min-w-0 px-4 pb-8 pt-2">
        <MagazzinoMappaBoard mappaId={id} mode="editor" />
      </div>
    </>
  );
}
