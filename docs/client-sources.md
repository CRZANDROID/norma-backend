# Relación clientes ↔ fuentes

Relación **N:N** sin alterar el resto del modelo de `clients` / `sources` más allá de la tabla puente.

## Tabla puente

```text
prisma/migrations/20260803190000_client_sources/migration.sql
```

Modelo Prisma: `ClientSource` → tabla `client_sources` (`client_id`, `source_id`, unique + índices).

Aplicar si falta en un ambiente:

```bash
pnpm prisma:deploy
# o: pnpm prisma:migrate
```

## API

| Acción | Cómo |
|---|---|
| Crear cliente + fuentes | `POST /clients` con `sourceIds: string[]` |
| Editar vinculaciones | `PATCH /clients/:id` con `sourceIds` (**reemplaza** el set; omitir = no tocar; `[]` = quitar todas) |
| Crear fuente + clientes | `POST /sources` con `clientIds: string[]` |
| Editar fuente | `PATCH /sources/:id` **no** cambia clientes |
| Listar fuentes de un cliente | `GET /sources?clientId=...` |
| Ver detalle | `GET /clients/:id` → `sources`; `GET /sources/:id` → `clients` |

Guía para implementar UI: [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md).

## Storage

Los endpoints `/storage/*` son independientes de esta relación (ver [sentry-storage.md](./sentry-storage.md)).
