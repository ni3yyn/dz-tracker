# Self-contained production Dockerfile for TajerTrack Web Push Worker
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json ./
RUN npm install

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/main.js"]
