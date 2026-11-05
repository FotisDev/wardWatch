-- Append-only record of who did what. Rows are written only by triggers and can
-- never be changed or removed. No foreign keys, so history outlives the rows it describes.
create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,
  ward_id   uuid,
  action    text not null,
  entity    text not null,
  entity_id text not null,
  details   jsonb not null default '{}'
);
create index audit_log_ward_time_idx on public.audit_log (ward_id, at desc);

create function public.audit_log_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

alter table public.audit_log enable row level security;
create policy "ward staff read audit log" on public.audit_log
  for select to authenticated using (public.can_access_ward(ward_id));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create function public.audit(p_ward uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (actor_id, ward_id, action, entity, entity_id, details)
  values (auth.uid(), p_ward, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;
revoke execute on function public.audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

create function public.audit_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit(new.ward_id, 'alert.created', 'alert', new.id::text,
      jsonb_build_object('patient_id', new.patient_id, 'severity', new.severity, 'score', new.score));
    return null;
  end if;

  if new.severity > old.severity then
    perform public.audit(new.ward_id, 'alert.escalated', 'alert', new.id::text,
      jsonb_build_object('patient_id', new.patient_id, 'from', old.severity, 'to', new.severity, 'score', new.score));
  end if;
  if new.status is distinct from old.status and new.status <> 'open' then
    perform public.audit(new.ward_id, 'alert.' || new.status, 'alert', new.id::text,
      jsonb_build_object('patient_id', new.patient_id, 'severity', new.severity));
  end if;
  return null;
end $$;

create trigger alerts_audit
  after insert or update on public.alerts
  for each row execute function public.audit_alerts();

create function public.audit_patients()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit(new.ward_id, 'patient.admitted', 'patient', new.id::text,
      jsonb_build_object('bed_id', new.bed_id));
  elsif new.discharged_at is not null and old.discharged_at is null then
    perform public.audit(new.ward_id, 'patient.discharged', 'patient', new.id::text, '{}');
  elsif new.bed_id is distinct from old.bed_id or new.ward_id is distinct from old.ward_id then
    perform public.audit(new.ward_id, 'patient.moved', 'patient', new.id::text,
      jsonb_build_object('from_ward', old.ward_id, 'from_bed', old.bed_id, 'to_bed', new.bed_id));
  end if;
  return null;
end $$;

create trigger patients_audit
  after insert or update on public.patients
  for each row execute function public.audit_patients();

create function public.audit_profiles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.ward_id is distinct from old.ward_id then
    perform public.audit(coalesce(new.ward_id, old.ward_id), 'staff.access_changed', 'profile', new.id::text,
      jsonb_build_object('from_role', old.role, 'to_role', new.role, 'from_ward', old.ward_id, 'to_ward', new.ward_id));
  end if;
  return null;
end $$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profiles();
