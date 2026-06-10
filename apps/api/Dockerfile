FROM node:20-alpine AS builder

WORKDIR /app

# Build tools required by better-sqlite3's native addon (node-gyp)
RUN apk add --no-cache python3 make g++

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy package files for all workspaces
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/

# Install dependencies (includes better-sqlite3 native addon compiled from source on musl/Alpine)
RUN npm ci

# Copy source
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Build
RUN npx turbo run build --filter=@prismalytics/api

# â”€â”€â”€ Production Stage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# libstdc++ is required at runtime to load the better-sqlite3 native addon
RUN apk add --no-cache libstdc++

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 prismalytics

# Create /data for the SQLite database file.
# Group-owned by GID 0 (root group) with g+rwx so any arbitrary UID assigned by
# OpenShift's restricted SCC can write here when supplementalGroups: [0] is set.
# This is the Red Hat recommended pattern for arbitrary-UID compatible images.
RUN mkdir -p /data && \
    chown 1001:0 /data && \
    chmod g+rwx /data

# Copy built application
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

USER prismalytics

EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
