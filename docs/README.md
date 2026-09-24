# Docs NORMA — Backend

Índice corto. Los contratos de API y de UI viven **aquí**. El frontend no debe copiarlos.  
HTTP vivo: Swagger `http://localhost:3000/docs`.

## Flujo

```text
Crawl → extraer → clasificar (S7, hecho)
  → /alertas: VCGA edita / IA / excluye (S8)
  → clic «Generar PDF» (S9; siempre un humano)
       PDF = amarillo + naranja + rojo no enviados (verde nunca)
       autoSend → ese clic también envía; si no, confirmar
  → correo a contactos
  → portal del cliente (S10): el caso es el PDF entero
```

## Qué leer

| Orden | Doc | Para qué |
|-------|-----|----------|
| 1 | [HANDOFF.md](./HANDOFF.md) | Estado vivo y siguiente paso |
| — | [DECISIONES-PRUEBA.md](./DECISIONES-PRUEBA.md) | Bitácora de pruebas: qué se queda |
| 2 | [TRAINING.md](./TRAINING.md) | Cómo llenar clientes y fuentes (capacitación). S9 envío sigue pendiente |
| 3 | [PRODUCT.md](./PRODUCT.md) | Qué es el producto y qué queda fuera |
| 4 | [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, JWT Nest, multi-tenant |
| 5 | [SPRINTS.md](./SPRINTS.md) | Piloto S1–S10 |
| 6 | [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) | `/alertas` + informe S8–S10 |

## Briefs para el front

- [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md) — fuentes, cliente↔fuentes, fiscales, delivery, `ai/ask`
- [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) — panel `/jobs/progress` + `/documents/progress` + `/findings/progress`
- [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md) — lista en `/alertas`; S8–S10 PDF y portal

## Pipeline y ops

- [jobs.md](./jobs.md) — crawl HTTP + extract/normalize/classify
- [PERFORMANCE.md](./PERFORMANCE.md) — laboratorio de colas / health
- [docker.md](./docker.md) — local canónico (`api` HTTP + `worker` + Redis)
- [seed-and-tests.md](./seed-and-tests.md)
- [TRAINING.md](./TRAINING.md)
- [sentry-storage.md](./sentry-storage.md)
- [render-deploy.md](./render-deploy.md) — Web Service (HTTP)
- [worker-vps.md](./worker-vps.md) — worker en Hetzner el mes que viene; este mes API y worker siguen en Render
