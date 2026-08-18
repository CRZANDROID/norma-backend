# NORMA — Producto

## Qué es

NORMA es una plataforma de **monitoreo regulatorio** para detectar, clasificar y priorizar cambios normativos relevantes para un cliente, con validación humana antes de cualquier envío ejecutivo.

Cliente piloto: **Arca Continental** (VCGA / asuntos regulatorios). Si el piloto funciona, se escala a más clientes.

## Problema que resuelve

Equipos regulatorios revisan manualmente muchas fuentes (DOF, congresos, autoridades, medios). Es lento, inconsistente y difícil de auditar. NORMA automatiza recolección y análisis, y deja la decisión final a un humano.

## Alcance del piloto (qué SÍ)

- Backoffice autenticado (NestJS: email/password + JWT propio)
- Multi-tenant por **cliente** (Arca primero), con datos fiscales y contactos de soporte
- Catálogo de **fuentes** con entidad federativa: federales (DOF, Diputados) + 32 congresos locales en catálogo (piloto crawlea Jalisco)
- **Perfil regulatorio** del cliente (keywords, categorías, portafolio)
- Config de **semáforo y canales** por cliente (acciones por nivel; correo por defecto; WhatsApp como opción, sin envío)
- **Asistente de catálogo** (`POST /ai/ask`): el modelo responde sobre clientes, perfiles y fuentes ya registrados
- **Crawl piloto** de fuentes `ACTIVE` (DOF, Diputados, Jalisco) a crudo (`POST /jobs/crawl`)
- Más adelante: normalización, deduplicación, clasificación, borrador ejecutivo, inbox de validación humana, email solo tras aprobación

## Fuera de alcance (por ahora)

- Microservicios
- Fastify (se mantiene Express en NestJS)
- Supabase Auth / identidad externalizada (Postgres en Supabase sí; auth es de Nest)
- Consultas de negocio desde el frontend directo a tablas Supabase
- Clasificar normas con OpenAI (Sprint 7) ni Resend “por checklist”
- 32 scrapers distintos el día uno (el catálogo sí existe; el crawl piloto es 2–3 fuentes)

## Actores

| Actor | Rol en producto |
|-------|-----------------|
| `ADMIN` | Backoffice VCGA: catálogo, usuarios, clientes |
| `ANALYST` | Operación diaria: perfiles, revisión de hallazgos |
| `VIEWER` | Solo lectura |
| `CLIENT_USER` | Usuario del cliente (piloto: acceso restringido a su tenant) |

## Principios de producto

1. **Humano en el loop:** nada ejecutivo se envía sin aprobación.
2. **Auditoría:** estados, versiones y trazas importan más que borrar datos.
3. **Soft-status:** `ACTIVE` / `INACTIVE` en lugar de hard-delete.
4. **Piloto estrecho, arquitectura multi-cliente:** modelar bien el tenant desde el inicio.

## Repos

| Repo | Rol |
|------|-----|
| `norma-backend` | API NestJS + Prisma + PostgreSQL |
| `norma-frontend` | SPA React (Vite) |

Tablero: GitHub Project **NORMA — Piloto Arca**.

## Documentación relacionada

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack y reglas técnicas
- [SPRINTS.md](./SPRINTS.md) — plan semanal
- [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md) — brief CRUD admin (backend)
- [postman-pruebas.md](./postman-pruebas.md) — guía de pruebas de endpoints
- [seed-and-tests.md](./seed-and-tests.md) — seed + e2e + Swagger `/docs`
- [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) — state machine docs + jobs S5
- [HANDOFF.md](./HANDOFF.md) — estado actual y siguientes pasos (agentes)
- [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) — contrato UI client↔fuentes
- [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md) — fiscales + contactos
- [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) — canales y semáforo (config)
- [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) — jurisdicción + disparador
- [state-congresses.md](./state-congresses.md) — catálogo 32 entidades
- [openai-catalog.md](./openai-catalog.md) — `POST /ai/ask`
- [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md) — contrato UI del asistente
