/** Solo env, niente pacchetto web-push (le server action badge/consenso restano leggere). */
export function getVapidPublicKey(): string | null {
  const key = (
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    ""
  ).trim();
  return key || null;
}
