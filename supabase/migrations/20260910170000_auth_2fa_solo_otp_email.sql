-- ISO 9001: secondo fattore unico = OTP email (niente Authenticator / TOTP app).
-- Vale per tutti gli operatori, inclusi Rosario Pisano e Selenia Rita Curella.

update public.user_second_factor
set
  method = 'email',
  totp_secret_encrypted = null,
  updated_at = now();

comment on table public.user_second_factor is
  'Stato del 2° fattore: solo OTP inviato all''email dell''operatore (method = email). Authenticator/TOTP non è utilizzato.';

comment on column public.user_second_factor.totp_secret_encrypted is
  'Obsoleto: secret TOTP non più usato. Deve restare NULL.';

update public.areas
set description = 'Configurazione sistema e profilo fiscale aziendale'
where slug = 'impostazioni';
