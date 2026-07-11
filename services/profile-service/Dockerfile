# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/catalog/package.json packages/catalog/tsconfig.json packages/catalog/
COPY services/profile-service/package.json services/profile-service/tsconfig.json services/profile-service/

RUN pnpm install --frozen-lockfile --filter @auracle/profile-service...

COPY packages/shared/src packages/shared/src
COPY packages/catalog/src packages/catalog/src
COPY services/profile-service/src services/profile-service/src

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/catalog build && pnpm --filter @auracle/profile-service build

RUN pnpm deploy --filter @auracle/profile-service --prod --legacy /bundle

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libstdc++

WORKDIR /app

COPY --from=builder /bundle .

# The catalog package's runtime loader reads its manifest and taxonomy from
# the package data directory; pnpm deploy only includes package files needed
# for Node dependencies, not this repository-owned static catalog data.
COPY packages/catalog/data /app/node_modules/.pnpm/@auracle+catalog@file+packages+catalog/node_modules/@auracle/catalog/data

COPY services/profile-service/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3020
ENTRYPOINT ["/entrypoint.sh"]
