"use server";

import { writeAuditLog } from "@/lib/audit";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import {
  buildRtspUrl,
  cameraRegisterSchema,
  mediamtxPathName,
  type CameraPublic,
  type CameraTargetKind,
} from "@/lib/produzione/camera";
import {
  decryptCameraSecret,
  encryptCameraSecret,
} from "@/lib/produzione/camera-crypto";
import {
  ensureMediamtxOnDemandPath,
  whepPlaybackUrl,
} from "@/lib/produzione/mediamtx";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type AuthOk = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

async function requireCameraViewer(): Promise<
  { success: true; auth: AuthOk } | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { success: false, error: "Non autenticato." };
  if (!auth.isSecondFactorVerified) {
    return { success: false, error: "Verifica il secondo fattore." };
  }
  const ok =
    isAdminLikeProfile(auth.profile) ||
    userCanAccessArea(auth.areas, "produzione") ||
    userCanAccessArea(auth.areas, "magazzino");
  if (!ok) return { success: false, error: "Permesso insufficiente." };
  return { success: true, auth };
}

async function requireCameraAdmin(): Promise<
  { success: true; auth: AuthOk } | { success: false; error: string }
> {
  const ctx = await requireCameraViewer();
  if (!ctx.success) return ctx;
  if (!isAdminLikeProfile(ctx.auth.profile)) {
    return {
      success: false,
      error: "Solo l’amministratore può registrare una telecamera.",
    };
  }
  return ctx;
}

type TargetRow = {
  id: string;
  codice: string;
  nome: string;
  camera_ip: string | null;
  camera_rtsp_path: string | null;
  has_camera: boolean;
  areaCodice?: string;
};

async function resolveTarget(input: {
  targetKind: CameraTargetKind;
  areaCodice: string;
  postoCodice?: string | null;
}): Promise<
  | { success: true; row: TargetRow; areaCodice: string; postoCodice: string | null }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: area, error: aErr } = await supabase
    .from("produzione_aree")
    .select("id, codice, nome, camera_ip, camera_rtsp_path, has_camera")
    .eq("codice", input.areaCodice)
    .is("deleted_at", null)
    .maybeSingle();
  if (aErr) return { success: false, error: aErr.message };
  if (!area) return { success: false, error: "Area / centro non trovato." };

  if (input.targetKind === "area") {
    return {
      success: true,
      areaCodice: (area as TargetRow).codice,
      postoCodice: null,
      row: area as TargetRow,
    };
  }

  const postoCodice = input.postoCodice?.trim();
  if (!postoCodice) {
    return { success: false, error: "Postazione non indicata." };
  }
  const { data: posto, error: pErr } = await supabase
    .from("produzione_posti_lavoro")
    .select("id, codice, nome, camera_ip, camera_rtsp_path, has_camera")
    .eq("area_id", (area as TargetRow).id)
    .eq("codice", postoCodice)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr) return { success: false, error: pErr.message };
  if (!posto) return { success: false, error: "Posto lavoro non trovato." };
  return {
    success: true,
    areaCodice: (area as TargetRow).codice,
    postoCodice,
    row: { ...(posto as TargetRow), areaCodice: (area as TargetRow).codice },
  };
}

async function hasSecret(
  kind: CameraTargetKind,
  targetId: string
): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("produzione_camera_secrets")
    .select("id")
    .eq("target_kind", kind)
    .eq("target_id", targetId)
    .maybeSingle();
  return Boolean(data);
}

function toPublic(
  kind: CameraTargetKind,
  row: TargetRow,
  hasPassword: boolean
): CameraPublic {
  return {
    targetKind: kind,
    targetId: row.id,
    label: row.nome,
    hasCamera: Boolean(row.has_camera),
    cameraIp: row.camera_ip,
    cameraRtspPath: row.camera_rtsp_path || "/live/ch0",
    hasPassword,
  };
}

export async function getCameraPanelAction(input: {
  targetKind: CameraTargetKind;
  areaCodice: string;
  postoCodice?: string | null;
}): Promise<
  | { success: true; isAdmin: boolean; camera: CameraPublic }
  | { success: false; error: string }
> {
  const ctx = await requireCameraViewer();
  if (!ctx.success) return ctx;
  const target = await resolveTarget(input);
  if (!target.success) return target;
  const hasPassword = await hasSecret(input.targetKind, target.row.id);
  return {
    success: true,
    isAdmin: isAdminLikeProfile(ctx.auth.profile),
    camera: toPublic(input.targetKind, target.row, hasPassword),
  };
}

export async function upsertCameraAction(raw: unknown): Promise<
  { success: true; camera: CameraPublic } | { success: false; error: string }
