# NORMA — Sprints (piloto semanal)

Plan del GitHub Project **NORMA — Piloto Arca**. Cada semana = un sprint.  
Piloto inicial: Arca Continental + pocas fuentes representativas.

## Estado alto nivel

| Sprint | Nombre | Enfoque | Estado típico |
|--------|--------|---------|---------------|
| 1 | Fundaciones | Repos, Nest/React, Prisma, health, tablero | Hecho |
| 2 | Identidad | Auth JWT propia, guards, schema admin, `/auth/me`, login | Hecho |
| 3 | CRUD admin | Clients, profiles, sources, users + pantallas | **Backend hecho**; front pendiente |
| 4 | Estabilización | Swagger, validación, e2e, Sentry, Storage, contratos jobs | **Docs/código listos**; falta verify manual #13 |
| 5 | Ingesta | Redis/BullMQ + conectores piloto | Pendiente |
| 6 | Documentos | Registro, storage, extract/normalize/dedup | Pendiente |
| 7 | IA | OpenAI client, clasificación, relevancia, semáforo | Pendiente |
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

Issue frontend (pendiente):

- `S3: Admin screens connected to real API` (Frontend, P0)

**Entregable backend:** API admin real (clients, profiles, sources, users) con AuthZ.  
**Extensión (API hecha):** vínculo N:N cliente↔fuentes — [client-sources.md](./client-sources.md), UI: [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md).  
**Entregable sprint completo:** panel admin con datos reales — front; falta UI de selección de fuentes.

Detalle backend: [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md)  
Pruebas: [postman-pruebas.md](./postman-pruebas.md)  
**Continuidad agentes:** [HANDOFF.md](./HANDOFF.md)

---

## Sprint 4 — Estabilización e infraestructura ligera

- [x] Swagger/OpenAPI en `/docs` + ValidationPipe
- [x] Índices, seed documentado, tests auth/permisos/CRUD smoke (`pnpm test:e2e`)
- [~] Sentry + Storage (código listo; checklist manual en [sentry-storage.md](./sentry-storage.md))
- [x] Contratos de documentos / jobs de ingesta — [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md)

**Entregable:** plataforma admin estable lista para ingesta.  
Estado vivo: [HANDOFF.md](./HANDOFF.md).

---

## Sprint 5 — Motor de ingesta piloto

- Redis + BullMQ (workers, retries, scheduler)
- Conectores: DOF, Diputados, un congreso estatal

**Entregable:** jobs que traen resultados crudos por fuente.

---

## Sprint 6 — Registro documental

- Documentos inmutables + originales en Storage + estados
- Extracción HTML/PDF, normalización, hash, dedup

**Entregable:** documento normalizado y deduplicado.

---

## Sprint 7 — Clasificación y semáforo

- Cliente OpenAI reutilizable (errores, límites, usage log)
- Clasificación, relevancia vs perfil Arca, semáforo 4 niveles + justificación

**Entregable:** findings con impacto GREEN/YELLOW/ORANGE/RED.

---

## Sprint 8 — Borrador, inbox y email

- Borrador ejecutivo, folio, versiones, traza prompt/response
- Inbox humano: avanzar / feedback / descartar
- Resend solo tras aprobación humana

**Entregable:** ciclo piloto cerrado con humano en el loop.

---

## Dependencias (no saltar)

```text
Auth JWT / tenant (S2)
  → CRUD admin API (S3 backend) → pantallas admin (S3 front)
  → Hardening (S4)
  → Colas + conectores (S5)
  → Documentos (S6)
  → IA (S7)
  → Inbox + email (S8)
```

## Regla de priorización

No integrar infraestructura “porque está en el cronograma” si aún no hay consumidor.  
Ejemplo: Redis sin jobs, OpenAI sin documentos, Resend sin aprobación humana.
