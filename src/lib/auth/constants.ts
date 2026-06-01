/** Cookie HttpOnly: sessione completata dopo verifica 2° fattore (email) */
export const TWO_FA_SESSION_COOKIE = "industry_2fa_verified";

/** Durata sessione 2FA (ore) */
export const TWO_FA_SESSION_HOURS = 12;

/** Lunghezza OTP inviato via email */
export const EMAIL_OTP_LENGTH = 6;

/** Minuti di validità OTP */
export const EMAIL_OTP_TTL_MINUTES = 10;

/** Massimo tentativi OTP prima del blocco temporaneo */
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
