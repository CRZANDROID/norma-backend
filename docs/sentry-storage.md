# Sentry + Supabase Storage — NORMA Backend

Guía de configuración para captura de errores (Sentry) e integración mínima de archivos (Supabase Storage).

**Issue #13** — código en repo; verificación en ambiente con secrets reales.

---

## 1. Sentry (errores)

### Variables

| Variable | Requerida | Descripción |
|---|---|---|
| `SENTRY_DSN` | No* | DSN del proyecto Sentry. Si está vacío, Sentry queda deshabilitado. |
| `NODE_ENV` | No | Se envía como `environment` (`development` / `staging` / `production`). |

\*En staging/prod conviene definirla siempre.

### Qué hace el código

1. `src/instrument.ts` — `Sentry.init()` antes de cargar Nest.
2. `src/main.ts` — importa `./instrument` como **primera** línea.
3. `AppModule` — `SentryModule.forRoot()` + `SentryGlobalFilter` (`APP_FILTER`) para enviar excepciones no manejadas / no-`HttpException` de control flow.

### Cómo verificar

1. Crea un proyecto Node/NestJS en [sentry.io](https://sentry.io) y copia el DSN.
2. Pon `SENTRY_DSN=...` en `.env`.
3. Arranca `pnpm start:dev`.
4. Provoca un error 500 real (o un endpoint de prueba temporal) y confirma el evento en Sentry → Issues.

`HttpException` 4xx típicas (401/403/404) **no** se reportan por defecto (son control de flujo). Los errores inesperados sí.

---

## 2. Supabase Storage (archivos)

### Variables

| Variable | Requerida | Descripción |
|---|---|---|
| `SUPABASE_URL` | Sí (para storage) | Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (para storage) | Service role key (solo backend; nunca en el front) |
| `SUPABASE_STORAGE_BUCKET` | No | Default: `documents` |

Sin URL/key, la API arranca igual; los endpoints `/storage/*` responden `503`.

### Setup en Supabase (manual)

1. Supabase → **Storage** → crea el bucket `documents` (privado), **o**
2. Ejecuta el SQL de setup del bucket (no toca tablas Prisma de negocio):

```text
docs/sql/supabase-storage-documents-bucket.sql
```

En Dashboard → **SQL Editor** → pegar y Run.

### Endpoints Nest

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `POST` | `/storage/upload` | ADMIN, ANALYST | `multipart/form-data`, campo `file` |
| `GET` | `/storage/download?path=` | ADMIN, ANALYST, VIEWER | Descarga binaria |
| `GET` | `/storage/signed-url?path=` | ADMIN, ANALYST, VIEWER | URL temporal firmada |

Query opcionales en upload:

- `folder` — subcarpeta (ej. `findings/raw`)
- `clientId` — agrupa bajo `clients/<id>/...`

Respuesta de upload (ejemplo):

```json
{
  "bucket": "documents",
  "path": "clients/clxxx/2026-08-03T18-00-00-000Z_archivo.pdf",
  "filename": "archivo.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 12345,
  "publicUrl": "https://..."
}
```

Con bucket **privado**, usa `signed-url` o `download` en lugar de `publicUrl`.

Límite actual: **20 MB** por archivo.

Pruebas Postman: sección Storage en [postman-pruebas.md](./postman-pruebas.md).

---

## 3. Tabla `documents` (metadatos)

Modelo `Document` + migración:

```text
prisma/migrations/20260803180000_documents_storage_meta/migration.sql
```

Guarda metadatos (`bucket`, `path`, `filename`, `mimeType`, `clientId`, …). El binario sigue en Storage.

**Estado:** la migración debe estar aplicada (`pnpm prisma:deploy`).  
**Comportamiento API:** `/storage/*` opera contra el bucket y **no** crea filas `documents`. El pipeline de crawl S5–S6 **sí** crea/actualiza `Document` (extract/normalize). Ver [document-processing.md](./document-processing.md) y [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md).

```bash
pnpm prisma:deploy
```

---

## 4. Checklist de aceptación (#13)

| Check | Cómo |
|-------|------|
| [x] `SENTRY_DSN` en `.env` (staging/prod) | `GET /debug/sentry-test` → Issue en Sentry |
| [x] Bucket `documents` creado | SQL `docs/sql/...` o UI Supabase |
| [x] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `.env` (nunca commit) |
| [x] Upload con JWT ADMIN/ANALYST | `POST /storage/upload` form-data `file` |
| [x] Signed-url + download | `GET /storage/signed-url` y `GET /storage/download` |
| [ ] Sin key → `503` en `/storage/*` | Quitar key y confirmar (opcional) |

**Cerrado #13** en local el 2026-08-04 (upload/signed-url/download OK + Sentry OK).

---

## 5. Fuera de alcance de #13

- UI de archivos en el front
- Exponer `service_role` al browser

(Crawl/extract S5–S6: [jobs-crawl.md](./jobs-crawl.md), [document-processing.md](./document-processing.md).)
