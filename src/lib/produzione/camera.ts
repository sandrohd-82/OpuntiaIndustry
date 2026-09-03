import { z } from "zod";

export const CAMERA_TARGET_KINDS = ["area", "posto"] as const;
export type CameraTargetKind = (typeof CAMERA_TARGET_KINDS)[number];

export type CameraPublic = {
  targetKind: CameraTargetKind;
  targetId: string;
  label: string;
  hasCamera: boolean;
  cameraIp: string | null;
  cameraRtspPath: string;
  hasPassword: boolean;
};

export const cameraRegisterSchema = z.object({
  targetKind: z.enum(CAMERA_TARGET_KINDS),
  targetId: z.string().uuid(),
  cameraIp: z
    .string()
    .trim()
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
      "Inserisci un IPv4 valido, es. 192.168.1.120"
    ),
  cameraRtspPath: z
    .string()
    .trim()
    .regex(/^\/[a-zA-Z0-9/_-]+$/, "Path tipo /live/ch0")
    .max(80)
    .default("/live/ch0"),
  cameraPassword: z.string().max(200).optional().default(""),
});

export type CameraRegisterInput = z.infer<typeof cameraRegisterSchema>;

export function mediamtxPathName(input: {
  areaCodice: string;
  postoCodice?: string | null;
}): string {
  const area = input.areaCodice.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (input.postoCodice) {
    const posto = input.postoCodice.replace(/[^a-z0-9-]/gi, "").toLowerCase();
    return `posto_${area}_${posto}`.slice(0, 80);
  }
  return `area_${area}`.slice(0, 80);
}

export function buildRtspUrl(input: {
  ip: string;
  password: string;
  path: string;
  user?: string;
}): string {
  const user = encodeURIComponent(input.user ?? "admin");
  const pass = encodeURIComponent(input.password);
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  return `rtsp://${user}:${pass}@${input.ip}:554${path}`;
}

export function emptyCameraPublic(
  targetKind: CameraTargetKind,
  targetId: string,
  label: string
): CameraPublic {
  return {
    targetKind,
    targetId,
    label,
    hasCamera: false,
    cameraIp: null,
    cameraRtspPath: "/live/ch0",
    hasPassword: false,
  };
}
