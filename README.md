# WardWatch

Live ward monitoring for nurses. Bedside vitals come in, each reading gets a NEWS2-style early warning score, and patients who score high get an alert that nurses can acknowledge and resolve.

Scoring, alerting, permissions and the audit trail all run in Postgres (Supabase triggers, RLS and RPCs), so the web app is a thin client.

Pages: a live **board** of beds and active alerts, a **shift handover** summary (last 8 or 12 hours, copyable as text or printable), and an append-only **audit log**.

## Structure

- `apps/web`: Next.js dashboard
- `apps/simulator`: fake bedside monitors that insert vitals
- `packages/shared`: Zod schemas, a small API wrapper and the handover logic, with unit tests
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

## Audit log

`audit_log` is written only by triggers on `alerts`, `patients` and `profiles`: alerts raised, escalated, acknowledged and resolved; admissions, discharges and bed moves; role and ward changes. Nobody can insert, update, delete or truncate it directly, including the service role. It has no foreign keys, so the history survives even if the rows it describes are deleted. Ward staff see their ward's entries and admins see all of them.

## Tests

```bash
pnpm test                      # Vitest: handover, audit text, schemas, API validation
pnpm build && pnpm test:e2e    # Playwright smoke tests on desktop and mobile viewports
```

The first e2e run needs `pnpm --filter @wardwatch/web exec playwright install chromium`. The e2e tests cover only signed-out behaviour and the PWA files, so they run without a database.

## CI

GitHub Actions runs typecheck, lint, unit tests and build, then Playwright against that build. It also builds both Docker images and checks that the web container serves the login page. CI uses placeholder Supabase values and never touches the real project.

## Docker

```bash
pnpm docker:up     # web on http://localhost:3000 plus the simulator
pnpm docker:down
```

Build args come from `apps/web/.env.local`, and the simulator reads `apps/simulator/.env`. The web image uses Next.js standalone output and runs as a non-root user.

## Roles

Nurses and charge nurses see only their own ward. Admins see every ward and are the only ones who can change roles or ward assignments.

Alerts are `medium` when a single vital is far out of range, `high` at a score of 5-6, and `critical` at 7 or above. Each patient has at most one active alert, and new readings escalate it.
