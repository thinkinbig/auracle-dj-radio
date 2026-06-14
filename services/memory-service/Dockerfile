# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY services/memory-service/package.json services/memory-service/tsconfig.json services/memory-service/

RUN pnpm install --frozen-lockfile --filter @auracle/memory-service...

COPY packages/shared/src packages/shared/src
COPY services/memory-service/src services/memory-service/src

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/memory-service build

RUN pnpm deploy --filter @auracle/memory-service --prod --legacy /bundle

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libstdc++

WORKDIR /app

COPY --from=builder /bundle .

COPY services/memory-service/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3020
ENTRYPOINT ["/entrypoint.sh"]
