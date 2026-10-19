import { AppHeader } from "@/components/layout/AppHeader";
import { BachecaBoard } from "@/components/kanban/BachecaBoard";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ scheda?: string }>;
};

export default async function BachecaPage({ params, searchParams }: Props) {
  await requireAreaAccess("promemorie-e-note");
  const { boardId } = await params;
  const query = await searchParams;
  return (
    <>
      <AppHeader title="Bacheca" subtitle="Trascina schede e liste. Le modifiche restano registrate." />
      <BachecaBoard boardId={boardId} schedaIniziale={query.scheda ?? null} />
    </>
  );
}
