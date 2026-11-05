create extension if not exists pg_net with schema extensions;

-- Calls the push-alert edge function. Reads its URL and shared secret from Vault
-- (project_url, push_webhook_secret) and does nothing until both are set.
create function public.notify_alert_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/push-alert',
    body    := jsonb_build_object('alert_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
  return null;
exception when others then
  raise warning 'push-alert call failed: %', sqlerrm;
  return null;
end $$;

create trigger alerts_push_on_insert
  after insert on public.alerts
  for each row execute function public.notify_alert_push();

create trigger alerts_push_on_escalate
  after update of severity on public.alerts
  for each row when (new.severity > old.severity)
  execute function public.notify_alert_push();
