# NORMA — Backend

API NestJS + Prisma + PostgreSQL (Supabase) para el proyecto NORMA.

## Requisitos

- Node.js 20+
- pnpm
- Proyecto PostgreSQL en [Supabase](https://supabase.com) (o Postgres local)

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
    auth/
    clients/
    alerts/
    sources/
  app.module.ts
  main.ts
prisma/
  schema.prisma      # Modelo ER inicial
```

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
| `DATABASE_URL` | Supabase project (dev) | Supabase project (staging/prod) o branch |
| `CORS_ORIGIN` | `http://localhost:5173` | URL del frontend desplegado |
| `SUPABASE_URL` | URL del proyecto Supabase | misma o proyecto dedicado |
| `SUPABASE_ANON_KEY` | publishable/anon key | key del ambiente |
| `SUPABASE_JWT_SECRET` | JWT secret del proyecto (Settings → API) | secret del ambiente |

Reglas:
- Nunca subir `.env` a Git.
- Staging y Production deben usar proyectos/branches de Supabase separados cuando sea posible.
- Migraciones en staging/prod: `pnpm prisma:deploy`.

### Tablero

GitHub Project: [NORMA — Piloto Arca](https://github.com/users/CRZANDROID/projects/1)

## Modelo ER

Modelo administrativo evoluciona hacia: usuarios vinculados a Supabase Auth, roles, membresías, clientes, perfiles regulatorios, fuentes y hallazgos.  
El semáforo operativo del piloto usa 4 niveles: verde, amarillo, naranja y rojo.
