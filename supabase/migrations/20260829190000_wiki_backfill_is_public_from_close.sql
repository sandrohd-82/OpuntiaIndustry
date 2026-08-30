-- Allinea is_public al dump MySQL scientific_research.close
-- Dump: 94 righe, close=0 → 66 (download libero), close=1 → 28 (richiesta + email).
-- La colonna is_public era nata con default false: molte schede close=0 risultavano non pubbliche.

update public.wiki_scientific_research
set
  is_public = true,
  updated_at = now()
where deleted_at is null
  and legacy_id in (
    1, 2, 3, 5, 6, 7, 8, 9, 10, 18, 19, 20, 21, 22, 23, 24, 25,
    28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 44, 45,
    48, 49, 51, 52, 53, 56, 57, 58, 61, 62, 63, 68, 69, 71, 72, 73,
    76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 87, 88, 89, 90, 91, 92, 94
  );

update public.wiki_scientific_research
set
  is_public = false,
  updated_at = now()
where deleted_at is null
  and legacy_id in (
    4, 11, 12, 13, 14, 15, 16, 17, 26, 27, 31, 39, 46, 47, 50,
    54, 55, 59, 60, 64, 65, 66, 67, 70, 74, 75, 85, 93
  );
