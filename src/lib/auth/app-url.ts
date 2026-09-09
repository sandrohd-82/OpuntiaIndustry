/** URL pubblico del gestionale (mail di attivazione / primo accesso). */
export function getPublicAppUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    const host = production.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

export function primoAccessoUrl(token: string): string {
  const base = getPublicAppUrl();
  return `${base}/primo-accesso?token=${encodeURIComponent(token)}`;
}

export const GOOGLE_AUTHENTICATOR_ANDROID =
  "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2";
export const GOOGLE_AUTHENTICATOR_IOS =
  "https://apps.apple.com/app/google-authenticator/id388497605";
