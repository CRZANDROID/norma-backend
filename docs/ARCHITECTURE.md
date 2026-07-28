# NORMA — Arquitectura (Backend)

## Stack fijado

| Capa | Tecnología | Notas |
|------|------------|-------|
| API | NestJS + **Express** | No migrar a Fastify sin métricas |
| ORM | Prisma 6 | Única vía a datos de negocio |
| DB | PostgreSQL en Supabase | Migraciones con Prisma |
| Auth | Supabase Auth | Nest valida Bearer; no guarda passwords |
| Jobs (futuro) | Redis + BullMQ | Desde Sprint 5 |
| IA (futuro) | OpenAI | Desde Sprint 7 |
| Email (futuro) | Resend | Solo tras aprobación humana |

## Flujo canónico

```text
React (frontend)
  → Supabase Auth (login / session / access token)
  → Authorization: Bearer <token>
  → NestJS SupabaseAuthGuard (+ RolesGuard)
  → Controller → Service → PrismaService
  → PostgreSQL (Supabase)
```

**Prohibido:** frontend → PostgREST/tablas de negocio para clients, sources, findings, users.

Supabase se usa para:

1. **Auth** (identidad, sesión, JWT)
2. **Hosting de Postgres** (y más adelante Storage)

Prisma / Nest poseen las reglas de negocio y la autorización de tenant.

## Forma del monolito

Monolito modular NestJS:

```text
src/
  database/          # PrismaModule global
  health/
  modules/
    auth/            # guards, sync user, /auth/me
    clients/         # CRUD clientes + perfiles
    sources/         # CRUD fuentes
    users/           # admin usuarios (Sprint 3)
    alerts/          # legacy name; dominio real = findings
  app.module.ts
  main.ts
```

Patrón mínimo por módulo:

```text
Controller → Service → Prisma
DTO en dto/
Guards en el controller
```

Cuando crezca la complejidad, se puede separar presentation / application / domain / infrastructure **sin** romper el flujo anterior.

## Multi-tenancy

- Unidad de tenant: `Client`
- Acceso usuario↔cliente: `ClientMembership` (`userId` + `clientId` + `role`)
- `User.role` = rol **global** de backoffice
- Membership.role = rol **dentro** de un cliente
- `ADMIN` ve todo; no-ADMIN solo clientes de memberships `ACTIVE`

## AuthZ

| Pieza | Uso |
|-------|-----|
| `SupabaseAuthGuard` | Obligatoria en rutas de negocio |
| `@Roles(...)` + `RolesGuard` | Mutaciones y admin |
| `@CurrentUser()` | Usuario NORMA (no solo claim JWT) |
| `GET /auth/me` | Perfil + memberships para el front |

Soft-status: `EntityStatus` (`ACTIVE` | `INACTIVE`). No hard-delete en el piloto.

## Modelo de datos (resumen)

- `User` — `authUserId` (Supabase), email, role, status
- `Client` — name, slug, status
- `ClientMembership` — unique(userId, clientId)
- `RegulatoryProfile` — keywords, categories, products (Json)
- `Source` — code, type, url, config (Json), status
- `Finding` — impacto (GREEN…RED), status; CRUD inbox más adelante

Fuente de verdad del schema: `prisma/schema.prisma`.

## Convenciones de código

1. Controllers no inyectan Prisma directo (salvo health).
2. Mutaciones con DTO + validación.
3. Errores: `401` / `403` / `404` / `409` / `400` con significado estable.
4. Identificadores de negocio estables: `Client.slug`, `Source.code`.
5. Commits: Conventional Commits; ramas `main`, `dev`, `feature/*`.

## Ambientes

| Ambiente | Uso |
|----------|-----|
| development | Local (`localhost:3000`) |
| staging | Validación (TBD) |
| production | Clientes (TBD) |

Variables: ver `.env.example`. Secretos nunca en Git.

## Documentación relacionada

- [PRODUCT.md](./PRODUCT.md)
- [SPRINTS.md](./SPRINTS.md)
- [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md)
