# Build from the repo root: docker build -f apps/simulator/Dockerfile .
FROM node:20-alpine
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/simulator/package.json apps/simulator/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@wardwatch/simulator..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/simulator apps/simulator

WORKDIR /repo/apps/simulator
USER node
# Config comes from the environment (SUPABASE_URL, SUPABASE_SECRET_KEY, SIM_*), not a .env file.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
