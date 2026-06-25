# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY services/agent-harness/package.json services/agent-harness/tsconfig.json services/agent-harness/

RUN pnpm install --frozen-lockfile --filter @auracle/agent-harness...

COPY packages/shared/src packages/shared/src
COPY services/agent-harness/src services/agent-harness/src

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/agent-harness build

RUN pnpm deploy --filter @auracle/agent-harness --prod --legacy /bundle

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /bundle .

COPY services/agent-harness/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3030
ENTRYPOINT ["/entrypoint.sh"]
