# Docker (API + Redis)

Levanta Nest y Redis con Compose. **Postgres y Storage siguen en Supabase** (no hay Postgres en Compose).

## Requisitos

- Docker Desktop (Windows: arrancado)
- `.env` en la raíz (cópialo de `.env.example` y pega `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_*`, etc.)

## Arranque

```bash
docker compose up --build
```

API: `http://localhost:3000` — Swagger `/docs` — health `/health`.

Seed (misma DB de Supabase; opcional si ya sembraste):

```bash
docker compose run --rm api pnpm prisma:seed
```

Parar: `docker compose down`. Logs: `docker compose logs -f api`.

El front sigue en el host (`http://localhost:5173`). `CORS_ORIGIN` no cambia.

## Redis dentro de Compose

En `.env` local, `REDIS_URL=redis://127.0.0.1:6379` es correcto para Nest **en el host**. Dentro del contenedor `127.0.0.1` es el propio `api`, no Redis.

[docker-compose.yml](../docker-compose.yml) pisa `REDIS_URL=redis://redis:6379` y `PORT=3000` (el `.env` puede tener otro puerto para Nest en el host). No edites `.env` para Docker.

API en el navegador: `http://localhost:3000/health` — no uses el `PORT` del `.env` si es distinto.

Comprueba: `GET /jobs/status` → `configured: true`, `redis: up`.

`JOBS_SCHEDULER` se respeta tal cual el `.env` (`false` en local evita crawls duplicados).

## Qué hace el contenedor al arrancar

1. `prisma migrate deploy` contra `DATABASE_URL` (Supabase)
2. `node dist/main.js` (mismo flujo que Render: JS compilado, no `nest start`)

Fallback de crawl sin Storage: volumen `./data/crawl` → `/app/data/crawl`.

## Fuera de este setup

- Postgres en Compose
- Imagen de desarrollo con `--watch`
- Publicar la imagen a un registry
- Dockerizar el frontend (otro repo)

Deploy en PaaS: [render-deploy.md](./render-deploy.md).
