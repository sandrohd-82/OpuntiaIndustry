-- Fatture ricevute: acconto / saldo (default saldo) — tracciabilità ISO 9001

alter table public.fatture_ricevute
  add column if not exists natura_documento text not null default 'saldo';

update public.fatture_ricevute
set natura_documento = 'saldo'
where trim(coalesce(natura_documento, '')) = ''
   or natura_documento not in ('acconto', 'saldo');

alter table public.fatture_ricevute
  drop constraint if exists fatture_ricevute_natura_documento_check;

alter table public.fatture_ricevute
  add constraint fatture_ricevute_natura_documento_check
  check (natura_documento in ('acconto', 'saldo'));

comment on column public.fatture_ricevute.natura_documento is
  'Natura del documento fornitore: acconto o saldo (default saldo).';

create index if not exists fatture_ricevute_natura_documento_idx
  on public.fatture_ricevute (natura_documento)
  where deleted_at is null;
