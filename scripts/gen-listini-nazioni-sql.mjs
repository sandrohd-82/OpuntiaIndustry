import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const continenti = [
  ["europa", "Europa", 1],
  ["asia", "Asia", 2],
  ["africa", "Africa", 3],
  ["america", "America", 4],
  ["oceania", "Oceania", 5],
];

const nazioni = [
  ["AL", "europa", "Albania", "{sq,en}"],
  ["AD", "europa", "Andorra", "{ca,es,fr}"],
  ["AT", "europa", "Austria", "{de}"],
  ["BY", "europa", "Bielorussia", "{be,ru}"],
  ["BE", "europa", "Belgio", "{nl,fr,de}"],
  ["BA", "europa", "Bosnia ed Erzegovina", "{bs,hr,sr}"],
  ["BG", "europa", "Bulgaria", "{bg}"],
  ["HR", "europa", "Croazia", "{hr}"],
  ["CY", "europa", "Cipro", "{el,en}"],
  ["CZ", "europa", "Cechia", "{cs}"],
  ["DK", "europa", "Danimarca", "{da}"],
  ["EE", "europa", "Estonia", "{et}"],
  ["FI", "europa", "Finlandia", "{fi,sv}"],
  ["FR", "europa", "Francia", "{fr}"],
  ["DE", "europa", "Germania", "{de}"],
  ["GR", "europa", "Grecia", "{el}"],
  ["HU", "europa", "Ungheria", "{hu}"],
  ["IS", "europa", "Islanda", "{is}"],
  ["IE", "europa", "Irlanda", "{en,ga}"],
  ["IT", "europa", "Italia", "{it}"],
  ["XK", "europa", "Kosovo", "{sq,sr}"],
  ["LV", "europa", "Lettonia", "{lv}"],
  ["LI", "europa", "Liechtenstein", "{de}"],
  ["LT", "europa", "Lituania", "{lt}"],
  ["LU", "europa", "Lussemburgo", "{fr,de}"],
  ["MT", "europa", "Malta", "{mt,en}"],
  ["MD", "europa", "Moldavia", "{ro}"],
  ["MC", "europa", "Monaco", "{fr}"],
  ["ME", "europa", "Montenegro", "{sr}"],
  ["NL", "europa", "Paesi Bassi", "{nl}"],
  ["MK", "europa", "Macedonia del Nord", "{mk}"],
  ["NO", "europa", "Norvegia", "{nb}"],
  ["PL", "europa", "Polonia", "{pl}"],
  ["PT", "europa", "Portogallo", "{pt}"],
  ["RO", "europa", "Romania", "{ro}"],
  ["RU", "europa", "Russia", "{ru}"],
  ["SM", "europa", "San Marino", "{it}"],
  ["RS", "europa", "Serbia", "{sr}"],
  ["SK", "europa", "Slovacchia", "{sk}"],
  ["SI", "europa", "Slovenia", "{sl}"],
  ["ES", "europa", "Spagna", "{es}"],
  ["SE", "europa", "Svezia", "{sv}"],
  ["CH", "europa", "Svizzera", "{de,fr,it}"],
  ["UA", "europa", "Ucraina", "{uk}"],
  ["GB", "europa", "Regno Unito", "{en}"],
  ["VA", "europa", "Città del Vaticano", "{it}"],
  ["AE", "asia", "Emirati Arabi Uniti", "{ar,en}"],
  ["AM", "asia", "Armenia", "{hy}"],
  ["AZ", "asia", "Azerbaigian", "{az}"],
  ["BH", "asia", "Bahrein", "{ar,en}"],
  ["BD", "asia", "Bangladesh", "{bn,en}"],
  ["KH", "asia", "Cambogia", "{km,en}"],
  ["CN", "asia", "Cina", "{zh}"],
  ["GE", "asia", "Georgia", "{ka}"],
  ["HK", "asia", "Hong Kong", "{zh,en}"],
  ["IN", "asia", "India", "{hi,en}"],
  ["ID", "asia", "Indonesia", "{id}"],
  ["IR", "asia", "Iran", "{fa}"],
  ["IQ", "asia", "Iraq", "{ar}"],
  ["IL", "asia", "Israele", "{he,en}"],
  ["JP", "asia", "Giappone", "{ja}"],
  ["JO", "asia", "Giordania", "{ar,en}"],
  ["KZ", "asia", "Kazakistan", "{kk,ru}"],
  ["KW", "asia", "Kuwait", "{ar,en}"],
  ["LB", "asia", "Libano", "{ar,fr,en}"],
  ["MY", "asia", "Malesia", "{ms,en}"],
  ["MN", "asia", "Mongolia", "{mn}"],
  ["NP", "asia", "Nepal", "{ne,en}"],
  ["OM", "asia", "Oman", "{ar,en}"],
  ["PK", "asia", "Pakistan", "{ur,en}"],
  ["PH", "asia", "Filippine", "{en}"],
  ["QA", "asia", "Qatar", "{ar,en}"],
  ["SA", "asia", "Arabia Saudita", "{ar,en}"],
  ["SG", "asia", "Singapore", "{en,zh}"],
  ["KR", "asia", "Corea del Sud", "{ko}"],
  ["LK", "asia", "Sri Lanka", "{si,en}"],
  ["TW", "asia", "Taiwan", "{zh}"],
  ["TH", "asia", "Thailandia", "{th,en}"],
  ["TR", "asia", "Turchia", "{tr}"],
  ["UZ", "asia", "Uzbekistan", "{uz,ru}"],
  ["VN", "asia", "Vietnam", "{vi,en}"],
  ["DZ", "africa", "Algeria", "{ar,fr}"],
  ["AO", "africa", "Angola", "{pt}"],
  ["CM", "africa", "Camerun", "{fr,en}"],
  ["CI", "africa", "Costa d'Avorio", "{fr}"],
  ["EG", "africa", "Egitto", "{ar,en}"],
  ["ET", "africa", "Etiopia", "{am,en}"],
  ["GH", "africa", "Ghana", "{en}"],
  ["KE", "africa", "Kenya", "{en}"],
  ["MA", "africa", "Marocco", "{ar,fr}"],
  ["MU", "africa", "Mauritius", "{en,fr}"],
  ["MZ", "africa", "Mozambico", "{pt}"],
  ["NG", "africa", "Nigeria", "{en}"],
  ["SN", "africa", "Senegal", "{fr}"],
  ["ZA", "africa", "Sudafrica", "{en}"],
  ["TZ", "africa", "Tanzania", "{en}"],
  ["TN", "africa", "Tunisia", "{ar,fr}"],
  ["UG", "africa", "Uganda", "{en}"],
  ["AR", "america", "Argentina", "{es}"],
  ["BO", "america", "Bolivia", "{es}"],
  ["BR", "america", "Brasile", "{pt}"],
  ["CA", "america", "Canada", "{en,fr}"],
  ["CL", "america", "Cile", "{es}"],
  ["CO", "america", "Colombia", "{es}"],
  ["CR", "america", "Costa Rica", "{es}"],
  ["CU", "america", "Cuba", "{es}"],
  ["DO", "america", "Repubblica Dominicana", "{es}"],
  ["EC", "america", "Ecuador", "{es}"],
  ["GT", "america", "Guatemala", "{es}"],
  ["HT", "america", "Haiti", "{fr}"],
  ["JM", "america", "Giamaica", "{en}"],
  ["MX", "america", "Messico", "{es}"],
  ["PA", "america", "Panama", "{es,en}"],
  ["PY", "america", "Paraguay", "{es}"],
  ["PE", "america", "Perù", "{es}"],
  ["UY", "america", "Uruguay", "{es}"],
  ["US", "america", "Stati Uniti", "{en}"],
  ["VE", "america", "Venezuela", "{es}"],
  ["AU", "oceania", "Australia", "{en}"],
  ["FJ", "oceania", "Figi", "{en}"],
  ["NZ", "oceania", "Nuova Zelanda", "{en}"],
  ["PG", "oceania", "Papua Nuova Guinea", "{en}"],
];

