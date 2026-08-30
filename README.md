# NORMA — Backend

API NestJS + Prisma + PostgreSQL (Supabase como DB + Storage) para el proyecto NORMA.
Auth propia con JWT. Monitoreo de errores con Sentry.

## Requisitos

- Node.js 20+
- pnpm
- PostgreSQL en [Supabase](https://supabase.com) (o Postgres local) — **solo DB**, la auth es propia (JWT)

## Setup local

```bash
pnpm install
cp .env.example .env
```

Edita `.env` y pega la connection string de Supabase:

1. Supabase → Project Settings → Database  
2. Connection string → URI  
3. Para la app (runtime): pooler **Transaction** (puerto `6543`)  
4. Para migraciones: conexión **Session** o Direct (puerto `5432`)

```bash
# Generar cliente Prisma
pnpm prisma:generate

# Crear / aplicar migraciones (requiere DATABASE_URL válida)
pnpm prisma:migrate

# Arrancar API en watch mode
pnpm start:dev
```

API en `http://localhost:3000`  
Swagger UI: `http://localhost:3000/docs`

### Health check

```bash
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-07-12T..."
}
```

Si la DB aún no está configurada, el servidor arranca igual y `/health` responde con `status: "degraded"` y `database: "down"`.

## Estructura

```
src/
  instrument.ts     # Sentry.init (importado primero desde main.ts)
  database/          # PrismaModule / PrismaService
  health/            # GET /health
  modules/
    auth/
    clients/
    alerts/
    sources/
    users/
    storage/         # Upload / download / signed-url (Supabase Storage)
    ai/              # POST /ai/ask
    documents/       # GET /documents + progress
  jobs/              # Redis/BullMQ crawl + extract/normalize
  app.module.ts
  main.ts
prisma/
  schema.prisma
docs/
  README.md          # Índice: qué leer
  HANDOFF.md         # Estado vivo
  seed-and-tests.md
  sentry-storage.md
  sql/               # SQL manual del bucket Storage
```

Swagger UI: `http://localhost:3000/docs` (Authorize con JWT de `POST /auth/login`).

## Scripts

| Script | Descripción |
|--------|-------------|
| `pnpm start:dev` | API en modo desarrollo (watch) |
| `pnpm start` / `start:prod` | `node dist/main` (requiere `pnpm build` antes) |
| `pnpm render:build` | generate + build + migrate deploy (PaaS) |
| `pnpm test:e2e` | Smoke e2e (auth, permisos, CRUD) — requiere `.env` + DB + seed |
| `pnpm prisma:generate` | Genera Prisma Client |
| `pnpm prisma:migrate` | Migraciones en desarrollo |
| `pnpm prisma:studio` | UI de Prisma Studio |
| `pnpm prisma:deploy` | Aplica migraciones (staging/prod) |
| `pnpm prisma:seed` | Seed Arca + fuentes + admin |

## Ambientes

| Ambiente | Uso | Backend URL (objetivo) | Frontend URL (objetivo) |
|----------|-----|------------------------|-------------------------|
| `development` | Local en tu máquina | `http://localhost:3000` | `http://localhost:5173` |
| `staging` | Validación pre-producción | TBD (ej. Railway/Render/Fly) | TBD (ej. Vercel/Netlify) |
| `production` | Clientes reales | TBD | TBD |

### Variables por ambiente

| Variable | Development | Staging / Production |
|----------|-------------|----------------------|
| `NODE_ENV` | `development` | `staging` / `production` |
| `PORT` | `3000` | asignado por el host |
| `DATABASE_URL` | Supabase Postgres (dev) | Postgres staging/prod (Supabase u otro) |
| `CORS_ORIGIN` | `http://localhost:5173` | URL del frontend desplegado |
| `JWT_SECRET` | secreto local | secreto fuerte por ambiente |
| `JWT_EXPIRES_IN` | `8h` | según política |
| `AUTH_SEED_EMAIL` | admin de desarrollo | opcional (solo seed) |
| `AUTH_SEED_PASSWORD` | password de desarrollo | opcional (solo seed) |
| `SENTRY_DSN` | vacío / DSN de prueba | DSN del ambiente |
| `SUPABASE_URL` | Project URL | Project URL del ambiente |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role local | service_role del ambiente |
| `SUPABASE_STORAGE_BUCKET` | `documents` | bucket del ambiente |
| `OPENAI_API_KEY` | vacío / key de prueba | key del ambiente |
| `OPENAI_MODEL` | `gpt-4o-mini` | modelo del ambiente |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis del ambiente (crawl/docs) |

Reglas:
- Nunca subir `.env` a Git.
- Staging y Production deben usar bases separadas cuando sea posible.
- Migraciones en staging/prod: `pnpm prisma:deploy`.
- Detalle de Sentry + Storage: [docs/sentry-storage.md](docs/sentry-storage.md).
- Índice de docs: [docs/README.md](docs/README.md).
- Deploy en Render: [docs/render-deploy.md](docs/render-deploy.md) (**Start Command** = `yarn start:prod`, no `yarn start` / `nest start`).

### Tablero

GitHub Project: [NORMA — Piloto Arca](https://github.com/users/CRZANDROID/projects/1)

## Modelo ER

Modelo administrativo: usuarios con auth propia (email/password + JWT), roles, membresías, clientes, perfiles regulatorios, fuentes, hallazgos, `job_runs` y documentos (pipeline S6).  
El semáforo operativo del piloto usa 4 niveles: verde, amarillo, naranja y rojo.
