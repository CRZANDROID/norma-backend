# HANDOFF — Estado NORMA Backend (2026-08-18)

Documento de continuidad para el **próximo agente de backend** y contexto para el **agente de frontend**.  
Fuente de verdad viva: este archivo + links. Actualízalo al cerrar un bloque de trabajo.

---

## 1. Dónde estamos

| Sprint | Backend | Notas |
|--------|---------|--------|
| 1–2 | Hecho | Nest + Prisma + JWT propio (`POST /auth/login`) |
| 3 CRUD admin | **API hecha** | clients, profiles, sources, users/memberships |
| 3 extensión | **API hecha** | N:N **client ↔ sources** (`sourceIds` / `clientIds`) |
| 3+ ajustes | **API hecha** | Datos fiscales 1:1 + contactos 1:N del cliente |
| Pre-S5 modelo | **API hecha** | Entidad federativa, disparador, catálogo 32 congresos, delivery/semáforo |
| Bloque 1 OpenAI | **API hecha** | `GET /ai/status` + `POST /ai/ask` (catálogo; no clasifica) |
| 5 crawl | **Hecho** | Redis/BullMQ + `job_runs` + conectores DOF/Diputados/Jalisco |
| 6 documentos | **Hecho** | extract / normalize / SHA-256 / dedup + `GET /documents` |
| 3 front | Fuera de este repo | Wire UI → [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) + [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) + [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) + [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md) |
| 4 | **Hecho en código/verificado** | Sentry + Storage OK en local |
| 7+ | Pendiente | Clasificación OpenAI / inbox |