> {
  const ctx = await requireCameraAdmin();
  if (!ctx.success) return ctx;
  const parsed = cameraRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const table =
    v.targetKind === "area" ? "produzione_aree" : "produzione_posti_lavoro";
  const { data: existing, error: eErr } = await supabase
    .from(table)
    .select("id, codice, nome, camera_ip, camera_rtsp_path, has_camera")
    .eq("id", v.targetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (eErr || !existing) {
    return { success: false, error: eErr?.message ?? "Centro di lavoro non trovato." };
  }

  const service = createServiceClient();
  const { data: secretRow } = await service
    .from("produzione_camera_secrets")
    .select("id, password_enc")
    .eq("target_kind", v.targetKind)
    .eq("target_id", v.targetId)
    .maybeSingle();

  const passwordPlain = v.cameraPassword?.trim() ?? "";
  if (!passwordPlain && !secretRow) {
    return {
      success: false,
      error: "Inserisci la password RTSP della ieGeek (utente admin).",
    };
  }

  if (passwordPlain) {
    const enc = encryptCameraSecret(passwordPlain);
    if (secretRow) {
      const { error } = await service
        .from("produzione_camera_secrets")
        .update({
          password_enc: enc,
          updated_by: ctx.auth.userId,
        })
        .eq("id", (secretRow as { id: string }).id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await service.from("produzione_camera_secrets").insert({
        target_kind: v.targetKind,
        target_id: v.targetId,
        password_enc: enc,
        created_by: ctx.auth.userId,
        updated_by: ctx.auth.userId,
      });
      if (error) return { success: false, error: error.message };
    }
  }

  const { data: updated, error: uErr } = await supabase
    .from(table)
    .update({
      camera_ip: v.cameraIp,
      camera_rtsp_path: v.cameraRtspPath,
      has_camera: true,
      updated_by: ctx.auth.userId,
    })
    .eq("id", v.targetId)
    .select("id, codice, nome, camera_ip, camera_rtsp_path, has_camera")
    .single();
  if (uErr || !updated) {
    return { success: false, error: uErr?.message ?? "Salvataggio fallito." };
  }

  await writeAuditLog({
    entity_type: "produzione_camera",
    entity_id: v.targetId,
    action: secretRow ? "update" : "create",
    actor_id: ctx.auth.userId,
    summary: `Registrata telecamera ieGeek su ${(existing as TargetRow).nome}`,
    payload: {
      target_kind: v.targetKind,
      camera_ip: v.cameraIp,
      camera_rtsp_path: v.cameraRtspPath,
    },
  });

  return {
    success: true,
    camera: toPublic(v.targetKind, updated as TargetRow, true),
  };
}

export async function startCameraLiveAction(input: {
  targetKind: CameraTargetKind;
  areaCodice: string;
  postoCodice?: string | null;
}): Promise<
  | { success: true; whepUrl: string; label: string; warning?: string }
  | { success: false; error: string }
> {
  const ctx = await requireCameraViewer();
  if (!ctx.success) return ctx;
  const target = await resolveTarget(input);
  if (!target.success) return target;
  if (!target.row.has_camera || !target.row.camera_ip) {
    return { success: false, error: "Nessuna telecamera registrata su questa postazione." };
  }

  const service = createServiceClient();
  const { data: secretRow, error: sErr } = await service
    .from("produzione_camera_secrets")
    .select("password_enc")
    .eq("target_kind", input.targetKind)
    .eq("target_id", target.row.id)
    .maybeSingle();
  if (sErr) return { success: false, error: sErr.message };
  const enc = (secretRow as { password_enc?: string } | null)?.password_enc;
  if (!enc) {
    return {
      success: false,
      error: "Password camera assente. Un amministratore deve completare la registrazione.",
    };
  }

  let password: string;
  try {
    password = decryptCameraSecret(enc);
  } catch {
    return { success: false, error: "Impossibile decifrare la password camera." };
  }

  const pathName = mediamtxPathName({
    areaCodice: target.areaCodice,
    postoCodice: target.postoCodice,
  });
  const whepUrl = whepPlaybackUrl(pathName);
  if (!whepUrl) {
    return {
      success: false,
      error:
        "Manca MEDIAMTX_WHEP_BASE_URL. Avvia MediaMTX in officina e indica l’URL WHEP (es. http://192.168.1.10:8889).",
    };
  }

  const rtspUrl = buildRtspUrl({
    ip: target.row.camera_ip,
    password,
    path: target.row.camera_rtsp_path || "/live/ch0",
  });
  const synced = await ensureMediamtxOnDemandPath({ pathName, rtspUrl });

  await writeAuditLog({
    entity_type: "produzione_camera",
    entity_id: target.row.id,
    action: "live_open",
    actor_id: ctx.auth.userId,
    summary: `Aperto live ${target.row.nome}`,
    payload: { path: pathName, mediamtx_synced: synced.ok && synced.synced },
  });

  if (!synced.ok) {
    return {
      success: true,
      whepUrl,
      label: target.row.nome,
      warning: synced.error,
    };
  }
  return { success: true, whepUrl, label: target.row.nome };
}
