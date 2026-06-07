# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @auracle/api...

COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/api build

RUN pnpm deploy --filter @auracle/api --prod --legacy /bundle

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libstdc++

WORKDIR /app

COPY --from=builder /bundle .

COPY apps/api/data/tracks ./data/tracks/
COPY apps/api/data/catalog ./data/catalog/
COPY apps/api/data/covers ./data/covers/
COPY apps/api/data/artists ./data/artists/

COPY apps/api/entrypoint-common.sh /entrypoint-common.sh
COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint-common.sh /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
