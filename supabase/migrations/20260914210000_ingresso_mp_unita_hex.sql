-- Id contenitore = progressivo esadecimale unico a vita (1,2,…,9,A,B,…,F,10,…,A1).
-- La lettera di gruppo resta solo sul timbro, non nel numero.

alter table public.produzione_fogli_ingresso_unita
  drop constraint if exists fogli_ingresso_unita_codice_fmt;

alter table public.produzione_fogli_ingresso_unita
  add constraint fogli_ingresso_unita_codice_fmt check (
    codice_unita ~ '^[1-9A-F][0-9A-F]{0,11}$'
  );

comment on table public.produzione_fogli_ingresso_unita is
  'Un contenitore fisico per riga. codice_unita esadecimale unico a vita (1, A, 10, A1). scan_token nel QR: un solo carico/scarico.';

insert into public.produzione_ingresso_mp_seq (chiave, valore)
values ('unita_hex', 0)
on conflict (chiave) do nothing;

update public.produzione_ingresso_mp_seq s
set
  valore = greatest(
    s.valore,
    coalesce((
      select max(('x' || lpad(u.codice_unita, 16, '0'))::bit(64)::bigint)::integer
      from public.produzione_fogli_ingresso_unita u
      where u.deleted_at is null
        and u.codice_unita ~ '^[0-9A-Fa-f]+$'
        and length(u.codice_unita) <= 8
    ), 0)
  ),
  updated_at = now()
where s.chiave = 'unita_hex';

create or replace function public.alloc_ingresso_mp_unita_hex_seq(p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_count is null or p_count < 1 then
    return 0;
  end if;

  insert into public.produzione_ingresso_mp_seq (chiave, valore)
  values ('unita_hex', 0)
  on conflict (chiave) do nothing;

  update public.produzione_ingresso_mp_seq
  set valore = valore + p_count, updated_at = now()
  where chiave = 'unita_hex'
  returning valore into n;

  return n - p_count + 1;
end;
$$;

create or replace function public.peek_ingresso_mp_unita_hex()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  select valore into n
  from public.produzione_ingresso_mp_seq
  where chiave = 'unita_hex';
  return coalesce(n, 0) + 1;
end;
$$;

revoke all on function public.alloc_ingresso_mp_unita_hex_seq(integer) from public;
revoke all on function public.peek_ingresso_mp_unita_hex() from public;
grant execute on function public.alloc_ingresso_mp_unita_hex_seq(integer) to authenticated;
grant execute on function public.peek_ingresso_mp_unita_hex() to authenticated;
