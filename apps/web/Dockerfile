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

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN pnpm --filter @auracle/shared build && pnpm --filter @auracle/clients build && pnpm --filter @auracle/web build

# ── Stage 2: nginx ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Catalog + media baked in so nginx serves them statically (api+web merge).
# Run `pnpm --filter @auracle/catalog export-catalog` after editing the manifest.
COPY packages/catalog/data/catalog/tracks.json /usr/share/nginx/html/catalog/tracks.json
COPY packages/catalog/data/catalog/track       /usr/share/nginx/html/catalog/track
COPY packages/catalog/data/tracks              /usr/share/nginx/html/media/tracks
COPY packages/catalog/data/covers              /usr/share/nginx/html/covers
COPY packages/catalog/data/artists             /usr/share/nginx/html/artists

EXPOSE 80
