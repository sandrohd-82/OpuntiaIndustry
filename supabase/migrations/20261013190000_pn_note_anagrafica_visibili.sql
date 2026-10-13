-- Le note attive legate a un'azienda si leggono da chi già lavora mail,
-- ordini, campionature e fatture. Le altre note restano dell'autore e dei taggati.

drop policy if exists "pn_note_select_anagrafica" on public.pn_note;
create policy "pn_note_select_anagrafica"
  on public.pn_note for select to authenticated
  using (
    deleted_at is null
    and stato = 'attiva'
    and entity_id is not null
    and entity_type in ('cliente', 'fornitore', 'cliente_possibile')
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.has_area_access('webmail')
      or public.has_area_access('area-fiscale')
      or public.is_superadmin()
    )
  );

-- Risolve l'azienda da id o da una mail (anche referente) senza aprire
-- l'intera rubrica a chi ha solo la casella. Restituisce i campi del banner.

create or replace function public.allerte_schede_anagrafica(
  p_aziende jsonb,
  p_emails text[]
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  mails text[] := (
    select coalesce(array_agg(distinct lower(trim(x))), '{}'::text[])
    from unnest(coalesce(p_emails, '{}'::text[])) as x
    where position('@' in x) > 0
  );
  out jsonb := '[]'::jsonb;
begin
  if not (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  ) then
    return '[]'::jsonb;
  end if;

  with seed as (
    select (elem->>'tipo') as tipo, (elem->>'id')::uuid as id
    from jsonb_array_elements(coalesce(p_aziende, '[]'::jsonb)) as elem
    where (elem->>'tipo') in ('cliente', 'fornitore', 'cliente_possibile')
      and (elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  trovati as (
    select 0 as priorita, tipo, id from seed
    union all
    select 1, 'cliente', c.id
    from public.clienti c
    where c.deleted_at is null
      and cardinality(mails) > 0
      and (
        lower(coalesce(c.email, '')) = any (mails)
        or lower(coalesce(c.pec, '')) = any (mails)
        or exists (
          select 1
          from unnest(coalesce(c.email_generiche, '{}'::text[])) as g
          where lower(g) = any (mails)
        )
      )
    union all
    select 1, 'cliente_possibile', p.id
    from public.clienti_possibili p
    where p.deleted_at is null
      and cardinality(mails) > 0
      and (
        lower(coalesce(p.email, '')) = any (mails)
        or lower(coalesce(p.pec, '')) = any (mails)
        or exists (
          select 1
          from unnest(coalesce(p.email_generiche, '{}'::text[])) as g
          where lower(g) = any (mails)
        )
      )
    union all
    select 1, 'fornitore', f.id
    from public.fornitori f
    where f.deleted_at is null
      and cardinality(mails) > 0
      and (
        lower(coalesce(f.email, '')) = any (mails)
        or lower(coalesce(f.pec, '')) = any (mails)
      )
    union all
    select 1, rc.azienda_tipo, rc.azienda_id
    from public.rubrica_contatti rc
    where rc.deleted_at is null
      and rc.azienda_id is not null
      and rc.azienda_tipo in ('cliente', 'fornitore', 'cliente_possibile')
      and cardinality(mails) > 0
      and lower(coalesce(rc.email, '')) = any (mails)
  ),
  limitati as (
    select tipo, id
    from (
      select distinct on (tipo, id) tipo, id, priorita
      from trovati
      order by tipo, id, priorita
    ) as unici
    order by priorita
    limit 8
  )
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  into out
  from (
    select
      l.tipo,
      l.id,
      case
        when l.tipo = 'cliente' then coalesce(c.codice_targa, '')
        when l.tipo = 'fornitore' then coalesce(f.codice_targa, '')
        else ''
      end as codice_targa,
      coalesce(c.ragione_sociale, p.ragione_sociale, f.ragione_sociale, '') as ragione_sociale,
      coalesce(p.note_interne, '') as note_interne,
      (
        select coalesce(jsonb_agg(distinct mail), '[]'::jsonb)
        from (
          select lower(coalesce(c.email, '')) as mail
          union all select lower(coalesce(c.pec, ''))
          union all select lower(coalesce(p.email, ''))
          union all select lower(coalesce(p.pec, ''))
          union all select lower(coalesce(f.email, ''))
          union all select lower(coalesce(f.pec, ''))
          union all
          select lower(g)
          from unnest(
            coalesce(c.email_generiche, '{}'::text[])
            || coalesce(p.email_generiche, '{}'::text[])
          ) as g
          union all
          select lower(coalesce(rc.email, ''))
          from public.rubrica_contatti rc
          where rc.deleted_at is null
            and rc.azienda_id = l.id
            and rc.azienda_tipo = l.tipo
        ) as m
        where mail like '%@%'
      ) as emails,
      (
        select coalesce(jsonb_agg(distinct tel), '[]'::jsonb)
        from (
          select trim(coalesce(c.telefono, '')) as tel
          union all select trim(coalesce(p.telefono, ''))
          union all select trim(coalesce(f.telefono, ''))
          union all
          select trim(g)
          from unnest(
            coalesce(c.telefoni_generici, '{}'::text[])
            || coalesce(p.telefoni_generici, '{}'::text[])
          ) as g
          union all
          select trim(coalesce(rc.telefono, ''))
          from public.rubrica_contatti rc
          where rc.deleted_at is null
            and rc.azienda_id = l.id
            and rc.azienda_tipo = l.tipo
        ) as t
        where tel <> ''
      ) as telefoni
    from limitati l
    left join public.clienti c
      on l.tipo = 'cliente' and c.id = l.id and c.deleted_at is null
    left join public.clienti_possibili p
      on l.tipo = 'cliente_possibile' and p.id = l.id and p.deleted_at is null
    left join public.fornitori f
      on l.tipo = 'fornitore' and f.id = l.id and f.deleted_at is null
  ) as s;

  return coalesce(out, '[]'::jsonb);
end;
$$;

revoke all on function public.allerte_schede_anagrafica(jsonb, text[])
  from public, anon;
grant execute on function public.allerte_schede_anagrafica(jsonb, text[])
  to authenticated;
