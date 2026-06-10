FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN npm ci

COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

RUN npx turbo run build --filter=@prismalytics/web

FROM nginxinc/nginx-unprivileged:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
