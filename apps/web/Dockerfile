# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @auracle/web...

COPY packages/shared/src packages/shared/src
COPY apps/web/src apps/web/src
COPY apps/web/index.html apps/web/
COPY apps/web/vite.config.ts apps/web/
COPY apps/web/tsconfig.json apps/web/

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/web build

# ── Stage 2: nginx ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
