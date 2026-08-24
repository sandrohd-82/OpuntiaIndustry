import { redirect } from "next/navigation";
import { ChatTopicThreadBoard } from "@/components/chat/ChatTopicThreadBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ChatArgomentoPage({ params }: Props) {
  await requireAreaAccess("chat");
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth?.userId) redirect("/login");

  return (
    <>
      <AppHeader
        title="Argomento"
        subtitle="Chat di gruppo — solo partecipanti"
      />
      <div className="p-6">
        <ChatTopicThreadBoard userId={auth.userId} topicId={id} />
      </div>
    </>
  );
}
