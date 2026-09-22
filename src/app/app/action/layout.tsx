import { IotMexCommsProvider } from "@/components/action/IotMexCommsProvider";

export default function ActionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IotMexCommsProvider>{children}</IotMexCommsProvider>;
}
