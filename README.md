# WardWatch

Ward monitoring and nurse alerting. Bedside vitals stream in; the database scores each reading with a simplified NEWS2 early-warning score and opens or escalates alerts. Nurses see alerts for their ward and acknowledge or resolve them.

The backend is **API-first**: all logic lives in Supabase (Postgres triggers, RLS, RPC). The web app and the future mobile app are both just clients.

```
wardwatch/
  apps/web          Next.js dashboard (+ PWA later)
  apps/simulator    Fake bedside monitors → inserts vitals
  apps/mobile       Expo app (later)
  packages/shared   Zod schemas, types, client-agnostic API (createApi)
  supabase/         Migrations, seed data, config
```

## Setup

Requires Node 20+ and pnpm 9.

```bash
pnpm install

# Link to the hosted Supabase project (one-time)
pnpm exec supabase login
pnpm exec supabase link --project-ref gkkrxespyiyouqjrheys

# Apply migrations to the hosted DB
pnpm db:push
```

Env files (gitignored; copy from the `.env.example` next to each):

| File | Needs |
| --- | --- |
| `apps/web/.env.local` | Project URL, publishable key |
| `apps/simulator/.env` | Project URL, **secret** key (server-side only) |

## Run

```bash
pnpm dev        # web on http://localhost:3000
pnpm simulate   # stream vitals every 5 s
```

## Data model

- `wards`, `beds`, `patients`: ward layout and admissions
- `profiles`: one per auth user; `role` is `nurse | charge_nurse | admin`, plus `ward_id`
- `vitals`: readings; a trigger fills in `score` and raises alerts
- `alerts`: at most one active per patient; severity `medium` (one parameter in the red), `high` (score 5–6), `critical` (7+)
- `device_tokens`: web push subscriptions and iOS/Android tokens

Access: staff see only their ward (admins see everything). Only admins can change roles or ward assignments. Alerts change only through `set_alert_status(alert_id, status)`.
