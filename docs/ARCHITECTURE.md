# NORMA — Arquitectura (Backend)

## Stack fijado

| Capa | Tecnología | Notas |
|------|------------|-------|
| API | NestJS + **Express** | No migrar a Fastify sin métricas |
| ORM | Prisma 6 | Única vía a datos de negocio |
| DB | PostgreSQL en Supabase | Migraciones con Prisma; Supabase = hosting DB |
| Auth | JWT propio (Nest) | `passwordHash` + `POST /auth/login`; Bearer en rutas |
| Jobs | Redis + BullMQ | `source.crawl` HTTP (mismo host, no redes) + extract/normalize. YouTube/X = conectores MVP aparte |
| Storage | Supabase Storage | Originales de crawl + upload admin (`/storage/*`) |
| IA catálogo | OpenAI | `POST /ai/ask` — solo datos admin; no clasifica |
| IA (futuro) | OpenAI | Clasificación y semáforo desde Sprint 7 |
| Email (futuro) | Resend | Solo tras aprobación humana |

## Flujo canónico

```text
React (frontend)
  → POST /auth/login (email + password)
  → accessToken (JWT Nest)
  → Authorization: Bearer <token>
  → NestJS JwtAuthGuard (+ RolesGuard)
  → Controller → Service → PrismaService
  → PostgreSQL (Supabase u otro)
```

**Prohibido:** frontend → PostgREST/tablas de negocio para clients, sources, findings, users.

Supabase se usa para:

1. **Hosting de Postgres**
2. **Storage** de originales (crawl + upload admin)
3. **No** para Auth de aplicación

Prisma / Nest poseen identidad de negocio, reglas y autorización de tenant.

## Forma del monolito

Monolito modular NestJS:

```text
src/
  database/          # PrismaModule global
  health/
  modules/
    auth/            # login JWT, guards, /auth/me
    clients/         # CRUD clientes + perfiles + delivery
    sources/         # CRUD fuentes (estado + disparador)
    users/           # admin usuarios + memberships
    storage/         # upload / signed-url / download
    ai/              # POST /ai/ask (catálogo)
    documents/       # GET /documents + progress + reprocess
  jobs/              # BullMQ source.crawl + document.extract/normalize_dedup
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
| `JwtAuthGuard` | Obligatoria en rutas de negocio |
| `@Roles(...)` + `RolesGuard` | Mutaciones y admin |
| `@CurrentUser()` | Usuario NORMA (payload JWT → user en DB) |
| `POST /auth/login` | Emite JWT |
| `GET /auth/me` | Perfil + memberships para el front |
| `POST /users` | Alta de usuarios (solo `ADMIN`; hash bcrypt) |

Soft-status: `EntityStatus` (`ACTIVE` | `INACTIVE`). No hard-delete en el piloto.

## Modelo de datos (resumen)

- `User` — email, `passwordHash`, role, status
- `Client` — name, slug, status
- `ClientMembership` — unique(userId, clientId)
- `RegulatoryProfile` — keywords, categories, products (Json)
- `Source` — code, category, platform, jurisdiction, stateCode, schedule (hora/días/zona), status
- `ClientDeliveryConfig` — canales email/WhatsApp + acciones por nivel de semáforo (config; no envía)
- `Document` — original en Storage + `processingStatus` / hash / texto (S6)
- `Finding` — impacto (GREEN…RED), status; CRUD inbox = S7–S8
- `JobRun` — ejecución de crawl (`idempotencyKey`, status, errorCode)

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
| development | Local (`localhost:3000`) o `docker compose` ([docker.md](./docker.md)) |
| staging | Validación (TBD) |
| production | Clientes (TBD) |

Compose local: API + Redis; Postgres/Storage = Supabase (no hay Postgres en Compose). Variables: ver `.env.example`. Secretos nunca en Git.

## Documentación relacionada

- [README.md](./README.md) — índice
- [PRODUCT.md](./PRODUCT.md)
- [SPRINTS.md](./SPRINTS.md)
- [HANDOFF.md](./HANDOFF.md)
- [docker.md](./docker.md) — Compose API + Redis
- [postman-pruebas.md](./postman-pruebas.md)
