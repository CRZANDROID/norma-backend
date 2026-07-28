# NORMA — Sprints (piloto semanal)

Plan del GitHub Project **NORMA — Piloto Arca**. Cada semana = un sprint.  
Piloto inicial: Arca Continental + pocas fuentes representativas.

## Estado alto nivel

| Sprint | Nombre | Enfoque | Estado típico |
|--------|--------|---------|---------------|
| 1 | Fundaciones | Repos, Nest/React, Prisma, health, tablero | Hecho |
| 2 | Identidad | Supabase Auth, guards, schema admin, `/auth/me`, login | Hecho |
| 3 | CRUD admin | Clients, profiles, sources, users + pantallas | **Actual** |
| 4 | Estabilización | Swagger, validación, errores, seed/tests, Sentry, Storage | Pendiente |
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

- Schema: users (`authUserId`), clients, memberships, profiles, sources, findings
- Nest: validar JWT Supabase, sync user, guards, roles, `GET /auth/me`
- Front: login Supabase, rutas protegidas, Bearer en Axios
- Seed Arca + fuentes piloto

**Entregable:** usuario autenticado con perfil NORMA.

---

## Sprint 3 — CRUD administrativo vertical

Issues:

- `S3: CRUD Clients + regulatory profiles API` (P0)
- `S3: CRUD Sources + activate/deactivate` (P0)
- `S3: Basic user admin and role assignment` (P1)
- `S3: Admin screens connected to real API` (Frontend, P0)

**Entregable:** panel admin con datos reales (no mocks).

Detalle backend: [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md)

---

## Sprint 4 — Estabilización e infraestructura ligera

- Swagger/OpenAPI, ValidationPipe, exception filter, logging
- Índices, seed documentado, tests auth/permisos/CRUD smoke
- Sentry + prueba mínima Supabase Storage
- Contratos de documentos / jobs de ingesta (doc)

**Entregable:** plataforma admin estable lista para ingesta.

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
Auth/tenant (S2)
  → CRUD admin (S3)
  → Hardening (S4)
  → Colas + conectores (S5)
  → Documentos (S6)
  → IA (S7)
  → Inbox + email (S8)
```

## Regla de priorización

No integrar infraestructura “porque está en el cronograma” si aún no hay consumidor.  
Ejemplo: Redis sin jobs, OpenAI sin documentos, Resend sin aprobación humana.
