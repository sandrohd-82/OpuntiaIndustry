-- Area Script in fondo al menu laterale (dopo Impostazioni).
update public.areas
set sort_order = 100
where slug = 'script';
