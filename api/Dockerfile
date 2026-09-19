# syntax=docker/dockerfile:1
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json ./api/
RUN npm ci --workspace api --include-workspace-root || npm install --workspace api --include-workspace-root
COPY api ./api
RUN npm --workspace api run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json ./api/
RUN npm ci --workspace api --include-workspace-root --omit=dev \
    || npm install --workspace api --include-workspace-root --omit=dev
COPY --from=build /app/api/dist ./api/dist
# Migrations are read from disk at boot; they ship with the image.
COPY api/migrations ./api/migrations
EXPOSE 8080
CMD ["node", "api/dist/server.js"]
