import { redirect } from "next/navigation";
import { ChatThreadBoard } from "@/components/chat/ChatThreadBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ChatThreadPage({ params }: Props) {
  await requireAreaAccess("chat");
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth?.userId) redirect("/login");

  return (
    <>
      <AppHeader title="Conversazione" subtitle="Messaggi in tempo reale" />
      <div className="p-6">
        <ChatThreadBoard userId={auth.userId} conversationId={id} />
      </div>
    </>
  );
}
