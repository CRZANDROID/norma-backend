# NORMA — Backend

API NestJS + Prisma + PostgreSQL (Supabase solo como base de datos) para el proyecto NORMA.

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
  database/          # PrismaModule / PrismaService
  health/            # GET /health
  modules/
    auth/            # login JWT, /auth/me
    clients/         # CRUD clientes + perfiles
    sources/         # CRUD fuentes
    users/           # admin usuarios + memberships
  app.module.ts
  main.ts
prisma/
  schema.prisma
```

## Rutas principales

Auth: `Authorization: Bearer <accessToken>` (excepto `/health` y `POST /auth/login`).

| Método | Ruta | Roles |
|--------|------|-------|
| `GET` | `/health` | — |
| `POST` | `/auth/login` | público |
| `GET` | `/auth/me` | autenticado |
| `GET` | `/clients` | autenticado* |
| `GET` | `/clients/:id` | autenticado* |
| `POST` | `/clients` | ADMIN |
| `PATCH` | `/clients/:id` | ADMIN |
| `PATCH` | `/clients/:id/deactivate` | ADMIN |
| `PATCH` | `/clients/:id/activate` | ADMIN |
| `GET` | `/clients/:clientId/profiles` | autenticado* |
| `POST` | `/clients/:clientId/profiles` | ADMIN, ANALYST |
| `GET` | `/profiles/:id` | autenticado* |
| `PATCH` | `/profiles/:id` | ADMIN, ANALYST |
| `PATCH` | `/profiles/:id/deactivate` | ADMIN |
| `PATCH` | `/profiles/:id/activate` | ADMIN |
| `GET` | `/sources` | ADMIN, ANALYST, VIEWER |
| `GET` | `/sources/:id` | ADMIN, ANALYST, VIEWER |
| `POST` | `/sources` | ADMIN |
| `PATCH` | `/sources/:id` | ADMIN |
| `PATCH` | `/sources/:id/deactivate` | ADMIN |
| `PATCH` | `/sources/:id/activate` | ADMIN |
| `POST` | `/users` | ADMIN |
| `GET` | `/users` | ADMIN |
| `GET` | `/users/:id` | ADMIN |
| `PATCH` | `/users/:id/role` | ADMIN |
| `PATCH` | `/users/:id/deactivate` | ADMIN |
| `PATCH` | `/users/:id/activate` | ADMIN |
| `POST` | `/users/:id/memberships` | ADMIN |
| `PATCH` | `/memberships/:id` | ADMIN |

\*No-ADMIN: solo clientes/perfiles de memberships `ACTIVE`.

Guía Postman: [docs/postman-pruebas.md](docs/postman-pruebas.md).

## Scripts

| Script | Descripción |
|--------|-------------|
| `pnpm start:dev` | API en modo desarrollo |
| `pnpm prisma:generate` | Genera Prisma Client |
| `pnpm prisma:migrate` | Migraciones en desarrollo |
| `pnpm prisma:studio` | UI de Prisma Studio |
| `pnpm prisma:deploy` | Aplica migraciones (staging/prod) |

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

Reglas:
- Nunca subir `.env` a Git.
- Staging y Production deben usar bases separadas cuando sea posible.
- Migraciones en staging/prod: `pnpm prisma:deploy`.

### Tablero

GitHub Project: [NORMA — Piloto Arca](https://github.com/users/CRZANDROID/projects/1)

## Modelo ER

Modelo administrativo: usuarios con auth propia (email/password + JWT), roles, membresías, clientes, perfiles regulatorios, fuentes y hallazgos.  
El semáforo operativo del piloto usa 4 niveles: verde, amarillo, naranja y rojo.

## Documentación para agentes y colaboradores

| Archivo | Contenido |
|---------|-----------|
| [AGENTS.md](./AGENTS.md) | Índice de entrada para cualquier agente |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Producto, alcance, actores |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Stack, Auth, multi-tenant |
| [docs/SPRINTS.md](./docs/SPRINTS.md) | Plan semanal 1–8 |
| [docs/SPRINT-3-BACKEND.md](./docs/SPRINT-3-BACKEND.md) | Contrato CRUD admin |
| `.cursor/rules/` | Reglas Cursor (core, NestJS, Prisma) |
