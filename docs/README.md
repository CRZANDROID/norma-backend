# Docs NORMA — Backend

Índice corto. Los contratos de API y de UI viven **aquí**. El frontend no debe copiarlos.

## Qué leer (en este orden)

| Orden | Doc | Para qué |
|-------|-----|----------|
| 1 | [HANDOFF.md](./HANDOFF.md) | Estado vivo y siguiente paso |
| 2 | [PRODUCT.md](./PRODUCT.md) | Qué es el producto y qué queda fuera |
| 3 | [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, JWT Nest, multi-tenant |
| 4 | [SPRINTS.md](./SPRINTS.md) | Piloto S1–S8 (1 semana = 1 sprint de este plan) |

## Contratos de UI (el front lee estos)

- [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) — jurisdicción + `schedule` (ya no `frequency`)
- [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md) — cliente ↔ fuentes + crawl
- [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)
- [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) — semáforo/canales (**config**; no es la lista de hallazgos)
- [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md)
- [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) — panel `/jobs/progress` + `/documents/progress` + `/findings/progress`
- [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md) — `GET /findings` (array; no inbox; no `/alertas`)

## Pipeline (S5–S6)

- [jobs-crawl.md](./jobs-crawl.md) — HTTP WEB (no redes). YouTube/X = MVP aparte: [PRODUCT.md](./PRODUCT.md)
- [document-processing.md](./document-processing.md)
- [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md)
- [openai-catalog.md](./openai-catalog.md) — catálogo; no clasifica (S7 = findings)

## Ops / pruebas

- [postman-pruebas.md](./postman-pruebas.md) — guía de endpoints (también Swagger `/docs`)
- [seed-and-tests.md](./seed-and-tests.md)
- [state-congresses.md](./state-congresses.md)
- [render-deploy.md](./render-deploy.md)
- [docker.md](./docker.md) — **local canónico:** Compose (API + Redis); Postgres en Supabase
- [sentry-storage.md](./sentry-storage.md)
- [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) — `.env` + Redis; snapshot 2026-08-18 (S6 ya está en HANDOFF)

## Histórico (no usar como contrato actual)

- [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md) — brief S3; ejemplos con `frequency` **obsoletos**
- [client-sources.md](./client-sources.md) — nota corta N:N; el contrato UI es FRONTEND-CLIENT-SOURCES
- [data/README-fuentes-piloto.md](./data/README-fuentes-piloto.md) — el camino real es `pnpm prisma:seed`
