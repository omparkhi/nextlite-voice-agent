# ==========================================
# NextLite Voice V3 - Web Dashboard Dockerfile
# Multi-stage build for React Vite SPA
# ==========================================

FROM node:20-alpine as builder

WORKDIR /app

# Copy root workspace package files
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy web source code
COPY apps/web/ ./apps/web/

# Build static bundle
WORKDIR /app/apps/web
RUN npm run build

# Final runtime stage: lightweight Nginx Alpine
FROM nginx:alpine as runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
