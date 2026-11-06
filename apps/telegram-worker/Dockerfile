# Multi-stage production Dockerfile for TajerTrack Telegram Worker
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database ./packages/database
COPY apps/telegram-worker ./apps/telegram-worker

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter telegram-worker run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/telegram-worker/package.json ./apps/telegram-worker/package.json
COPY --from=builder /app/apps/telegram-worker/dist ./apps/telegram-worker/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

WORKDIR /app/apps/telegram-worker

CMD ["node", "dist/main.js"]

