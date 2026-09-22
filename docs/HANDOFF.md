# HANDOFF — Estado NORMA Backend (2026-09-17)

Documento de continuidad para el **próximo agente de backend** y contexto para el **agente de frontend**.  
Índice: [README.md](./README.md). Informe: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md). Capacitación: [TRAINING.md](./TRAINING.md).

---

## 1. Dónde estamos

| Sprint | Backend | Notas |
|--------|---------|--------|
| 1–2 | Hecho | Nest + Prisma + JWT propio (`POST /auth/login`) |
| 3 CRUD admin | **API hecha** | clients, profiles, sources, users/memberships |
| 3 extensión | **API hecha** | N:N **client ↔ sources** (`sourceIds` / `clientIds`) |
| 3+ ajustes | **API hecha** | Fiscales 1:1 + contactos 1:N |
| Pre-S5 modelo | **API hecha** | Entidad federativa, disparador, 32 congresos, delivery |
| Bloque 1 OpenAI | **API hecha** | `GET /ai/status` + `POST /ai/ask` (catálogo; no clasifica) |
| 5 crawl | **Hecho** | Redis/BullMQ + crawl del mismo sitio (no solo portada) |
| 6 documentos | **Hecho** | extract / normalize / SHA-256 / dedup + `GET /documents` |
| 7 clasificación | **Hecho** | `document.classify` + `GET /findings` en `/alertas` |
| 3 front | Fuera de este repo | `/alertas` = hallazgos. Brief: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) |
| 4 | **Hecho** | Sentry + Storage OK en local |
| 8 | **Hecho (API)** | Loop VCGA: editar / IA / excluir |
| 9 | PDF draft + lote + `/informes` VCGA | Generar en `/alertas`; ver/descargar/regenerar en Informes; envío pendiente |
| 10 | Pendiente | Portal `CLIENT_USER`; reutiliza `/informes` (solo enviados) |

**Siguiente en este repo:** capacitación hoy ([TRAINING.md](./TRAINING.md)). S9 resto (envío/`autoSend`) sigue pendiente. Contrato: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

---

## 2. Stack fijo (no reinventar)

- NestJS + **Express** + Prisma 6 → PostgreSQL (Supabase = DB + Storage)
- Auth: **JWT Nest** (`passwordHash` bcrypt). **No** Supabase Auth
- Header: `Authorization: Bearer <accessToken>` de `POST /auth/login`
- Soft-status `ACTIVE`/`INACTIVE`; no hard-delete
- Multi-tenant: `Client` + `ClientMembership`; `ADMIN` ve todo
- Front **no** usa PostgREST para tablas de negocio

| Recurso | URL / path |
|---------|------------|
| API | `http://localhost:3000` |
| Swagger | `http://localhost:3000/docs` |
| Seed/e2e | [seed-and-tests.md](./seed-and-tests.md) |
| Capacitación | [TRAINING.md](./TRAINING.md) |
| Índice | [README.md](./README.md) |
| Admin UI | [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md) |
| Panel rastreo | [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) |
| `/alertas` + informe | [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) |
| Jobs | [jobs.md](./jobs.md) |
| Rendimiento | [PERFORMANCE.md](./PERFORMANCE.md) |
| Docker | [docker.md](./docker.md) |
| Sentry/Storage | [sentry-storage.md](./sentry-storage.md) |
| Render | [render-deploy.md](./render-deploy.md) |

---

## 3. Qué ya está implementado (backend)

Migraciones: `client_sources`, `documents`, `client_fiscal_contacts`, `source_state_schedule_delivery`, `matrix_source_notes_semaphore`, `job_runs`, `search_focus_array`, `reports`. `pnpm prisma:deploy` si falta.