**Siguiente en este repo:** Sprint 7 (clasificación / semáforo). Registro documental S6: [document-processing.md](./document-processing.md). Crawl: [jobs-crawl.md](./jobs-crawl.md).

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
| Postman | [postman-pruebas.md](./postman-pruebas.md) |
| Seed/e2e | [seed-and-tests.md](./seed-and-tests.md) |
| Client↔sources | [client-sources.md](./client-sources.md) |
| Front UI guide | [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) |
| Front fiscal/contactos | [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) |
| Front delivery/semáforo | [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) |
| Fuentes v2 (estado + schedule) | [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) |
| Congresos estatales | [state-congresses.md](./state-congresses.md) |
| Jobs/docs contracts | [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |
| OpenAI catálogo | [openai-catalog.md](./openai-catalog.md) |
| Front AI ask | [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md) |
| Jobs crawl S5 | [jobs-crawl.md](./jobs-crawl.md) |
| Registro documental S6 | [document-processing.md](./document-processing.md) |
| **Entrega front + .env** | **[ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md)** |
| Sentry/Storage | [sentry-storage.md](./sentry-storage.md) |
| Render | [render-deploy.md](./render-deploy.md) |

---

## 3. Qué ya está implementado (backend)

### Auth / CRUD / client↔sources / fiscales / contactos / delivery
Ver Postman. Migraciones relevantes: `client_sources`, `documents`, `client_fiscal_contacts`, `source_state_schedule_delivery`, `matrix_source_notes_semaphore`, `job_runs`, `search_focus_array`. Aplicar con `pnpm prisma:deploy` si falta.

- Fiscales 1:1: `fiscal` en create/PATCH client → respuesta `fiscalData`
- Contactos: `contacts[]` en create/PATCH client (**replace** en PATCH); rutas `/clients/:clientId/contacts`
- Fuentes: `jurisdiction` + `stateCode`; `schedule`; `searchFocus` (`string[]`, igual que `keywordsGuide`) / `notes` (matriz VCGA)
- Delivery 1:1: `deliveryConfig` con `suggestedAction` por nivel (registrar / seguir / nota / alertar)
- Asistente de catálogo: `GET /ai/status`, `POST /ai/ask` (OpenAI; 503 sin `OPENAI_API_KEY`)
- Crawl S5: Redis/BullMQ cola `source.crawl`, `GET /jobs/status`, `POST /jobs/crawl`, tabla `job_runs` (503 sin `REDIS_URL`). Admin reencola FAILED/QUEUED huérfanos; el scheduler no reintenta FAILED el mismo día.
- Registro documental S6: colas `document.extract` y `document.normalize_dedup`, `GET /documents`, `GET /documents/:id`, `POST /documents/:id/reprocess` (ADMIN). Detalle: [document-processing.md](./document-processing.md).

### Sprint 4

| Issue | Estado |
|-------|--------|
| #11 Swagger + validation | **Hecho** — `/docs`, ValidationPipe |
| #12 Seed + indexes + e2e | **Hecho** — `pnpm test:e2e` |
| #13 Sentry + Storage | **Cerrado** — Sentry + upload/signed-url/download verificados en local |
| #14 Document/job contracts | **Hecho (doc)** — [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |

### Módulos
```text
src/modules/{auth,clients,sources,users,storage,ai,documents}/
src/jobs/            # BullMQ source.crawl + document.extract/normalize_dedup
src/common/swagger.ts
test/*e2e-spec.ts
```

---

## 4. Qué falta (prioridad)

1. **Sprint 7:** clasificación OpenAI / semáforo sobre documentos `READY_FOR_AI`.
2. Frontend (otro repo): listado mínimo de registro documental en el panel de rastreo.
3. Redis en staging/prod (`REDIS_URL`) para que el scheduler crawlee a las 07:00.

---

## 5. Operación local

```bash
pnpm install
# Si ERR_PNPM_IGNORED_BUILDS: pnpm approve-builds --all && pnpm install
pnpm prisma:deploy && pnpm prisma:seed
pnpm start:dev
pnpm test:e2e
```

`.env`: `DATABASE_URL`, `JWT_SECRET`, `AUTH_SEED_*`; opcional `SENTRY_DSN`, `SUPABASE_*`, `OPENAI_API_KEY`. Para crawl: `REDIS_URL=redis://127.0.0.1:6379` (Redis debe estar escuchando). Windows sin Docker: `redis-server --bind 127.0.0.1 --port 6379`.

---

## 6. Para el agente de FRONTEND

Documento único (bloques 0–2 + checklist UI + `.env`): **[ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md)**.

1. Fuentes: **[FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md)** (`jurisdiction`, `stateCode`, `schedule`; ya no `frequency`).
2. Vínculos: **[FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md)**.
3. Fiscales + contactos: **[FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)**.
4. Entrega / semáforo (config, no inbox): **[FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md)**.
5. Asistente de catálogo: **[FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md)**.
6. Crawl (botón ADMIN): [jobs-crawl.md](./jobs-crawl.md) / sección 2.5 de la entrega.

---

## 7. Issues GitHub (`norma-backend`)

| # | Título | Acción |
|---|--------|--------|
| 8–10 | S3 CRUD | CLOSED |
| 11 | Swagger/validation | Cerrar si confirman `/docs` + 400 |
| 12 | Seed/tests | Cerrar si `pnpm test:e2e` OK |
| 13 | Sentry+Storage | CLOSED — verificado local |
| 14 | Document contracts | Cerrar — doc entregada |
| 15–16 | S5 workers/connectors | **Hecho** — [jobs-crawl.md](./jobs-crawl.md) |
| 17–18 | S6 documentos | **Hecho** — [document-processing.md](./document-processing.md) |

---

## 8. Plantilla siguiente agente

> Lee `docs/HANDOFF.md` §4. S7 clasificación sobre `READY_FOR_AI`. S6: `document-processing.md`. Crawl S5: `jobs-crawl.md`. Front: `FRONTEND-SOURCES-V2.md` + `FRONTEND-CLIENT-DELIVERY.md` + `FRONTEND-AI-ASK.md`.

**Última actualización:** 2026-08-25 — S6 registro documental (extract HTML/PDF, ficha, SHA-256, DEDUPED vs READY_FOR_AI, `GET /documents`).
