# AGENTS.md — NORMA Backend

Instrucciones de entrada para cualquier agente (Cursor u otro) que trabaje en este repositorio.

## Antes de codear

1. **Estado / qué sigue:** [docs/HANDOFF.md](docs/HANDOFF.md)
2. **Índice:** [docs/README.md](docs/README.md)
3. [docs/PRODUCT.md](docs/PRODUCT.md)
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
5. [docs/SPRINTS.md](docs/SPRINTS.md) — piloto S1–S10
6. Briefs UI: [docs/FRONTEND-ADMIN.md](docs/FRONTEND-ADMIN.md), [docs/FRONTEND-TRACKING.md](docs/FRONTEND-TRACKING.md), [docs/FRONTEND-ALERTAS.md](docs/FRONTEND-ALERTAS.md)
7. Pipeline: [docs/jobs.md](docs/jobs.md)

Las reglas en `.cursor/rules/` se aplican automáticamente; no las contradigas.

**Local:** API HTTP + worker BullMQ + Redis = `docker compose up --build` ([docs/docker.md](docs/docker.md)). No `pnpm start:dev` sin Redis en el host.

HTTP vivo: Swagger `/docs`. No uses briefs históricos (`frequency` está muerto).

## Verdades fijas

- NestJS + **Express** (no Fastify sin decisión explícita).
- Auth = **JWT propio** (`POST /auth/login`, `passwordHash` bcrypt). Nest emite y valida Bearer.
- Datos de negocio solo vía **Prisma** → PostgreSQL (Supabase = hosting DB + Storage).
- Soft-status `ACTIVE`/`INACTIVE`; evitar hard-delete.
- `ADMIN` = backoffice total; no-ADMIN filtrar por `ClientMembership`.
- Frontend **no** lee tablas de negocio por PostgREST.
- Clientes pueden tener muchas fuentes (`client_sources`); UI: [docs/FRONTEND-ADMIN.md](docs/FRONTEND-ADMIN.md).
- Fuentes estatales: `jurisdiction` + `stateCode`. Crawl schedule: `schedule` (no `frequency`).
- Crawl HTTP = gaceta/PDF del mismo host. **YouTube / X / Facebook son MVP** (conectores de plataforma, no el spider WEB): [docs/PRODUCT.md](docs/PRODUCT.md).

## Estructura relevante

```text
src/modules/{auth,clients,sources,users,storage,ai,documents,findings,reports}/
src/jobs/                 # Redis/BullMQ source.crawl + document.extract/normalize_dedup/classify
src/common/swagger.ts
prisma/schema.prisma
test/*e2e-spec.ts
docs/HANDOFF.md
docs/README.md
.cursor/rules/
```

## Cómo pedir trabajo (plantilla)

> Lee `docs/HANDOFF.md` §4. Implementa X según `docs/...`. Respeta `.cursor/rules`. No inventes endpoints fuera del brief.

## Al cambiar arquitectura

Actualiza **docs + rules + HANDOFF** en el mismo PR/cambio. El chat no es fuente de verdad.
