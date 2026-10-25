# syntax=docker/dockerfile:1

# ---- Base system with Node 22, build tools and FFmpeg ----------------------
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    ffmpeg \
    curl \
    bubblewrap \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /srv/workspaces

WORKDIR /app

# ---- Builder: Install dependencies and compile artifacts -------------------
FROM base AS builder

ARG DSH_CLIENT_COMMIT_HASH=0000000
ENV DSH_CLIENT_COMMIT_HASH=$DSH_CLIENT_COMMIT_HASH

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY packages ./packages
COPY apps ./apps
COPY vendor ./vendor
COPY native ./native
COPY python ./python
COPY scripts ./scripts
COPY tsconfig*.json tsdown.config.ts ./

RUN pnpm install --frozen-lockfile
RUN pnpm run build:artifacts

# ---- Runner: Production container ------------------------------------------
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DSH_ALLOW_WILDCARD=1
ENV DSH_WORKSPACES_ROOT=/srv/workspaces
ENV NEXT_PUBLIC_APP_URL=https://harness.mhrithik.com

COPY --from=builder /app /app
COPY deploy/docker-entrypoint.sh /app/deploy/docker-entrypoint.sh
RUN chmod +x /app/deploy/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
