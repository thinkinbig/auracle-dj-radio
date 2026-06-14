# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY services/music-engine/package.json services/music-engine/tsconfig.json services/music-engine/

RUN pnpm install --frozen-lockfile --filter @auracle/music-engine...

COPY packages/shared/src packages/shared/src
COPY services/music-engine/src services/music-engine/src

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/music-engine build

RUN pnpm deploy --filter @auracle/music-engine --prod --legacy /bundle

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libstdc++

WORKDIR /app

COPY --from=builder /bundle .

# Catalog source assets (manifest + audio/cover/photo) for seed-on-boot
COPY packages/catalog/data/tracks ./data/tracks/
COPY packages/catalog/data/catalog ./data/catalog/
COPY packages/catalog/data/covers ./data/covers/
COPY packages/catalog/data/artists ./data/artists/

COPY services/music-engine/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3010
ENTRYPOINT ["/entrypoint.sh"]
