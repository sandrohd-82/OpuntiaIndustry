-- NC: sostituzione gestionale fattura (interno resta registrata e visibile) — ISO 9001

alter table public.fatture_emesse
  add column if not exists modalita_collegamento text,
  add column if not exists fattura_sostitutiva_id uuid references public.fatture_emesse (id) on delete set null;

alter table public.fatture_emesse drop constraint if exists fatture_emesse_modalita_collegamento_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_modalita_collegamento_check
  check (
    modalita_collegamento is null
    or modalita_collegamento in ('normale', 'sostituzione')
  );

comment on column public.fatture_emesse.modalita_collegamento is
  'Solo nota_credito: normale (rimborso/incasso) | sostituzione (rimpiazzo gestionale fattura, originale resta visibile)';
comment on column public.fatture_emesse.fattura_sostitutiva_id is
  'Fattura emessa che sostituisce gestionalmente quella stornata dalla NC (dicitura corretta, ecc.)';

create index if not exists fatture_emesse_sostitutiva_idx
  on public.fatture_emesse (fattura_sostitutiva_id)
  where deleted_at is null and fattura_sostitutiva_id is not null;
