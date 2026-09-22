"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { IotMexCommsPanel } from "@/components/action/IotMexCommsPanel";
import type { MexCommsSessione } from "@/lib/action/iot-mex-comms";

type Ctx = {
  avviaSessione: (sessione: MexCommsSessione) => void;
};

const IotMexCommsContext = createContext<Ctx | null>(null);

export function IotMexCommsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessione, setSessione] = useState<MexCommsSessione | null>(null);
  const avviaSessione = useCallback((next: MexCommsSessione) => {
    setSessione(next);
  }, []);

  return (
    <IotMexCommsContext.Provider value={{ avviaSessione }}>
      {children}
      {sessione ? (
        <IotMexCommsPanel
          sessione={sessione}
          onChiudi={() => setSessione(null)}
        />
      ) : null}
    </IotMexCommsContext.Provider>
  );
}

export function useIotMexComms(): Ctx {
  const ctx = useContext(IotMexCommsContext);
  if (!ctx) {
    throw new Error("useIotMexComms va usato dentro IotMexCommsProvider.");
  }
  return ctx;
}
