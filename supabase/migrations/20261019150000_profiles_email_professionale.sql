-- Mail di lavoro dell'operatore, distinta da quella di accesso.
-- Resta vuota finché lui non la sceglie. I documenti in uscita usano solo questa.

alter table public.profiles
  add column if not exists email_professionale text;

comment on column public.profiles.email_professionale is
  'Mail lavorativa mostrata su preventivi, fatture e comunicazioni in uscita. Vuota finché l''operatore non la sceglie.';
