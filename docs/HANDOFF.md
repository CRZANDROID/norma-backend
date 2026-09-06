# HANDOFF — Estado NORMA Backend (2026-09-06)

Documento de continuidad para el **próximo agente de backend** y contexto para el **agente de frontend**.  
Índice: [README.md](./README.md). Informe: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

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
| 8 | Pendiente | Loop VCGA: editar / IA / excluir |
| 9 | Pendiente | PDF + envío (confirmar o `autoSend`) |
| 10 | Pendiente | Portal `CLIENT_USER`; el caso es el PDF |

**Siguiente en este repo:** Sprint 8 — validación en `/alertas`, **sin** PDF. Contrato: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md). Pipeline: [jobs.md](./jobs.md).

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
| Índice | [README.md](./README.md) |
| Admin UI | [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md) |
| Panel rastreo | [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) |
| `/alertas` + informe | [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) |
| Jobs | [jobs.md](./jobs.md) |
| Docker | [docker.md](./docker.md) |
| Sentry/Storage | [sentry-storage.md](./sentry-storage.md) |
| Render | [render-deploy.md](./render-deploy.md) |

---

## 3. Qué ya está implementado (backend)

Migraciones: `client_sources`, `documents`, `client_fiscal_contacts`, `source_state_schedule_delivery`, `matrix_source_notes_semaphore`, `job_runs`, `search_focus_array`. `pnpm prisma:deploy` si falta.

- Fiscales 1:1: `fiscal` → `fiscalData`. Contactos: `contacts[]` (**replace** en PATCH)
- Fuentes: `jurisdiction` + `stateCode` + `schedule`; `searchFocus` / `keywordsGuide` (`string[]`)
- Delivery 1:1: `suggestedAction` por nivel + `autoSend` (S9)
- `GET /ai/status`, `POST /ai/ask` (503 sin `OPENAI_API_KEY`)
- Crawl: cola `source.crawl`, `GET /jobs/status`, `POST /jobs/crawl`, `job_runs`. Tope `CRAWL_MAX_PAGES`. Sitio caído = error de origen. Seed ACTIVE: DOF, Diputados, AGU, BC, BCS, Campeche, Chihuahua, Jalisco
- Progress: `GET /jobs/progress`, `/documents/progress`, `/findings/progress` (1 fila/fuente ACTIVE)
- Documentos: extract / normalize / classify; PDF escaneado = `FAILED` (“PDF escaneado”); sin OCR
- Findings: unique documento×cliente; `GET /findings`, `GET /findings/:id`, `POST /documents/:id/classify` (ADMIN)

Detalle de jobs: [jobs.md](./jobs.md). Admin UI: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md).

### Módulos
```text
src/modules/{auth,clients,sources,users,storage,ai,documents,findings}/
src/modules/reports/ # S9 (aún no existe)
src/jobs/            # BullMQ source.crawl + extract/normalize_dedup/classify
```

---

## 4. Qué falta (prioridad)

1. **Sprint 8:** loop en `/alertas` — editar, reescribir con IA (solo documento), excluir de **este** PDF. No generar PDF. [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).
2. **Sprint 9:** Generar PDF (bloqueado si `classifying`); regenerar; `autoSend` o confirmar; correo a contactos; reabrir si hash distinto.
3. **Sprint 10:** `CLIENT_USER` + historial; acciones sobre el **PDF**.
4. **Conectores MVP (después de S10):** YouTube / X / Facebook — [PRODUCT.md](./PRODUCT.md).
5. Redis en staging/prod (`REDIS_URL`) para el scheduler a las 07:00 (crawl, no empaque de PDF).

---

## 5. Operación local

**Canónico: Docker** ([docker.md](./docker.md)).

```bash
docker compose up --build
```

API: `http://localhost:3000`. Front: `VITE_API_URL=http://localhost:3000`. Tras cambiar código: `--build`.

`.env`: `DATABASE_URL`, `JWT_SECRET`, `AUTH_SEED_*`; opcional `SENTRY_DSN`, `SUPABASE_*`, `OPENAI_API_KEY`. Compose pisa `REDIS_URL` y `PORT=3000`.

`pnpm start:dev` en el host sin Redis → `ECONNREFUSED`. No es el flujo soportado.

---

## 6. Para el agente de FRONTEND

1. Admin (fuentes, vínculos, fiscales, delivery, `ai/ask`): **[FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md)**
2. Panel rastreo: **[FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md)**
3. `/alertas` + informe S8–S10: **[FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)**
4. Local API: [docker.md](./docker.md). HTTP: Swagger `/docs`.

---

## 7. Plantilla siguiente agente

> Lee `docs/HANDOFF.md` §4 y `docs/FRONTEND-ALERTAS.md`. S8 = editar/excluir en `/alertas` (sin PDF). S9 = generar/enviar. S10 = portal. Conectores YouTube/X **después de S10**. Pipeline: `docs/jobs.md`.

**Última actualización:** 2026-09-06 — docs recortados al set vivo. `/alertas` es el loop de VCGA. PDF solo tras validar. Cliente automático: generar = enviar.
