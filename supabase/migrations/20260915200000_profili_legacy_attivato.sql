-- Profili già in uso prima della fase Test: già abilitati (niente mail primo accesso).
-- ISO 9001: attivato_at traccia l'abilitazione; backfill da created_at / ultimo login.

update public.profiles p
set attivato_at = coalesce(p.attivato_at, p.created_at, now())
where p.attivato_at is null
  and (
    p.password_impostata_at is not null
    or p.created_at < timestamptz '2026-09-09 00:00:00+00'
    or exists (
      select 1
      from auth.users u
      where u.id = p.id
        and u.last_sign_in_at is not null
    )
  );
