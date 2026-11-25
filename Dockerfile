# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS base

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Dependency stage
# Install production-only dependencies into an isolated layer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
# --ignore-scripts skips dev-only lifecycle hooks (e.g. "prepare": "husky")
# since devDependencies and .git are omitted from the container build.
RUN bun install --frozen-lockfile --production --ignore-scripts

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Runner stage
# Production image, copy production dependencies and source to run Elysia
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Install dumb-init for proper PID 1 signal forwarding (SIGTERM/SIGINT) and zombie reaping
RUN apk add --no-cache dumb-init

# Copy production dependencies and app files owned by the built-in non-root bun user
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
# tsconfig.json is needed at runtime so Bun resolves path aliases (e.g. "src/*")
COPY --chown=bun:bun package.json tsconfig.json ./
COPY --chown=bun:bun src ./src

USER bun

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "src/index.ts"]
