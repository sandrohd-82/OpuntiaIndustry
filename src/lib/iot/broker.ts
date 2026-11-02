export const IOT_BROKER_ID = "b11a0001-0000-4000-8000-000000000001";

export type IotProtocolloWeb = "ws" | "wss";
export type IotProtocolloDevice = "mqtt" | "mqtts";
export type IotStatoImpostazioni = "bozza" | "approvato" | "chiuso";

export type IotBrokerImpostazioni = {
  id: string;
  versione: number;
  stato: IotStatoImpostazioni;
  webHost: string;
  webPorta: number;
  webProtocollo: IotProtocolloWeb;
  webUtente: string;
  webPassword: string;
  webClientIdPrefix: string;
  deviceHost: string;
  devicePorta: number;
  deviceProtocollo: IotProtocolloDevice;
  deviceUtente: string;
  devicePassword: string;
  topicComando: string;
  topicStato: string;
};

export function urlWebSocketBroker(input: {
  webProtocollo: IotProtocolloWeb;
  webHost: string;
  webPorta: number;
}): string {
  const host = input.webHost.trim();
  return `${input.webProtocollo}://${host}:${input.webPorta}`;
}

export function topicConDevice(template: string, deviceId: string): string {
  const id = deviceId.trim() || "device";
  return template.replaceAll("{device_id}", id);
}
