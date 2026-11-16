export const PROTOCOLLO_PROVA_IOT = "POWER_ON,POWER_OFF" as const;

export function protocolloMacchinaProva(iotCollegato: boolean): "" | typeof PROTOCOLLO_PROVA_IOT {
  if (iotCollegato) return PROTOCOLLO_PROVA_IOT;
  return "";
}
