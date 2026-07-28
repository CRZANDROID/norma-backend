# AGENTS.md — NORMA Backend

Instrucciones de entrada para cualquier agente (Cursor u otro) que trabaje en este repositorio.

## Antes de codear

1. Leer [docs/PRODUCT.md](docs/PRODUCT.md) — qué es el producto y qué queda fuera.
2. Leer [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, flujo Auth→Nest→Prisma, multi-tenant.
3. Revisar [docs/SPRINTS.md](docs/SPRINTS.md) — sprint actual y dependencias.
4. Si el trabajo es Sprint 3 admin API: [docs/SPRINT-3-BACKEND.md](docs/SPRINT-3-BACKEND.md).

Las reglas en `.cursor/rules/` se aplican automáticamente; no las contradigas.

## Verdades fijas

- NestJS + **Express** (no Fastify sin decisión explícita).
- Auth = **Supabase Auth**; Nest valida Bearer; **no** passwords locales.
- Datos de negocio solo vía **Prisma** → PostgreSQL.
- Soft-status `ACTIVE`/`INACTIVE`; evitar hard-delete.
- `ADMIN` = backoffice total; no-ADMIN filtrar por `ClientMembership`.
- Frontend **no** lee tablas de negocio por PostgREST.

## Estructura relevante

```text
src/modules/{auth,clients,sources,alerts}/
prisma/schema.prisma
docs/
.cursor/rules/
```

## Cómo pedir trabajo (plantilla)

> Implementa X según `docs/...`. Respeta `.cursor/rules`. No inventes endpoints fuera del brief del sprint.

## Al cambiar arquitectura

Actualiza **docs + rules** en el mismo PR/cambio. El chat no es fuente de verdad.
