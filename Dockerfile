# Node 22 is required for the built-in node:sqlite DatabaseSync API.
FROM node:22.14.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/mostaql.db

WORKDIR /app

RUN groupadd --gid 10001 app && \
    useradd --uid 10001 --gid app --create-home --shell /usr/sbin/nologin app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=app:app /app/dist ./dist
RUN mkdir /app/data && chown app:app /app/data

USER app

# This worker does not expose HTTP. Checking PID 1 confirms its event loop is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "process.kill(1, 0)"]

CMD ["node", "dist/index.js"]
