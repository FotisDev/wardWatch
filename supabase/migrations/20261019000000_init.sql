create type public.app_role        as enum ('nurse', 'charge_nurse', 'admin');
create type public.alert_severity  as enum ('low', 'medium', 'high', 'critical');
create type public.alert_status    as enum ('open', 'acknowledged', 'resolved');
create type public.device_platform as enum ('web', 'ios', 'android');

create table public.wards (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       public.app_role not null default 'nurse',
  ward_id    uuid references public.wards (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.beds (
  id      uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards (id) on delete cascade,
  label   text not null,
  unique (ward_id, label)
);

create table public.patients (
  id            uuid primary key default gen_random_uuid(),
  ward_id       uuid not null references public.wards (id),
  bed_id        uuid unique references public.beds (id) on delete set null,
  display_name  text not null,
  mrn           text not null unique,
  admitted_at   timestamptz not null default now(),
  discharged_at timestamptz
);

create table public.vitals (
  id          bigint generated always as identity primary key,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  heart_rate  smallint not null check (heart_rate between 0 and 300),
  resp_rate   smallint not null check (resp_rate between 0 and 80),
  spo2        smallint not null check (spo2 between 0 and 100),
  systolic_bp smallint not null check (systolic_bp between 0 and 300),
  temperature numeric(4,1) not null check (temperature between 25 and 45),
  score       smallint,
  source      text not null default 'simulator'
);
create index vitals_patient_time_idx on public.vitals (patient_id, recorded_at desc);

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  ward_id         uuid not null references public.wards (id),
  vitals_id       bigint references public.vitals (id) on delete set null,
  kind            text not null default 'early_warning',
  severity        public.alert_severity not null,
  score           smallint not null,
  message         text not null,
  status          public.alert_status not null default 'open',
  created_at      timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id),
  acknowledged_at timestamptz,
  resolved_at     timestamptz
);
create index alerts_ward_status_idx on public.alerts (ward_id, status, created_at desc);
create unique index alerts_one_active_per_patient
  on public.alerts (patient_id) where status <> 'resolved';

create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  platform     public.device_platform not null,
  token        text not null,
  subscription jsonb,
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

create function public.current_user_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.can_access_ward(p_ward_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or ward_id = p_ward_id)
  )
$$;

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.guard_profile_privileges()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.ward_id is distinct from old.ward_id)
     and auth.uid() is not null
     and public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins can change role or ward';
  end if;
  return new;
end $$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create function public.early_warning_score(
  rr int, spo2 int, sbp int, hr int, temp numeric,
  out total int, out max_single int
)
language plpgsql immutable set search_path = ''
as $$
declare s int[];
begin
  s := array[
    case when rr <= 8 then 3 when rr <= 11 then 1 when rr <= 20 then 0 when rr <= 24 then 2 else 3 end,
    case when spo2 <= 91 then 3 when spo2 <= 93 then 2 when spo2 <= 95 then 1 else 0 end,
    case when sbp <= 90 then 3 when sbp <= 100 then 2 when sbp <= 110 then 1 when sbp <= 219 then 0 else 3 end,
    case when hr <= 40 then 3 when hr <= 50 then 1 when hr <= 90 then 0 when hr <= 110 then 1 when hr <= 130 then 2 else 3 end,
    case when temp <= 35.0 then 3 when temp <= 36.0 then 1 when temp <= 38.0 then 0 when temp <= 39.0 then 1 else 2 end
  ];
  select sum(x), max(x) into total, max_single from unnest(s) as x;
end $$;

create function public.evaluate_vitals()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ews      record;
  sev      public.alert_severity;
  v_ward   uuid;
  existing public.alerts;
begin
  select * into ews from public.early_warning_score(
    new.resp_rate, new.spo2, new.systolic_bp, new.heart_rate, new.temperature);
  new.score := ews.total;

  sev := case
    when ews.total >= 7 then 'critical'
    when ews.total >= 5 then 'high'
    when ews.max_single = 3 then 'medium'
    else null
  end;
  if sev is null then
    return new;
  end if;

  select ward_id into v_ward from public.patients where id = new.patient_id;
  select * into existing from public.alerts
    where patient_id = new.patient_id and status <> 'resolved';

  if existing.id is null then
    insert into public.alerts (patient_id, ward_id, severity, score, message)
    values (new.patient_id, v_ward, sev, ews.total,
            format('Early warning score %s (%s)', ews.total, sev));
  elsif sev > existing.severity then
    update public.alerts
       set severity = sev, score = ews.total, status = 'open',
           acknowledged_by = null, acknowledged_at = null,
           message = format('Escalated: early warning score %s (%s)', ews.total, sev)
     where id = existing.id;
  end if;
  return new;
end $$;

create trigger vitals_evaluate
  before insert on public.vitals
  for each row execute function public.evaluate_vitals();

create function public.link_alert_vitals()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.alerts set vitals_id = new.id
   where patient_id = new.patient_id and status <> 'resolved'
     and score = new.score;
  return null;
end $$;

create trigger vitals_link_alert
  after insert on public.vitals
  for each row execute function public.link_alert_vitals();

create function public.set_alert_status(p_alert_id uuid, p_status public.alert_status)
returns public.alerts
language plpgsql security definer set search_path = ''
as $$
declare a public.alerts;
begin
  select * into a from public.alerts where id = p_alert_id;
  if a.id is null or not public.can_access_ward(a.ward_id) then
    raise exception 'alert not found';
  end if;
  if p_status = 'open' then
    raise exception 'cannot reopen an alert';
  end if;

  update public.alerts set
    status          = p_status,
    acknowledged_by = coalesce(acknowledged_by, auth.uid()),
    acknowledged_at = coalesce(acknowledged_at, now()),
    resolved_at     = case when p_status = 'resolved' then now() else resolved_at end
  where id = p_alert_id
  returning * into a;
  return a;
end $$;

revoke execute on function public.set_alert_status(uuid, public.alert_status) from public, anon;
grant  execute on function public.set_alert_status(uuid, public.alert_status) to authenticated;

alter table public.wards         enable row level security;
alter table public.profiles      enable row level security;
alter table public.beds          enable row level security;
alter table public.patients      enable row level security;
alter table public.vitals        enable row level security;
alter table public.alerts        enable row level security;
alter table public.device_tokens enable row level security;

create policy "staff read wards" on public.wards
  for select to authenticated using (true);
create policy "admins manage wards" on public.wards
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "read own or ward colleagues" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.can_access_ward(ward_id));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins update profiles" on public.profiles
  for update to authenticated
  using (public.current_user_role() = 'admin');

create policy "ward staff read beds" on public.beds
  for select to authenticated using (public.can_access_ward(ward_id));

create policy "ward staff read patients" on public.patients
  for select to authenticated using (public.can_access_ward(ward_id));
create policy "charge nurses manage patients" on public.patients
  for all to authenticated
  using (public.can_access_ward(ward_id) and public.current_user_role() in ('charge_nurse', 'admin'))
  with check (public.can_access_ward(ward_id) and public.current_user_role() in ('charge_nurse', 'admin'));

create policy "ward staff read vitals" on public.vitals
  for select to authenticated
  using (exists (select 1 from public.patients p
                 where p.id = patient_id and public.can_access_ward(p.ward_id)));

create policy "ward staff read alerts" on public.alerts
  for select to authenticated using (public.can_access_ward(ward_id));

create policy "own devices" on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.alerts, public.vitals;
