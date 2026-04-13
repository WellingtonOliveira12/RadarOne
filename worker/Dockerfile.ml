# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# RadarOne Worker — Dockerfile.ml (Mercado Livre shard for Brazilian VPS)
#
# This image is specifically for running the worker on infrastructure outside
# Render (e.g. Hostinger VPS in São Paulo) so that the outbound IP matches the
# IP the user's ML session was created with, avoiding the /gz/account-verification
# anti-fraud redirect.
#
# Runtime behavior is site-filtered via WORKER_SITES_INCLUDE at compose level.
# The image itself is generic — nothing here hard-codes "ML only".
#
# Base image: pinned to the same Playwright version declared in worker/package.json
# (^1.57.0). It ships with a compatible Chromium already installed at
# /ms-playwright, so we avoid runtime browser downloads.
# ------------------------------------------------------------------------------

# --- Stage 1: builder --------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.57.0-noble AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npx prisma generate && npx tsc

RUN npm prune --omit=dev

# --- Stage 2: runtime --------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.57.0-noble AS runtime

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HEALTH_CHECK_PORT=8090 \
    NODE_OPTIONS=--max-old-space-size=640

# Internal-only health port — not published at the compose level.
EXPOSE 8090

USER pwuser

CMD ["node", "dist/bootstrap.js"]
