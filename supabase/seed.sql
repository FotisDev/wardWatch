-- Demo data (fictional patients). Runs on `supabase db reset`.
insert into public.wards (code, name) values
  ('CARD', 'Cardiology'),
  ('GMED', 'General Medicine');

insert into public.beds (ward_id, label)
select w.id, 'Bed ' || n
from public.wards w, generate_series(1, 6) as n;

insert into public.patients (ward_id, bed_id, display_name, mrn)
select b.ward_id, b.id, p.name, p.mrn
from (values
  ('CARD', 'Bed 1', 'A. Jensen',    'MRN-1001'),
  ('CARD', 'Bed 2', 'M. Nielsen',   'MRN-1002'),
  ('CARD', 'Bed 3', 'K. Hansen',    'MRN-1003'),
  ('CARD', 'Bed 5', 'L. Pedersen',  'MRN-1004'),
  ('GMED', 'Bed 1', 'S. Andersen',  'MRN-2001'),
  ('GMED', 'Bed 2', 'J. Larsen',    'MRN-2002'),
  ('GMED', 'Bed 4', 'E. Sorensen',  'MRN-2003'),
  ('GMED', 'Bed 6', 'T. Rasmussen', 'MRN-2004')
) as p(ward, bed, name, mrn)
join public.wards w on w.code = p.ward
join public.beds  b on b.ward_id = w.id and b.label = p.bed;
