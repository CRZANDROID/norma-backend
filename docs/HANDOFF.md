# HANDOFF — Estado NORMA Backend (2026-09-01)

Documento de continuidad para el **próximo agente de backend** y contexto para el **agente de frontend**.  
Fuente de verdad viva: este archivo + links. Actualízalo al cerrar un bloque de trabajo.  
Índice de docs: [README.md](./README.md).

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
| 5 crawl | **Hecho** | Redis/BullMQ + `job_runs` + crawl del mismo sitio (no solo portada) |
| 6 documentos | **Hecho** | extract / normalize / SHA-256 / dedup + `GET /documents` |
| 7 clasificación | **Hecho** | cola `document.classify` + `GET /findings` (semáforo; no inbox) |
| 3 front | Fuera de este repo | Wire UI → [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) + [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) + [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) + [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md) + [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md) |
| 4 | **Hecho en código/verificado** | Sentry + Storage OK en local |
| 8+ | Pendiente | Inbox / folio / Resend |

**Siguiente en este repo:** Sprint 8 (inbox humano + email tras aprobación). Crawl: sigue links legislativos del mismo host (tope `CRAWL_MAX_PAGES`); no es solo la home. Detalle: [jobs-crawl.md](./jobs-crawl.md). S6: [document-processing.md](./document-processing.md). S7: [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md).

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
| Índice docs | [README.md](./README.md) |
| Client↔sources (UI) | [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) |
| Front fiscal/contactos | [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) |
| Front delivery/semáforo | [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) |
| Fuentes v2 (estado + schedule) | [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) |
| Congresos estatales | [state-congresses.md](./state-congresses.md) |
| Jobs/docs contracts | [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |
| OpenAI catálogo | [openai-catalog.md](./openai-catalog.md) |
| Front AI ask | [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md) |
| Front panel rastreo | [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) |
| Front hallazgos S7 | [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md) |
| Jobs crawl S5 | [jobs-crawl.md](./jobs-crawl.md) |
| Registro documental S6 | [document-processing.md](./document-processing.md) |
| Entrega front + `.env` (snapshot) | [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) |
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
- Crawl S5: Redis/BullMQ cola `source.crawl`, `GET /jobs/status`, `POST /jobs/crawl`, tabla `job_runs` (503 sin `REDIS_URL`). Cada job trae hasta `CRAWL_MAX_PAGES` HTML/PDF/Word del mismo sitio (gaceta, iniciativas, notas DOF, etc.), no solo la portada. Admin reencola FAILED/QUEUED huérfanos; el scheduler no reintenta FAILED el mismo día. Seed ACTIVE: DOF, Gaceta Diputados, AGU, BC, BCS, Campeche, Chihuahua, Jalisco. DB ya sembrada → `pnpm prisma:seed`.
- Panel ejecutivo: `GET /jobs/progress` y `GET /documents/progress` (una fila por fuente). El dashboard lista cada página con `GET /documents` y el texto con `GET /documents/:id`.
- Registro documental S6: colas `document.extract` y `document.normalize_dedup`, `GET /documents`, `GET /documents/:id`, `POST /documents/:id/reprocess` (ADMIN). Extrae HTML, PDF (`unpdf`) y Word (`.doc`/`.docx`, p. ej. DOF `nota_to_doc`). PDF escaneado (sin capa de texto) falla con copy **PDF escaneado**; no hay OCR en este sprint. Detalle: [document-processing.md](./document-processing.md).
- Clasificación S7: cola `document.classify` al pasar a `READY_FOR_AI`; fan-out por `client_sources`; `Finding` único por documento×cliente; `GET /findings`, `GET /findings/:id`, `POST /documents/:id/classify` (ADMIN). 503 sin Redis o sin `OPENAI_API_KEY`. No email/inbox. UI: [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md).

### Sprint 4

| Issue | Estado |
|-------|--------|
| #11 Swagger + validation | **Hecho** — `/docs`, ValidationPipe |
| #12 Seed + indexes + e2e | **Hecho** — `pnpm test:e2e` |
| #13 Sentry + Storage | **Cerrado** — Sentry + upload/signed-url/download verificados en local |
| #14 Document/job contracts | **Hecho (doc)** — [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |

### Módulos
```text
src/modules/{auth,clients,sources,users,storage,ai,documents,findings}/
src/jobs/            # BullMQ source.crawl + document.extract/normalize_dedup/classify
src/common/swagger.ts
test/*e2e-spec.ts
```

---

## 4. Qué falta (prioridad)

1. **Sprint 8:** inbox humano (ACK/RESOLVE), folio / borrador ejecutivo, Resend solo tras aprobación. Findings S7 ya existen (`GET /findings`).
2. **Conectores MVP (contrato, no opcional):** YouTube / X / Facebook como jobs de plataforma — [PRODUCT.md](./PRODUCT.md) § social/multimedia. No ampliar el crawl HTTP a redes ni a players en vivo.
3. Redis en staging/prod (`REDIS_URL`) para que el scheduler crawlee a las 07:00.
4. Front: contratos de UI en este repo ([README.md](./README.md)); hallazgos — [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md). Panel de rastreo: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

---

## 5. Operación local

**Canónico: Docker** ([docs/docker.md](./docker.md)). Redis va en Compose; no hace falta `redis-server` en Windows.

```bash
docker compose up --build
```

API: `http://localhost:3000`. Front: `VITE_API_URL=http://localhost:3000`. Tras cambiar código: `--build`, no solo `restart`.

`.env`: `DATABASE_URL`, `JWT_SECRET`, `AUTH_SEED_*`; opcional `SENTRY_DSN`, `SUPABASE_*`, `OPENAI_API_KEY` (classify). Compose pisa `REDIS_URL` y `PORT=3000`.

`pnpm start:dev` en el host usa `REDIS_URL=redis://127.0.0.1:6379` → `ECONNREFUSED` si Redis no está. No es el flujo soportado.

---

## 6. Para el agente de FRONTEND

Índice: **[README.md](./README.md)**. `.env` / Redis: [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) (snapshot; S6 ya está hecho).

1. Fuentes: **[FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md)** (`jurisdiction`, `stateCode`, `schedule`; ya no `frequency`).
2. Vínculos: **[FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md)**.
3. Fiscales + contactos: **[FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)**.
4. Entrega / semáforo (config, no inbox): **[FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md)**.
5. Asistente de catálogo: **[FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md)**.
6. Crawl (botón ADMIN): [jobs-crawl.md](./jobs-crawl.md) / sección 2.5 de la entrega.
7. Panel rastreo/extracción: **[FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md)** (`GET /jobs/progress`, `GET /documents/progress`).
8. Hallazgos / semáforo (S7, no inbox): **[FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md)**.

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

> Lee `docs/HANDOFF.md` §4. S8 inbox/email sobre findings ya clasificados. Conectores YouTube/X son **MVP** ([PRODUCT.md](./PRODUCT.md)); no van en el spider WEB. S7: `FRONTEND-FINDINGS.md`. S6: `document-processing.md`. Crawl S5: `jobs-crawl.md`. Front: `FRONTEND-SOURCES-V2.md` + `FRONTEND-CLIENT-DELIVERY.md` + `FRONTEND-AI-ASK.md` + `FRONTEND-TRACKING.md` + `FRONTEND-FINDINGS.md`.

**Última actualización:** 2026-09-01 — Sprint 7 clasificación + semáforo (`GET /findings`); S8 inbox/email sigue; YouTube/X/Facebook = MVP (no crawl HTTP).