- Fiscales 1:1: `fiscal` → `fiscalData`. Contactos: `contacts[]` (**replace** en PATCH)
- Fuentes: `jurisdiction` + `stateCode` + `schedule`; `searchFocus` / `keywordsGuide` (`string[]`)
- Delivery 1:1: `suggestedAction` por nivel + `autoSend` (S9)
- `GET /ai/status`, `POST /ai/ask` (503 sin `OPENAI_API_KEY`)
- Crawl: cola `source.crawl`, `GET /jobs/status` (`queues` + `consumers`; `worker` = hay consumidor, no el flag del API), `POST /jobs/crawl` / `crawl/all`, `job_runs`. Tope `CRAWL_MAX_PAGES` 200 (profundidad 3). Concurrencia de sitios: `CRAWL_CONCURRENCY` (default 2, **no subir**). Lock crawl ~30 min; extract/classify `DOCUMENT_LOCK_MS` ~15 min. Body HTTP 25 MB; classify 25k caracteres. Sitio caído = error de origen. Compose: `api` sin workers + `worker`. El seed completo (`SEED_CATALOG` default) deja ACTIVE: DOF, Diputados, AGU, BC, BCS, Campeche, Chihuahua, Jalisco. **DB actual (pruebas de informe):** Arca Continental vinculada a `dof`, `diputados-gaceta`, `jalisco-congreso`, `cofepris` (ACTIVE) y `conamer` (INACTIVE, demo de capacitación: activar + rastrear). El resto de congresos del seed está INACTIVE. Stall/restart: cierra `job_runs` y documentos a medias; PDF en worker thread.
- Progress: `GET /jobs/progress`, `/documents/progress`, `/findings/progress` (1 fila/fuente ACTIVE)
- Documentos: extract / normalize / classify; PDF escaneado = `FAILED` (“PDF escaneado”); sin OCR
- Findings: unique documento×cliente; `GET /findings` = `{ dateFrom, dateTo, page, limit, total, totalPages, counts, items }` (`excludedFromNextReport`, `lote`, `counts.included/excluded/sent`). `PATCH /findings/:id` (`title`/`justification`/`impact`), `POST /findings/:id/exclude|include|rewrite` (`rewrite-v6`: `rewriteNote`, o 422 con el limitante si el pedido no se sostiene con el documento). `GET /findings/:id`. HUD: `POST /jobs/crawl/all` → extract+classify; `POST /jobs/extract/all` → extract + classify que falte; `POST /jobs/classify/all` (salta sin cliente). Una fuente: `/jobs/crawl` \| `/extract` \| `/classify`. `POST /documents/:id/classify` archivo suelto. Classify `classify-v2`.
- Informes: `POST /reports` + `GET /reports/:id/file` + regenerate. PDF = briefing sin portada (franja NORMA, fichas por hallazgo). `GET /findings?lote=` (`incluidos` \| `excluidos` \| `enviados`) y `counts.included/excluded/sent`. Front: Generar PDF en `/alertas`; mesa `/informes` (borradores/enviados). Esta semana **no** envía correo.

Detalle de jobs: [jobs.md](./jobs.md). Admin UI: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md).

### Módulos
```text
src/modules/{auth,clients,sources,users,storage,ai,documents,findings,reports}/
src/jobs/            # BullMQ source.crawl + extract/normalize_dedup/classify
```

---

## 4. Qué falta (prioridad)

1. **Capacitación / staging limpio:** catálogo vacío; ADMIN de pruebas; usuarios crean clientes y fuentes. [TRAINING.md](./TRAINING.md).
2. **Sprint 9 resto:** envío/`autoSend`, descartar, correo a contactos. [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).
3. **Sprint 10:** `CLIENT_USER` + historial; acciones sobre el **PDF**.
4. **Conectores MVP (después de S10):** YouTube / X / Facebook — [PRODUCT.md](./PRODUCT.md).
5. Redis en staging/prod (`REDIS_URL`) + **Background Worker** (el Web Service va con `JOBS_WORKER=false`). Scheduler 07:00 en el worker. Durante la sesión de capacitación el scheduler va **off** en ese worker.

---

## 5. Operación local

**Canónico: Docker** ([docker.md](./docker.md)).

```bash
docker compose up --build
```

API: `http://localhost:3000`. Front: `VITE_API_URL=http://localhost:3000`. Tras cambiar código: `--build`.

`.env`: `DATABASE_URL` (Session `:5432` para migrate; runtime Prisma → Transaction `:6543`), `JWT_SECRET`, `AUTH_SEED_*`; `SEED_CATALOG=false` en capacitación. Opcional `SENTRY_DSN`, `SUPABASE_*`, `OPENAI_API_KEY`. Compose pisa `REDIS_URL`, `PORT=3000` y `DATABASE_CONNECTION_LIMIT=2`. `api` = HTTP sin workers; `worker` = colas + cron.

`pnpm start:dev` en el host sin Redis → `ECONNREFUSED`. No es el flujo soportado.

---

## 6. Para el agente de FRONTEND

1. Admin (fuentes, vínculos, fiscales, delivery, `ai/ask`): **[FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md)**
2. Panel rastreo: **[FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md)**
3. `/alertas` + informe S8–S10: **[FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)**
4. Local API: [docker.md](./docker.md). HTTP: Swagger `/docs`.
5. Capacitación: [TRAINING.md](./TRAINING.md) (catálogo vacío; no Enviar).

---

## 7. Plantilla siguiente agente

> Lee `docs/HANDOFF.md` §4 y `docs/TRAINING.md`. Foco: staging limpio para capacitación. S9 envío pendiente. S10 = portal. Conectores YouTube/X **después de S10**. Pipeline: `docs/jobs.md`.

**Última actualización:** 2026-09-18 — stall de extract/classify/crawl cierra el tablero (no deja `RUNNING` eterno). Split API/worker. Envío S9 pendiente.
