# NORMA — Sprints (piloto)

Plan del GitHub Project **NORMA — Piloto Arca**.  
El piloto se armó como **8 iteraciones semanales** (S1–S8): cada “Sprint N” = **una semana** de ese plan, no un sprint de 4 semanas. No hay issues S9+.

Piloto inicial: Arca Continental + pocas fuentes representativas.

## Estado alto nivel

| Sprint | Nombre | Enfoque | Estado típico |
|--------|--------|---------|---------------|
| 1 | Fundaciones | Repos, Nest/React, Prisma, health, tablero | Hecho |
| 2 | Identidad | Auth JWT propia, guards, schema admin, `/auth/me`, login | Hecho |
| 3 | CRUD admin | Clients, profiles, sources, users + pantallas | **Hecho** (API + UI admin) |
| 4 | Estabilización | Swagger, validación, e2e, Sentry, Storage, contratos jobs | **Hecho** (#13 cerrado en local) |
| 5 | Ingesta | Redis/BullMQ + conectores piloto | **Hecho** |
| 6 | Documentos | Registro, storage, extract/normalize/dedup | **Hecho** |
| 7 | IA | OpenAI client, clasificación, relevancia, semáforo | **Hecho** |
| 8 | Entrega piloto | Borrador ejecutivo, inbox humano, email tras OK | Pendiente |

Fechas de iteración en el Project (aprox.): Sprint 1 desde 2026-07-06, duración 7 días c/u.

---

## Sprint 1 — Fundaciones

- Scaffold NestJS + env + `/health` + Prisma + Supabase DB
- Scaffold React/Vite + router + layouts
- GitHub Project + convenciones Git

**Entregable:** app local viva (API + UI).

---

## Sprint 2 — Identidad y modelo administrativo

- Schema: users (`passwordHash`), clients, memberships, profiles, sources, findings
- Nest: JWT propio (`POST /auth/login`), guards, roles, `GET /auth/me`
- Front: login contra Nest, rutas protegidas, Bearer en Axios
- Seed Arca + fuentes piloto + admin local

**Entregable:** usuario autenticado con perfil NORMA.

---

## Sprint 3 — CRUD administrativo vertical

Issues backend (hechos):

- `S3: CRUD Clients + regulatory profiles API` (P0) — **hecho**
- `S3: CRUD Sources + activate/deactivate` (P0) — **hecho**
- `S3: Basic user admin and role assignment` (P1) — **hecho**

Issue frontend (**hecho**, #3 cerrado):

- `S3: Admin screens connected to real API`

**Entregable backend:** API admin real (clients, profiles, sources, users) con AuthZ.  
**Extensión (API hecha):** vínculo N:N cliente↔fuentes — [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md).  
**Entregable sprint completo:** panel admin con datos reales.

Brief histórico S3 (no usar `frequency`): [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md).
Pruebas: [postman-pruebas.md](./postman-pruebas.md)  
**Continuidad agentes:** [HANDOFF.md](./HANDOFF.md)

---

## Sprint 4 — Estabilización e infraestructura ligera

- [x] Swagger/OpenAPI en `/docs` + ValidationPipe
- [x] Índices, seed documentado, tests auth/permisos/CRUD smoke (`pnpm test:e2e`)
- [x] Sentry + Storage (verificado en local; [sentry-storage.md](./sentry-storage.md))
- [x] Contratos de documentos / jobs de ingesta — [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md)

**Entregable:** plataforma admin estable lista para ingesta.  
Estado vivo: [HANDOFF.md](./HANDOFF.md).

---

**Pre-S5 (modelo, hecho en backend):** entidad federativa + disparador en fuentes, catálogo de 32 congresos, config de semáforo/canales por cliente. ACTIVE de crawl: ver [state-congresses.md](./state-congresses.md).

**Bloque 1 (hecho):** asistente de catálogo `POST /ai/ask` — [openai-catalog.md](./openai-catalog.md). No es clasificación S7.

## Sprint 5 — Motor de ingesta piloto

- [x] Redis + BullMQ (workers, retries, scheduler)
- [x] Conectores HTTP: DOF, Diputados y congresos ACTIVE (mismo sitio, no solo portada)
- [x] Tabla `job_runs` + `POST /jobs/crawl`
- [x] `GET /jobs/progress` (resumen ejecutivo por fuente)

**Entregable:** jobs que traen resultados crudos por fuente. Detalle: [jobs-crawl.md](./jobs-crawl.md).

---

## Sprint 6 — Registro documental

- [x] Documentos inmutables + originales en Storage + estados de pipeline
- [x] Extracción HTML/PDF, normalización, hash, dedup
- [x] `GET /documents` y `GET /documents/:id` (ADMIN/ANALYST)
- [x] `GET /documents/progress` (resumen ejecutivo por fuente)

**Entregable:** documento normalizado y deduplicado. Detalle: [document-processing.md](./document-processing.md).

---

## Sprint 7 — Clasificación y semáforo

- [x] Cliente OpenAI reutilizable (errores, límites, usage en `aiMeta`)
- [x] Clasificación, relevancia vs perfil Arca, semáforo 4 niveles + justificación
- [x] `GET /findings`, `GET /findings/:id`, `POST /documents/:id/classify` (ADMIN)
- [x] Cola `document.classify` al pasar a `READY_FOR_AI` (canónicos; no `DEDUPED`)

**Entregable:** findings con impacto GREEN/YELLOW/ORANGE/RED. UI: [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md). Sin email/inbox (S8).

---

## Sprint 8 — Borrador, inbox y email

- Borrador ejecutivo, folio, versiones, traza prompt/response
- Inbox humano: avanzar / feedback / descartar
- Resend solo tras aprobación humana

**Entregable:** ciclo piloto cerrado con humano en el loop.

---

## MVP — Conectores YouTube / X / Facebook (obligatorio)

No es un “nice to have” ni un sprint 9 inventado: el contrato del piloto incluye fuentes `SOCIAL` y `YOUTUBE`. S5 solo cubrió **HTTP WEB**.

- **Cuándo:** después de S7 (hace falta texto clasificable). No mezclarlo con el spider de congresos.
- **Qué:** conectores de plataforma (API/RSS/transcripto), no seguir links de redes desde un `.gob.mx`.
- **Corte mínimo:** mañanera (YouTube o estenográfica WEB) + una cuenta X oficial. Catálogo ya existe; activar al tener conector.
- Producto: [PRODUCT.md](./PRODUCT.md) § Conectores social / multimedia.

---

## Dependencias (no saltar)

```text
Auth JWT / tenant (S2)
  → CRUD admin API (S3 backend) → pantallas admin (S3 front)
  → Hardening (S4)
  → Colas + conectores (S5)
  → Documentos (S6)
  → IA (S7)
  → Conectores YouTube/X (MVP contrato)
  → Inbox + email (S8)
```

## Regla de priorización

No integrar infraestructura “porque está en el cronograma” si aún no hay consumidor.  
Ejemplo: Redis sin jobs, OpenAI sin documentos, Resend sin aprobación humana.