function esc(s) {
  return s.replaceAll("'", "''");
}

const cRows = continenti
  .map(([c, nome, s]) => `  ('${c}', '${esc(nome)}', ${s})`)
  .join(",\n");
const nRows = nazioni
  .map(
    ([iso, c, nome, ling]) =>
      `  ('${iso}', '${c}', '${esc(nome)}', '${ling}')`
  )
  .join(",\n");

const sql = `-- Listini: copertura nazioni (continente → nazione) e versioni lingua
-- ISO 9001: audit + soft delete su listini_nazioni; catalogo chiuso ISO 3166.

create table if not exists public.geo_continenti (
  codice text primary key,
  nome text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create table if not exists public.geo_nazioni (
  id uuid primary key default gen_random_uuid(),
  iso2 text not null,
  continente_codice text not null references public.geo_continenti (codice),
  nome text not null,
  lingue_iso text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint geo_nazioni_iso2_len check (char_length(iso2) = 2)
);

create unique index if not exists geo_nazioni_iso2_uidx
  on public.geo_nazioni (upper(iso2))
  where deleted_at is null;

create index if not exists geo_nazioni_continente_idx
  on public.geo_nazioni (continente_codice)
  where deleted_at is null;

insert into public.geo_continenti (codice, nome, sort_order)
values
${cRows}
on conflict (codice) do update
set nome = excluded.nome, sort_order = excluded.sort_order;

insert into public.geo_nazioni (iso2, continente_codice, nome, lingue_iso)
select v.iso2, v.continente_codice, v.nome, v.lingue_iso::text[]
from (values
${nRows}
) as v(iso2, continente_codice, nome, lingue_iso)
where not exists (
  select 1 from public.geo_nazioni g
  where upper(g.iso2) = upper(v.iso2) and g.deleted_at is null
);

alter table public.listini
  add column if not exists locale text not null default 'it';

alter table public.listini
  add column if not exists listino_origine_id uuid references public.listini (id) on delete set null;

comment on column public.listini.locale is
  'Lingua della versione (ISO 639-1). La bozza operativa è it; le copie lingua nascono a Listino completo.';

comment on column public.listini.listino_origine_id is
  'Listino madre se questa riga è una versione in lingua. Null = listino operativo.';

create index if not exists listini_origine_locale_idx
  on public.listini (listino_origine_id, locale)
  where deleted_at is null;

alter table public.listini drop constraint if exists listini_stato_check;
alter table public.listini
  add constraint listini_stato_check check (
    stato in ('bozza', 'in_revisione', 'in_uso', 'obsoleto', 'bozza_traduzione')
  );

create table if not exists public.listini_nazioni (
  id uuid primary key default gen_random_uuid(),
  listino_id uuid not null references public.listini (id) on delete cascade,
  nazione_id uuid not null references public.geo_nazioni (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.listini_nazioni is
  'Copertura commerciale del listino. Soft delete. N nazioni, anche da continenti diversi.';

create unique index if not exists listini_nazioni_active_uidx
  on public.listini_nazioni (listino_id, nazione_id)
  where deleted_at is null;

drop trigger if exists geo_continenti_updated_at on public.geo_continenti;
create trigger geo_continenti_updated_at
  before update on public.geo_continenti
  for each row execute function public.set_updated_at();

drop trigger if exists geo_nazioni_updated_at on public.geo_nazioni;
create trigger geo_nazioni_updated_at
  before update on public.geo_nazioni
  for each row execute function public.set_updated_at();

drop trigger if exists listini_nazioni_updated_at on public.listini_nazioni;
create trigger listini_nazioni_updated_at
  before update on public.listini_nazioni
  for each row execute function public.set_updated_at();

alter table public.geo_continenti enable row level security;
alter table public.geo_nazioni enable row level security;
alter table public.listini_nazioni enable row level security;

drop policy if exists geo_continenti_select_amm on public.geo_continenti;
create policy geo_continenti_select_amm
  on public.geo_continenti for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists geo_nazioni_select_amm on public.geo_nazioni;
create policy geo_nazioni_select_amm
  on public.geo_nazioni for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists listini_nazioni_select_amm on public.listini_nazioni;
create policy listini_nazioni_select_amm
  on public.listini_nazioni for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists listini_nazioni_insert_amm on public.listini_nazioni;
create policy listini_nazioni_insert_amm
  on public.listini_nazioni for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists listini_nazioni_update_amm on public.listini_nazioni;
create policy listini_nazioni_update_amm
  on public.listini_nazioni for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select on table public.geo_continenti to authenticated;
grant select on table public.geo_nazioni to authenticated;
grant select, insert, update on table public.listini_nazioni to authenticated;
grant all on table public.geo_continenti to postgres, service_role;
grant all on table public.geo_nazioni to postgres, service_role;
grant all on table public.listini_nazioni to postgres, service_role;
revoke delete on table public.geo_continenti from authenticated;
revoke delete on table public.geo_nazioni from authenticated;
revoke delete on table public.listini_nazioni from authenticated;
`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(
  root,
  "supabase",
  "migrations",
  "20260901220000_listini_nazioni_versioni_lingua.sql"
);
writeFileSync(dest, sql, "utf8");
console.log(`wrote ${dest} (${nazioni.length} nazioni)`);
