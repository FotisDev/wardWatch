# WardWatch

Live ward monitoring for nurses. Bedside vitals come in, each reading gets a NEWS2-style early warning score, and patients who score high get an alert that nurses can acknowledge and resolve.

Scoring, alerting and permissions all run in Postgres (Supabase triggers, RLS and an RPC), so the web app is a thin client.

## Structure

- `apps/web`: Next.js dashboard
- `apps/simulator`: fake bedside monitors that insert vitals
- `packages/shared`: Zod schemas and a small API wrapper
- `supabase`: migrations, seed data and the `push-alert` edge function

## Getting started

Needs Node 20+ and pnpm 9.

```bash
pnpm install
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push --include-seed
```

Copy `.env.example` to `.env.local` in `apps/web` and to `.env` in `apps/simulator`, then fill in your project URL and keys. The simulator uses the secret key, so keep it out of the browser app.

```bash
pnpm dev        # http://localhost:3000
pnpm simulate   # new readings every 5s
```

Sign up, then make yourself an admin in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<your user id>';
```

## Push notifications

The web app is an installable PWA. "Enable alerts" in the header subscribes the device to web push. When an alert is created or escalated, a trigger on `alerts` calls the `push-alert` edge function, which notifies everyone on that ward plus admins. Notifications show only the bed and score, never the patient's name, since lock screens are visible to anyone nearby.

Generate a VAPID key pair (`npx web-push generate-vapid-keys`), put the public key in `apps/web/.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and fill `supabase/functions/.env` from its `.env.example`. Then:

```bash
pnpm exec supabase db push
pnpm exec supabase secrets set --env-file supabase/functions/.env
pnpm exec supabase functions deploy push-alert
```

Finally, tell the database where the function lives, in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET from supabase/functions/.env>', 'push_webhook_secret');
```

Until both secrets exist the trigger does nothing, so local setups without push still work. On iPhone, push only works after "Add to Home Screen".

## Roles

Nurses and charge nurses see only their own ward. Admins see every ward and are the only ones who can change roles or ward assignments.

Alerts are `medium` when a single vital is far out of range, `high` at a score of 5-6, and `critical` at 7 or above. Each patient has at most one active alert, and new readings escalate it.
