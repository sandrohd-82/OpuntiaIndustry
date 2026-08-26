import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChatAppHeader } from "@/components/chat/ChatAppHeader";
import { ChatNuovoArgomentoBoard } from "@/components/chat/ChatNuovoArgomentoBoard";
import { ChatRubricaBoard } from "@/components/chat/ChatRubricaBoard";
import { ChatInboxBoard } from "@/components/chat/ChatInboxBoard";
import { resolveChatPage } from "@/lib/areas/chat";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function ChatSubPage({ params }: Props) {
  await requireAreaAccess("chat");
  const { section, sub } = await params;
  const page = resolveChatPage([section, sub]);
  if (!page) notFound();

  const auth = await getAuthContext();
  if (!auth?.userId) redirect("/login");

  if (section === "argomenti" && sub === "nuovo") {
    return (
      <>
        <ChatAppHeader
          title={page.label}
          subtitle={page.description}
          userId={auth.userId}
        />
        <div className="p-6">
          <ChatNuovoArgomentoBoard userId={auth.userId} />
        </div>
      </>
    );
  }

  if (section === "argomenti" && sub === "elenco") {
    return (
      <>
        <ChatAppHeader
          title={page.label}
          subtitle={page.description}
          userId={auth.userId}
        />
        <div className="p-6">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Gli argomenti attivi sono anche nell’elenco del menu laterale.
            Apri un titolo per entrare in chat, oppure crea un nuovo argomento.
          </p>
          <Link
            href="/app/chat/argomenti/nuovo"
            className="inline-flex rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            + Nuovo Argomento
          </Link>
        </div>
      </>
    );
  }

  if (section === "dirette" && sub === "nuova") {
    return (
      <>
        <ChatAppHeader
          title={page.label}
          subtitle={page.description}
          userId={auth.userId}
        />
        <div className="p-6">
          <ChatRubricaBoard userId={auth.userId} mode="nuova" />
        </div>
      </>
    );
  }

  if (section === "dirette" && sub === "elenco") {
    return (
      <>
        <ChatAppHeader
          title={page.label}
          subtitle={page.description}
          userId={auth.userId}
        />
        <div className="p-6">
          <ChatInboxBoard userId={auth.userId} />
        </div>
      </>
    );
  }

  notFound();
}
