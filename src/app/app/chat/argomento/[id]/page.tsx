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
    <>
      <ChatAppHeader
        title="Argomento"
        subtitle="Chat di gruppo — solo partecipanti"
        userId={auth.userId}
      />
      <div className="p-6">
        <ChatTopicThreadBoard
          userId={auth.userId}
          topicId={id}
          isAdmin={isAdminLikeProfile(auth.profile)}
        />
      </div>
    </>
  );
}
