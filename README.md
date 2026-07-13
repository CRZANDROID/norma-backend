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

| Ambiente | Uso |
|----------|-----|
| `development` | Local (este setup) |
| `staging` | Pendiente de despliegue |
| `production` | Pendiente de despliegue |

Variables por ambiente: `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`.

## Modelo ER inicial

Entidades: `User`, `Client`, `Source`, `Alert` (con enums de rol, severidad y estado).  
Es un punto de partida alineado a las pantallas del frontend; se refinará con el dominio completo del producto.
