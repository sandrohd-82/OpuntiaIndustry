-- La scrittura degli eventi resta chiusa. Si tolgono a service_role
-- TRUNCATE e TRIGGER, che aggirano il divieto di cancellazione, e si
-- rende vincolante la compensazione unica sullo stesso lotto.

revoke truncate, trigger, references on table public.magazzino_mp_lotti
  from public, anon, authenticated, service_role,
       magazzino_mp_movimento, magazzino_mp_pulizia;
revoke truncate, trigger, references on table public.magazzino_mp_lotto_eventi
  from public, anon, authenticated, service_role,
       magazzino_mp_movimento, magazzino_mp_pulizia;
revoke truncate, trigger, references on table public.magazzino_mp_haccp_deroghe
  from public, anon, authenticated, service_role,
       magazzino_mp_movimento, magazzino_mp_pulizia;

alter table public.magazzino_mp_lotto_eventi
  drop constraint if exists magazzino_mp_lotto_eventi_id_lotto_key;
alter table public.magazzino_mp_lotto_eventi
  add constraint magazzino_mp_lotto_eventi_id_lotto_key
  unique (id, lotto_id);

create unique index if not exists magazzino_mp_lotto_eventi_una_compensazione_uidx
  on public.magazzino_mp_lotto_eventi (evento_riferimento_id)
  where tipo = 'rettifica_evento';

alter table public.magazzino_mp_lotto_eventi
  drop constraint if exists magazzino_mp_lotto_eventi_riferimento_stesso_lotto;
alter table public.magazzino_mp_lotto_eventi
  add constraint magazzino_mp_lotto_eventi_riferimento_stesso_lotto
  foreign key (evento_riferimento_id, lotto_id)
  references public.magazzino_mp_lotto_eventi (id, lotto_id);

comment on constraint magazzino_mp_lotto_eventi_riferimento_stesso_lotto
  on public.magazzino_mp_lotto_eventi is
  'Una rettifica compensa un evento del medesimo lotto. Non compensa un evento di un lotto diverso.';
