import { createHash, randomBytes, randomInt } from "crypto";
import {
  EMAIL_OTP_LENGTH,
  EMAIL_OTP_TTL_MINUTES,
  TWO_FA_SESSION_HOURS,
} from "@/lib/auth/constants";

export function generateEmailOtp(): string {
  const max = 10 ** EMAIL_OTP_LENGTH;
  const code = randomInt(0, max).toString().padStart(EMAIL_OTP_LENGTH, "0");
  return code;
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function otpExpiresAt(): Date {
  return new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60 * 1000);
}

export function twoFaSessionExpiresAt(): Date {
  return new Date(Date.now() + TWO_FA_SESSION_HOURS * 60 * 60 * 1000);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
