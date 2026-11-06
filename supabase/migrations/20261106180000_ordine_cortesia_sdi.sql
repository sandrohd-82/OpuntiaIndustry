-- La mail di cortesia si decide insieme allo SDI.
-- true: parte in quel momento. false: non parte in automatico.
-- null: ordini già salvati, con la regola precedente.

alter table public.ordini
  add column if not exists cortesia_sdi boolean;

comment on column public.ordini.cortesia_sdi is
  'Mail di cortesia al momento dello SDI. false: il PDF si scarica e si invia a mano. Non riguarda l''avviso di merce pronta.';
