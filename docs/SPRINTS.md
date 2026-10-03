# NORMA — Sprints (piloto)

Plan del GitHub Project **NORMA — Piloto Arca**.  
El piloto son **10 iteraciones semanales** (S1–S10): cada “Sprint N” = **una semana** de ese plan, no un sprint de 4 semanas.

Piloto inicial: Arca Continental + pocas fuentes representativas.

Flujo de informe (S8–S10): [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

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
| 8 | Loop VCGA | Editar / IA / descartar hallazgos en `/alertas` | **Hecho** |
| 9 | Informe y envío | PDF + confirmar o auto-enviar a contactos | En curso (`lote` + `/informes`; envío pendiente) |
| 10 | Portal cliente | Historial de informes; caso = el PDF | Pendiente |

Fechas de iteración en el Project (aprox.): Sprint 1 desde 2026-07-06, duración 7 días c/u.

## Durante las pruebas

Bitácora: [DECISIONES-PRUEBA.md](./DECISIONES-PRUEBA.md). Código bajo prueba: backend `7f6ea43`, front `312ae3a`.

Se quedan en el piloto: el piso `CRAWL_MIN_YEAR` 2026, y el HUD de tres botones (Rastrear / Extraer / Analizar) con el brillo de «pensando».

El cron de las 07:00 está apagado solo hasta que el cliente recargue créditos de OpenAI; después queda encendido. Este mes la API y el worker siguen los dos en Render; el mes que viene el worker pasa a Hetzner. El resto de la bitácora no tiene veredicto.

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
**Extensión (API hecha):** vínculo N:N cliente↔fuentes — [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md).  
**Continuidad:** [HANDOFF.md](./HANDOFF.md). HTTP: Swagger `/docs`.

---

## Sprint 4 — Estabilización e infraestructura ligera

- [x] Swagger/OpenAPI en `/docs` + ValidationPipe
- [x] Índices, seed documentado, tests auth/permisos/CRUD smoke (`pnpm test:e2e`)
- [x] Sentry + Storage (verificado en local; [sentry-storage.md](./sentry-storage.md))
- [x] Contratos de documentos / jobs de ingesta — [jobs.md](./jobs.md)

**Entregable:** plataforma admin estable lista para ingesta.  
Estado vivo: [HANDOFF.md](./HANDOFF.md).

---

**Pre-S5 (modelo, hecho):** entidad federativa + disparador, 32 congresos, delivery. ACTIVE de crawl: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md) § Fuentes.

**Bloque 1 (hecho):** asistente de catálogo `POST /ai/ask` — [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md). No es clasificación S7.

## Sprint 5 — Motor de ingesta piloto

- [x] Redis + BullMQ (workers, retries, scheduler)
- [x] Conectores HTTP: DOF, Diputados y congresos ACTIVE (mismo sitio, no solo portada)
- [x] Tabla `job_runs` + `POST /jobs/crawl`
- [x] `GET /jobs/progress` (resumen ejecutivo por fuente)

**Entregable:** jobs que traen resultados crudos por fuente. Detalle: [jobs.md](./jobs.md).

---

## Sprint 6 — Registro documental

- [x] Documentos inmutables + originales en Storage + estados de pipeline
- [x] Extracción HTML/PDF, normalización, hash, dedup
- [x] `GET /documents` y `GET /documents/:id` (ADMIN/ANALYST)
- [x] `GET /documents/progress` (resumen ejecutivo por fuente)

**Entregable:** documento normalizado y deduplicado. Detalle: [jobs.md](./jobs.md).

---

## Sprint 7 — Clasificación y semáforo

- [x] Cliente OpenAI reutilizable (errores, límites, usage en `aiMeta`)
- [x] Clasificación, relevancia vs perfil Arca, semáforo 4 niveles + justificación
- [x] `GET /findings`, `GET /findings/:id`, `POST /documents/:id/classify` (ADMIN)
- [x] Cola `document.classify` al pasar a `READY_FOR_AI` (canónicos; no `DEDUPED`)

**Entregable:** findings con impacto GREEN/YELLOW/ORANGE/RED. UI: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) (`/alertas`).

---

## Sprint 8 — Loop de VCGA (lista de hallazgos)

La mesa de validación **es** `/alertas` (no un inbox nuevo).

- [x] Editar hallazgo a mano (título / justificación)
- [x] Reescribir con OpenAI: prompt libre, **solo** el texto del documento
- [x] Excluir hallazgo de **este** PDF (puede volver en el siguiente)
- [x] Candidatos que sugiere el agente: `YELLOW` / `ORANGE` / `RED` no enviados. `GREEN` no entra al informe

**No** generar PDF ni enviar correo en S8.  
Contrato: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

**Entregable:** VCGA arma el lote en Clasificación.

---

## Sprint 9 — Informe PDF y envío

- [x] **D1** `POST /reports` (humano VCGA vía API). 409 si el día sigue `classifying`. Lote Y/O/R no excluidos ni en un `sent`
- [x] Render PDF + `GET /reports/:id/file` (ver / descargar)
- [x] Regenerar mientras el informe no esté enviado
- [x] Front `/alertas`: Generar PDF + pastillas Incluidos / Excluidos / Enviados
- [x] Front `/informes`: lista VCGA (borradores / enviados); Ver / Descargar / Regenerar
- [ ] `autoSend` por cliente: generar = enviar. Si no: confirmar envío
- [ ] Descartar el informe (los hallazgos vuelven a candidatos)
- [ ] Correo a los **contactos** del cliente
- [ ] Reabrir automático si crawl + hash distinto sobre una norma ya enviada

**Entregable de esta semana:** PDF draft descargable (sin correo). Entregable S9 completo: ciclo VCGA cerrado (validar → PDF → mail).  
Contrato: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

---

## Sprint 10 — Portal del cliente

El **caso es el PDF entero** (no un hallazgo suelto).

- [ ] Usuario `CLIENT_USER` (JWT Nest; solo su cliente)
- [ ] Historial de informes enviados
- [ ] Acciones sobre el informe: cerrar caso, pedir análisis de producto, pedir crisis a VCGA

**Entregable:** Arca ve y actúa sobre cada informe.  
Contrato: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

---

## MVP — Conectores YouTube / X / Facebook (obligatorio)

El contrato del piloto incluye fuentes `SOCIAL` y `YOUTUBE`. S5 solo cubrió **HTTP WEB**.

- **Cuándo:** **después de S10** (flujo de informe cerrado). No mezclarlo con S8–S10 ni con el spider de congresos.
- **Qué:** conectores de plataforma (API/RSS/transcripto), no seguir links de redes desde un `.gob.mx`.
- **Corte mínimo:** mañanera (YouTube o estenográfica WEB) + una cuenta X oficial. Catálogo ya existe; activar al tener conector.
- Producto: [PRODUCT.md](./PRODUCT.md) § Conectores social / multimedia.

---

## Dependencias (no saltar)

```text
Auth JWT / tenant (S2)
  → CRUD admin API (S3 backend) → pantallas admin (S3 front)
  → Hardening (S4)
  → Colas + crawl HTTP (S5)
  → Documentos (S6)
  → Clasificar (S7)
  → Loop VCGA en /alertas (S8)
  → PDF + envío (S9)
  → Portal cliente (S10)
  → Conectores YouTube/X (MVP contrato)
```

## Regla de priorización

No integrar infraestructura “porque está en el cronograma” si aún no hay consumidor.  
Ejemplo: Redis sin jobs, OpenAI sin documentos, correo sin PDF validado.
