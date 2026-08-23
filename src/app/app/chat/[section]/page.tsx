import { notFound, redirect } from "next/navigation";
import { ChatInboxBoard } from "@/components/chat/ChatInboxBoard";
import { ChatRubricaBoard } from "@/components/chat/ChatRubricaBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { CHAT_SECTIONS, resolveChatPage } from "@/lib/areas/chat";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function ChatSectionPage({ params }: Props) {
  await requireAreaAccess("chat");
  const { section } = await params;

  // Legacy argomenti → inbox
  if (
    section === "elenco-argomenti" ||
    section === "nuovo-argomento" ||
    section === "argomenti-archiviati"
  ) {
    redirect("/app/chat/inbox");
  }

  const item = CHAT_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  const page = resolveChatPage([section]);
  if (!page) notFound();

  const auth = await getAuthContext();
  if (!auth?.userId) {
    redirect("/login");
  }

  if (section === "inbox") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ChatInboxBoard userId={auth.userId} />
        </div>
      </>
    );
  }

  if (section === "rubrica" || section === "nuova") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ChatRubricaBoard
            userId={auth.userId}
            mode={section === "rubrica" ? "rubrica" : "nuova"}
          />
        </div>
      </>
    );
  }

  notFound();
}
