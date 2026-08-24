import { notFound, redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { CHAT_SECTIONS } from "@/lib/areas/chat";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function ChatSectionPage({ params }: Props) {
  await requireAreaAccess("chat");
  const { section } = await params;

  // Legacy
  if (
    section === "inbox" ||
    section === "nuova" ||
    section === "rubrica" ||
    section === "elenco-argomenti" ||
    section === "nuovo-argomento" ||
    section === "argomenti-archiviati"
  ) {
    if (section === "nuova" || section === "rubrica" || section === "inbox") {
      redirect("/app/chat/dirette/elenco");
    }
    redirect("/app/chat/argomenti/elenco");
  }

  const item = CHAT_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();
  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }
  notFound();
}
