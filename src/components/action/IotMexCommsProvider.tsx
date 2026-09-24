"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { IotMexCommsPanel } from "@/components/action/IotMexCommsPanel";
import { IotMexEsitoAvviso } from "@/components/action/IotMexEsitoAvviso";
import type {
  MexCommsEsitoAvviso,
  MexCommsSessione,
} from "@/lib/action/iot-mex-comms";

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
  const [esito, setEsito] = useState<MexCommsEsitoAvviso | null>(null);
  const sessioneRef = useRef<MexCommsSessione | null>(null);
  sessioneRef.current = sessione;
  const avviaSessione = useCallback((next: MexCommsSessione) => {
    setEsito(null);
    setSessione(next);
  }, []);
  const chiudiSessione = useCallback(() => setSessione(null), []);
  const chiudiEsito = useCallback(() => setEsito(null), []);
  const fineSessione = useCallback((next: MexCommsEsitoAvviso) => {
    sessioneRef.current?.onCompletata?.();
    setSessione(null);
    setEsito(next);
  }, []);

  return (
    <IotMexCommsContext.Provider value={{ avviaSessione }}>
      {children}
      {sessione ? (
        <IotMexCommsPanel
          sessione={sessione}
          onChiudi={chiudiSessione}
          onFine={fineSessione}
        />
      ) : null}
      {esito ? (
        <IotMexEsitoAvviso esito={esito} onChiudi={chiudiEsito} />
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
