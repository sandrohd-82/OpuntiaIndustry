import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function vaultKey(): Buffer {
  const raw = process.env.CREDENTIALS_VAULT_KEY?.trim() ?? "";
  if (raw.length < 16) {
    throw new Error("CREDENTIALS_VAULT_KEY mancante");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function caveauConfigurato(): boolean {
  const key = process.env.CREDENTIALS_VAULT_KEY?.trim() ?? "";
  return key.length >= 16;
}

export function cifraPasswordCaveau(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, vaultKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

export function decifraPasswordCaveau(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("payload caveau illeggibile");
  }
  const decipher = createDecipheriv(ALGORITHM, vaultKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
