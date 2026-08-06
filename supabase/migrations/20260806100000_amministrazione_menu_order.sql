-- Amministrazione subito dopo Dashboard nel menu laterale
update public.areas set sort_order = 0 where slug = 'dashboard';
update public.areas set sort_order = 5 where slug = 'amministrazione';
update public.areas set sort_order = 10 where slug = 'commerciale';
update public.areas set sort_order = 20 where slug = 'produzione';
update public.areas set sort_order = 30 where slug = 'magazzino';
update public.areas set sort_order = 40 where slug = 'acquisti';
update public.areas set sort_order = 50 where slug = 'hr';
update public.areas set sort_order = 99 where slug = 'impostazioni';

update public.areas
set description = 'Ordini, fatture e dipendenti'
where slug = 'amministrazione';
