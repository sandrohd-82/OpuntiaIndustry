import { z } from "zod";

export const IOT_DEVICE_STATI = ["ONLINE", "OFFLINE"] as const;
export type IotDeviceStatus = (typeof IOT_DEVICE_STATI)[number];

export type IotDevice = {
  id: string;
  macchinarioId: string;
  deviceCode: string;
  name: string;
  status: IotDeviceStatus;
  lastPing: string | null;
  apiTokenHint: string;
  pollSeconds: number;
  hasToken: boolean;
};

export type IotTelemetry = {
  id: string;
  deviceId: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type IotCommand = {
  id: string;
  deviceId: string;
  command: string;
  executed: boolean;
  executedAt: string | null;
  createdAt: string;
};

export const iotDeviceUpsertSchema = z.object({
  macchinarioId: z.string().uuid(),
  deviceCode: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, "Usa lettere, numeri e trattini"),
  pollSeconds: z.number().int().min(1).max(300).optional().default(5),
  regenerateToken: z.boolean().optional().default(false),
});

export const iotCommandInputSchema = z.object({
  deviceId: z.string().uuid(),
  command: z.string().trim().min(1).max(80),
});
