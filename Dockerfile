# NORMA API — NestJS + Prisma. Postgres/Storage siguen en Supabase.
# Build: docker compose up --build

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
# Dev deps (prisma, tsx, nest CLI) hacen falta para generate/build/migrate/seed.
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm prisma generate \
  && pnpm build \
  && node -e "require('fs').accessSync('dist/main.js')"

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY package.json pnpm-lock.yaml ./
COPY docker-entrypoint.sh ./
RUN sed -i '1s/^\xEF\xBB\xBF//;s/\r$//' docker-entrypoint.sh \
  && chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data/crawl \
  && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
