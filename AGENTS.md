# AGENTS.md — NORMA Backend

Instrucciones de entrada para cualquier agente (Cursor u otro) que trabaje en este repositorio.

## Antes de codear

1. **Estado actual / qué sigue:** [docs/HANDOFF.md](docs/HANDOFF.md) ← empezar aquí
2. [docs/PRODUCT.md](docs/PRODUCT.md) — qué es el producto y qué queda fuera
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, flujo Auth→Nest→Prisma, multi-tenant
4. [docs/SPRINTS.md](docs/SPRINTS.md) — sprint actual y dependencias
5. Si tocas CRUD admin: [docs/SPRINT-3-BACKEND.md](docs/SPRINT-3-BACKEND.md)
6. Si el trabajo es **UI client↔sources** (otro repo): [docs/FRONTEND-CLIENT-SOURCES.md](docs/FRONTEND-CLIENT-SOURCES.md) y [docs/FRONTEND-SOURCES-V2.md](docs/FRONTEND-SOURCES-V2.md)
7. Entrega consolidada front + `.env`: [docs/ENTREGA-FRONT-ENV.md](docs/ENTREGA-FRONT-ENV.md)
8. Crawl S5: [docs/jobs-crawl.md](docs/jobs-crawl.md) y contratos [docs/DOCUMENT-JOB-CONTRACTS.md](docs/DOCUMENT-JOB-CONTRACTS.md)
9. Entrega/semáforo (config): [docs/FRONTEND-CLIENT-DELIVERY.md](docs/FRONTEND-CLIENT-DELIVERY.md)
10. Asistente de catálogo: [docs/openai-catalog.md](docs/openai-catalog.md)

Las reglas en `.cursor/rules/` se aplican automáticamente; no las contradigas.

## Verdades fijas

- NestJS + **Express** (no Fastify sin decisión explícita).
- Auth = **JWT propio** (`POST /auth/login`, `passwordHash` bcrypt). Nest emite y valida Bearer.
- Datos de negocio solo vía **Prisma** → PostgreSQL (Supabase = hosting DB + Storage).
- Soft-status `ACTIVE`/`INACTIVE`; evitar hard-delete.
- `ADMIN` = backoffice total; no-ADMIN filtrar por `ClientMembership`.
- Frontend **no** lee tablas de negocio por PostgREST.
- Clientes pueden tener muchas fuentes (`client_sources`); ver [docs/client-sources.md](docs/client-sources.md).
- Fuentes estatales: `jurisdiction` + `stateCode`. Crawl schedule: `schedule` (no `frequency`).

## Estructura relevante

```text
src/modules/{auth,clients,sources,users,storage,ai}/
src/jobs/                 # Redis/BullMQ source.crawl
src/common/swagger.ts
prisma/schema.prisma
test/*e2e-spec.ts
docs/HANDOFF.md
docs/
.cursor/rules/
```

## Cómo pedir trabajo (plantilla)

> Lee `docs/HANDOFF.md` §4. Implementa X según `docs/...`. Respeta `.cursor/rules`. No inventes endpoints fuera del brief.

## Al cambiar arquitectura

Actualiza **docs + rules + HANDOFF** en el mismo PR/cambio. El chat no es fuente de verdad.
