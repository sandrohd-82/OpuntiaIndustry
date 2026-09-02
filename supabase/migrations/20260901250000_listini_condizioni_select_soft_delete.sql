-- ISO 9001 10.2 / 8.5.2: le condizioni soft-deleted restano leggibili
-- all’operatore (audit). Il SELECT precedente (deleted_at is null) faceva
-- fallire l’UPDATE di soft-delete (RETURNING invisibile) e bloccava
-- ogni Salva successivo sulla riga prodotto.

drop policy if exists "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());
