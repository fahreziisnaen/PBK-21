# syntax=docker/dockerfile:1
#
# Three-stage build producing a minimal production image.
#
# Node 24 (not 20) is required in every stage: Prisma 7.10 declares
# "engines": { "node": "^20.19 || ^22.12 || >=24.0" }. The bare `node:20-alpine`
# tag can resolve to an early 20.x release that fails that check at build time,
# so this Dockerfile pins the major that unconditionally satisfies it.

FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts resolves DATABASE_URL eagerly via env(); `generate` never
# opens a connection, so a syntactically valid placeholder is enough here.
# Scoped to this one RUN so it never leaks into the `migrate` container,
# which gets the real URL from compose.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate
RUN npm run build

FROM node:24-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Jakarta

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
