# ── Stage 1: сборка фронтенда (React + Vite) ──
# schema.d.ts закоммичен, поэтому TypeSpec-компиляция для сборки не нужна.
FROM node:20-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: рантайм — Express + SQLite (better-sqlite3 — нативный модуль) ──
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# python3/make/g++ нужны для сборки нативного better-sqlite3 при npm ci.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Зависимости бэкенда (отдельным слоем — кешируется, пока не меняется lock-файл).
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev

# Исходники бэкенда и собранный фронтенд.
COPY server/ ./server/
COPY --from=web-build /app/web/dist ./web/dist

# Render передаёт свой PORT; значение по умолчанию — для локального запуска образа.
ENV PORT=4010
EXPOSE 4010

CMD ["node", "server/src/index.js"]
