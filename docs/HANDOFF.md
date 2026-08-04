# HANDOFF — Estado NORMA Backend (2026-08-04)

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
| 3 front | Fuera de este repo | Wire UI → [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) + [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) |
| 4 | **Hecho en código/verificado** | Sentry + Storage OK en local |
| 5+ | Pendiente | Implementar colas según [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |

**Rama típica:** `feature/client-fiscal-contacts` (ajustes de dominio cliente).
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
| Jobs/docs contracts | [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |
| Sentry/Storage | [sentry-storage.md](./sentry-storage.md) |
| Render | [render-deploy.md](./render-deploy.md) |

---

## 3. Qué ya está implementado (backend)

### Auth / CRUD / client↔sources / fiscales / contactos
Ver Postman. Migraciones relevantes: `client_sources`, `documents`, `client_fiscal_contacts`. Aplicar con `pnpm prisma:deploy` si falta.

- Fiscales 1:1: `fiscal` en create/PATCH client → respuesta `fiscalData` (`legalName`, `rfc`, `postalCode`, `cfdi`, `taxRegime`)
- Contactos: `contacts[]` en create/PATCH client (**replace** en PATCH); además rutas `/clients/:clientId/contacts` + `/contacts/:id`

### Sprint 4

| Issue | Estado |
|-------|--------|
| #11 Swagger + validation | **Hecho** — `/docs`, ValidationPipe |
| #12 Seed + indexes + e2e | **Hecho** — `pnpm test:e2e` (16 tests) |
| #13 Sentry + Storage | **Cerrado** — Sentry + upload/signed-url/download verificados en local |
| #14 Document/job contracts | **Hecho (doc)** — [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) |

### Módulos
```text
src/modules/{auth,clients,sources,users,storage}/
src/common/swagger.ts
test/*e2e-spec.ts
```

---

## 4. Qué falta (prioridad)

1. **No** implementar Redis/BullMQ hasta empezar S5 usando el contrato de jobs.
2. Frontend (otro repo): UI client↔sources + fiscales/contactos ([FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md), [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)).

---

## 5. Operación local

```bash
pnpm install
# Si ERR_PNPM_IGNORED_BUILDS: pnpm approve-builds --all && pnpm install
pnpm prisma:deploy && pnpm prisma:seed
pnpm start:dev
pnpm test:e2e
```

`.env`: `DATABASE_URL`, `JWT_SECRET`, `AUTH_SEED_*`; opcional `SENTRY_DSN`, `SUPABASE_*`.

---

## 6. Para el agente de FRONTEND

1. Fuentes: **[FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md)** (`sourceIds` / `clientIds`).
2. Fiscales + contactos: **[FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)**.

---

## 7. Issues GitHub (`norma-backend`)

| # | Título | Acción |
|---|--------|--------|
| 8–10 | S3 CRUD | CLOSED |
| 11 | Swagger/validation | Cerrar si confirman `/docs` + 400 |
| 12 | Seed/tests | Cerrar si `pnpm test:e2e` OK |
| 13 | Sentry+Storage | CLOSED — verificado local |
| 14 | Document contracts | Cerrar — doc entregada |
| 15–16 | S5 workers/connectors | Siguiente implementación |

---

## 8. Plantilla siguiente agente

> Lee `docs/HANDOFF.md`. S5 solo tras leer `DOCUMENT-JOB-CONTRACTS.md`. Front: `FRONTEND-CLIENT-SOURCES.md` + `FRONTEND-CLIENT-FISCAL-CONTACTS.md`.

**Última actualización:** 2026-08-04 — datos fiscales (CP, CFDI, régimen) + contactos de cliente.
