-- Commerciale nel menu: dopo Amministrazione, prima di Ricerca e sviluppo.

update public.areas
set sort_order = 15
where slug = 'commerciale';
