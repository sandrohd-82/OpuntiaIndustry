-- Elimina fisicamente schede soft-delete SENZA attività (liberano anche eventuale rumore)
-- Clienti senza ordini attivi; fornitori senza materie bio collegate
-- ISO: le schede con attività restano (soft-delete con targa bloccata)

delete from public.clienti c
where c.deleted_at is not null
  and not exists (
    select 1 from public.ordini o
    where o.cliente_id = c.id and o.deleted_at is null
  );

delete from public.fornitori f
where f.deleted_at is not null
  and not exists (
    select 1 from public.materie_prime m
    where m.fornitore_bio_id = f.id and m.deleted_at is null
  );
