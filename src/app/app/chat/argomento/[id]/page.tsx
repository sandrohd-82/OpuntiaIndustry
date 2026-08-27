import { redirect } from "next/navigation";
import { ChatAppHeader } from "@/components/chat/ChatAppHeader";
import { ChatTopicThreadBoard } from "@/components/chat/ChatTopicThreadBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
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
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      <ChatAppHeader
        title="Argomento"
        subtitle="Chat di gruppo — solo partecipanti"
        userId={auth.userId}
      />
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-[50px] pt-6">
        <ChatTopicThreadBoard
          userId={auth.userId}
          topicId={id}
          isAdmin={isAdminLikeProfile(auth.profile)}
        />
      </div>
    </div>
  );
}
