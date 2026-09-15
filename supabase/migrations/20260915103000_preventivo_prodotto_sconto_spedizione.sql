-- Preventivo: consegna da concordare, sconto extra riga, traccia stima spedizione +30%
-- ISO 9001: audit già su preventivi/preventivi_righe; soft delete sul documento.

alter table public.preventivi drop constraint if exists preventivi_consegna_check;
alter table public.preventivi
  add constraint preventivi_consegna_check check (
    consegna_metodo in (
      'da_concordare',
      'ritiro',
      'corriere_nostro',
      'corriere_cliente'
    )
  );

alter table public.preventivi
  alter column consegna_metodo set default 'da_concordare';

alter table public.preventivi
  add column if not exists spedizione_importo_base numeric(12, 2) not null default 0;

alter table public.preventivi
  add column if not exists spedizione_markup_pct numeric(6, 2) not null default 30;

alter table public.preventivi
  add column if not exists spedizione_fonte text not null default 'da_concordare';

alter table public.preventivi drop constraint if exists preventivi_spedizione_fonte_check;
alter table public.preventivi
  add constraint preventivi_spedizione_fonte_check check (
    spedizione_fonte in (
      'da_concordare',
      'a_carico_acquirente',
      'stima_api',
      'manuale',
      'ritiro'
    )
  );

update public.preventivi
set spedizione_fonte = case
  when consegna_metodo = 'ritiro' then 'ritiro'
  when consegna_metodo = 'corriere_cliente' then 'a_carico_acquirente'
  when consegna_metodo = 'corriere_nostro' then 'manuale'
  else 'da_concordare'
end
where spedizione_fonte = 'da_concordare'
  and consegna_metodo <> 'da_concordare';

comment on column public.preventivi.consegna_metodo is
  'da_concordare | ritiro | corriere_nostro | corriere_cliente (a carico acquirente)';
comment on column public.preventivi.spedizione_importo_base is
  'Tariffa corriere prima del margine di sicurezza';
comment on column public.preventivi.spedizione_markup_pct is
  'Maggiorazione di sicurezza sul nolo (default 30)';
comment on column public.preventivi.spedizione_fonte is
  'Origine importo spedizione: da concordare, acquirente, API, manuale, ritiro';

alter table public.preventivi_righe
  add column if not exists sconto_extra_pct numeric(6, 2) not null default 0;

comment on column public.preventivi_righe.sconto_extra_pct is
  'Sconto extra rispetto al listino (percentuale), tracciato sulla riga preventivo';
