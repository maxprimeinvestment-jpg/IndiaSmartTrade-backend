# syntax=docker/dockerfile:1.6
# Self-contained backend Dockerfile for the SPLIT repo.
# Build context = repo root (which now IS the backend folder).
# `shared` is vendored at src/_shared and committed — no COPY shared needed.
#
# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini && \
    addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S appuser -G nodejs
ENV NODE_ENV=production
# PORT is provided by Railway at runtime; 4000 is only a local default.
ENV PORT=4000

COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json

USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
# Run pending migrations then boot. (Also set as startCommand in railway.json.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
