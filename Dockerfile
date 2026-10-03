# Stage 1: Build frontend and backend (always run natively on host platform, e.g. amd64)
FROM --platform=$BUILDPLATFORM node:22-bookworm AS builder
WORKDIR /app

# Skip mediasoup worker compilation in builder stage since we only compile TS/JS bundles
ENV MEDIASOUP_WORKER_BIN=/bin/true
ENV CI=true

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN --mount=type=cache,target=/app/.nx/cache \
    npx nx run frontend:build:production
RUN --mount=type=cache,target=/app/.nx/cache \
    npx nx run backend:build:production

# Stage 2: Install production dependencies for backend (and compile native worker & addons)
FROM node:22-bookworm-slim AS runner-deps
WORKDIR /app

# Enable pip to install build tools (invoke, meson, ninja) in Debian Bookworm environment
ENV PIP_BREAK_SYSTEM_PACKAGES=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist/apps/backend/package.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

# Stage 3: Runtime container
FROM node:22-bookworm-slim AS runtime
WORKDIR /

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Frontend static files
COPY --from=builder /app/dist/apps/frontend/browser /app/frontend

# Backend application and dependencies
COPY --from=builder /app/dist/apps/backend/main.js /app/backend/
COPY --from=builder /app/dist/apps/backend/main.js.map* /app/backend/
COPY --from=runner-deps /app/node_modules /app/backend/node_modules
COPY --from=runner-deps /app/package.json /app/backend/

# Web server and process supervisor configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Persistent directory for SQLite database and uploaded media files
RUN mkdir -p /konvoez_data && chmod 700 /konvoez_data

ENV NODE_ENV=production
ENV PORT=3000

# HTTP & WebSockets
EXPOSE 80

# Mediasoup WebRTC Media (UDP audio/video and TCP fallback)
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:80/api/v1/public/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
