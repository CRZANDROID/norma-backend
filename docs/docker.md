# Docker (API HTTP + worker + Redis) — entorno local canónico

Levanta Nest **en dos procesos** y Redis con Compose. **Así se corre el backend en local a partir de ahora.**  
`pnpm start:dev` en el host **no** trae Redis: si `REDIS_URL` apunta a `127.0.0.1:6379` y no hay `redis-server`, verás `ECONNREFUSED`. No hace falta Redis en Windows.

**Postgres y Storage siguen en Supabase** (no hay Postgres en Compose).

## Requisitos

- Docker Desktop (Windows: arrancado)
- `.env` en la raíz (cópialo de `.env.example` y pega `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_*`, `OPENAI_API_KEY` para classify, etc.)

## Arranque

Desde la raíz del repo (tiene que existir `docker-compose.yml` en **esta** rama):

```bash
docker compose up --build
```

Tres servicios: `redis`, `api` (HTTP, **sin** workers), `worker` (BullMQ + scheduler 07:00).

API: `http://localhost:3000` — Swagger `/docs` — health `/health` — hallazgos `/findings`. El worker no publica puerto.

Compose **pisa** `PORT=3000` y `REDIS_URL=redis://redis:6379` aunque el `.env` tenga `PORT=3001`. El front sigue en `http://localhost:5173`.

| Servicio | `JOBS_WORKER` | `JOBS_SCHEDULER` |
|----------|---------------|------------------|
| `api` | `false` | `false` |
| `worker` | `true` | `true` |

El catálogo entero se encola en segundos (`POST /jobs/crawl/all` o el cron). Solo `CRAWL_CONCURRENCY` crawls corren a la vez (default 2). `waiting` alto es normal.

Rebuild si cambiaste código: `docker compose up -d --build` (misma imagen `norma-backend:local` para `api` y `worker`). Un `restart` sin `--build` sigue la imagen vieja. No reconstruyas solo `api`.

Seed (misma DB de Supabase; opcional si ya sembraste):

```bash
docker compose run --rm api pnpm prisma:seed
```

Parar: `docker compose down`. Logs: `docker compose logs -f api worker`.

`CORS_ORIGIN` no cambia (`http://localhost:5173`).

## Redis

[docker-compose.yml](../docker-compose.yml) levanta Redis y pisa `REDIS_URL`. No edites `.env` para que Docker “encuentre” Redis.

Comprueba: `GET /jobs/status` → `configured: true`, `redis: up`, `worker: true` (hay consumidores en `source.crawl`), `consumers` > 0. `scheduler` en el **API** es `false` (el cron vive en `worker`).

## Qué hace el contenedor al arrancar

1. `api`: `prisma migrate deploy` contra `DATABASE_URL` (Supabase), luego `node dist/main.js`
2. `worker`: `SKIP_PRISMA_MIGRATE=true` (no migra otra vez); espera a que `api` esté healthy; `node dist/main.js`

Fallback de crawl sin Storage: volumen `./data/crawl` → `/app/data/crawl`.

## Fuera de este setup

- Postgres en Compose
- Imagen de desarrollo con `--watch`
- Publicar la imagen a un registry
- Dockerizar el frontend (otro repo)

Tests e2e en el host (`pnpm test:e2e`) son aparte: no sustituyen Compose.

Deploy en PaaS: [render-deploy.md](./render-deploy.md). Picos y health: [PERFORMANCE.md](./PERFORMANCE.md).
