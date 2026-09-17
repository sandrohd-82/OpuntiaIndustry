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
        subtitle="Bozza: salva senza cancellare le altre. Collega ad area per pubblicarla in Magazzino."
      />
      <div className="flex h-[calc(100dvh-6.75rem)] min-h-[28rem] min-w-0 flex-col px-4 pb-3 pt-2">
        <MagazzinoMappaBoard mappaId={id} mode="editor" />
      </div>
    </>
  );
}
