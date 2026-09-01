# Docker (API + Redis) — entorno local canónico

Levanta Nest y Redis con Compose. **Así se corre el backend en local a partir de ahora.**  
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

API: `http://localhost:3000` — Swagger `/docs` — health `/health` — hallazgos `/findings`.

Compose **pisa** `PORT=3000` y `REDIS_URL=redis://redis:6379` aunque el `.env` tenga `PORT=3001`. El front sigue en `http://localhost:5173`.

Rebuild obligatorio si cambiaste código (S7, etc.): `docker compose up -d --build api`. Un `restart` sin `--build` sigue la imagen vieja.

Seed (misma DB de Supabase; opcional si ya sembraste):

```bash
docker compose run --rm api pnpm prisma:seed
```

Parar: `docker compose down`. Logs: `docker compose logs -f api`.

`CORS_ORIGIN` no cambia (`http://localhost:5173`).

## Redis

[docker-compose.yml](../docker-compose.yml) levanta Redis y pisa `REDIS_URL`. No edites `.env` para que Docker “encuentre” Redis.

Comprueba: `GET /jobs/status` → `configured: true`, `redis: up`.

`JOBS_SCHEDULER` se respeta tal cual el `.env` (`false` en local evita crawls duplicados).

## Qué hace el contenedor al arrancar

1. `prisma migrate deploy` contra `DATABASE_URL` (Supabase)
2. `node dist/main.js` (JS compilado, no `nest start`)

Fallback de crawl sin Storage: volumen `./data/crawl` → `/app/data/crawl`.

## Fuera de este setup

- Postgres en Compose
- Imagen de desarrollo con `--watch`
- Publicar la imagen a un registry
- Dockerizar el frontend (otro repo)

Tests e2e en el host (`pnpm test:e2e`) son aparte: no sustituyen Compose.

Deploy en PaaS: [render-deploy.md](./render-deploy.md).
