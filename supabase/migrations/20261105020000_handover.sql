-- Per-patient score trend over a window, for the shift handover. Runs as the caller, so RLS applies.
create function public.patient_score_summary(p_ward_id uuid, p_since timestamptz)
returns table (patient_id uuid, first_score int, last_score int, max_score int, readings int)
language sql stable set search_path = ''
as $$
  select v.patient_id,
         (array_agg(v.score order by v.recorded_at))[1],
         (array_agg(v.score order by v.recorded_at desc))[1],
         max(v.score),
         count(*)::int
  from public.vitals v
  join public.patients p on p.id = v.patient_id
  where p.ward_id = p_ward_id and v.recorded_at >= p_since
  group by v.patient_id
$$;

revoke execute on function public.patient_score_summary(uuid, timestamptz) from public, anon;
grant  execute on function public.patient_score_summary(uuid, timestamptz) to authenticated;
