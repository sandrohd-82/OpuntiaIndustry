import { z } from "zod";
import type {
  CompanyFiscalProfileRow,
  FiscalInpsParametri,
  FiscalTipoColtura,
  FormaGiuridicaFiscale,
  IvaPeriodoFiscale,
  RegimeIvaFiscale,
} from "@/types/database";

export type CompanyFiscalProfile = {
  id: string;
  companyKey: string;
  formaGiuridica: FormaGiuridicaFiscale;
  regimeIva: RegimeIvaFiscale;
  ivaPeriodo: IvaPeriodoFiscale;
  cooperativaSocialeL381: boolean;
  zonaSvantaggiata: boolean;
  otdCount: number;
  otiCount: number;
  tipiColture: FiscalTipoColtura[];
  inpsParametri: FiscalInpsParametri;
  aliquotaIresPct: number;
  aliquotaIrapPct: number;
  aliquotaStimaGenericaPct: number;
  note: string;
  openDataEnabled: boolean;
  openDataLastSyncAt: string | null;
  versione: number;
  updatedAt: string;
  updatedBy: string | null;
};

const tipoColturaSchema = z.object({
  codice: z.string().trim().min(1),
  label: z.string().trim().min(1),
  percentuale_compensazione: z.number().min(0).max(100),
  aliquota_iva: z.number().min(0).max(100),
});

const inpsSchema = z.object({
  contribuzione_otd_pct: z.number().min(0).max(100),
  contribuzione_oti_pct: z.number().min(0).max(100),
  sgravio_zona_svantaggiata_pct: z.number().min(0).max(100),
  stima_mensile_fissa_eur: z.number().min(0),
});

export const fiscalProfileUpdateSchema = z.object({
  formaGiuridica: z.literal("cooperativa_agricola_sociale_arl"),
  regimeIva: z.enum(["ordinario", "speciale_agricolo_art34"]),
  ivaPeriodo: z.enum(["mensile", "trimestrale"]),
  cooperativaSocialeL381: z.boolean(),
  zonaSvantaggiata: z.boolean(),
  otdCount: z.number().int().min(0),
  otiCount: z.number().int().min(0),
  tipiColture: z.array(tipoColturaSchema).min(1),
  inpsParametri: inpsSchema,
  aliquotaIresPct: z.number().min(0).max(100),
  aliquotaIrapPct: z.number().min(0).max(100),
  aliquotaStimaGenericaPct: z.number().min(0).max(100),
  note: z.string().optional(),
  openDataEnabled: z.boolean().optional(),
  reasonForChange: z
    .string()
    .trim()
    .min(3, "Indica il motivo della modifica (tracciabilità ISO 9001)"),
});

export type FiscalProfileUpdateInput = z.infer<typeof fiscalProfileUpdateSchema>;

function asTipoColture(value: unknown): FiscalTipoColtura[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        codice: String(r.codice ?? "").trim(),
        label: String(r.label ?? "").trim(),
        percentuale_compensazione: Number(r.percentuale_compensazione) || 0,
        aliquota_iva: Number(r.aliquota_iva) || 0,
      };
    })
    .filter((t) => t.codice && t.label);
}

function asInps(value: unknown): FiscalInpsParametri {
  const r =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    contribuzione_otd_pct: Number(r.contribuzione_otd_pct) || 0,
    contribuzione_oti_pct: Number(r.contribuzione_oti_pct) || 0,
    sgravio_zona_svantaggiata_pct: Number(r.sgravio_zona_svantaggiata_pct) || 0,
    stima_mensile_fissa_eur: Number(r.stima_mensile_fissa_eur) || 0,
  };
}

export function mapCompanyFiscalProfileRow(
  row: CompanyFiscalProfileRow
): CompanyFiscalProfile {
  return {
    id: row.id,
    companyKey: row.company_key,
    formaGiuridica: row.forma_giuridica,
    regimeIva: row.regime_iva,
    ivaPeriodo: row.iva_periodo,
    cooperativaSocialeL381: row.cooperativa_sociale_l381,
    zonaSvantaggiata: row.zona_svantaggiata,
    otdCount: row.otd_count,
    otiCount: row.oti_count,
    tipiColture: asTipoColture(row.tipi_colture),
    inpsParametri: asInps(row.inps_parametri),
    aliquotaIresPct: Number(row.aliquota_ires_pct) || 0,
    aliquotaIrapPct: Number(row.aliquota_irap_pct) || 0,
    aliquotaStimaGenericaPct: Number(row.aliquota_stima_generica_pct) || 0,
    note: row.note ?? "",
    openDataEnabled: Boolean(row.open_data_enabled),
    openDataLastSyncAt: row.open_data_last_sync_at,
    versione: row.versione,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function profileToAuditPayload(
  profile: CompanyFiscalProfile
): Record<string, unknown> {
  return {
    formaGiuridica: profile.formaGiuridica,
    regimeIva: profile.regimeIva,
    ivaPeriodo: profile.ivaPeriodo,
    cooperativaSocialeL381: profile.cooperativaSocialeL381,
    zonaSvantaggiata: profile.zonaSvantaggiata,
    otdCount: profile.otdCount,
    otiCount: profile.otiCount,
    tipiColture: profile.tipiColture,
    inpsParametri: profile.inpsParametri,
    aliquotaIresPct: profile.aliquotaIresPct,
    aliquotaIrapPct: profile.aliquotaIrapPct,
    aliquotaStimaGenericaPct: profile.aliquotaStimaGenericaPct,
    note: profile.note,
    openDataEnabled: profile.openDataEnabled,
    versione: profile.versione,
  };
}

export function labelRegimeIva(regime: RegimeIvaFiscale): string {
  return regime === "ordinario"
    ? "Ordinario"
    : "Speciale agricolo art. 34 DPR 633/72";
}

export function labelFormaGiuridica(f: FormaGiuridicaFiscale): string {
  if (f === "cooperativa_agricola_sociale_arl") {
    return "Cooperativa Agricola e Sociale A.R.L.";
  }
  return f;
}
