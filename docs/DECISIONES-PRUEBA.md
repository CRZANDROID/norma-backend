# Decisiones de la pausa de pruebas

Bitácora de lo que entró en `main` entre el 17 y el 23 sep 2026, después del PDF de S9, y no estaba en el tablero S1–S10.

Línea base bajo prueba:

| Repo | Commit |
|------|--------|
| norma-backend | `7f6ea43` (2026-09-23) |
| norma-frontend | `312ae3a` (2026-09-22) |

**¿Lo pidió el cliente?** No consta en ningún PR. Queda así salvo que Josue lo marque después.

**¿Se queda?** Solo está cerrado donde hubo decisión explícita. El resto sigue en prueba.

El PDF, `/informes` y el loop de `/alertas` no están en esta tabla: son S8–S9. Fiscales, contactos, entidad y el disparador de las 07:00 (agosto) tampoco: ya viven en [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md) y [PRODUCT.md](./PRODUCT.md).

| # | Qué cambió | Dónde | PR | ¿Lo pidió el cliente? | ¿Se queda? | Dónde está descrito |
|---|------------|-------|----|------------------------|------------|---------------------|
| 1 | API HTTP separada del worker BullMQ, tope de crawls en paralelo | backend | #38 | no consta | sin decidir | [docker.md](./docker.md), [PERFORMANCE.md](./PERFORMANCE.md), [jobs.md](./jobs.md) |
| 2 | El lock de extract/classify no muere a los 30 s | backend | #39 | no consta | sin decidir | [jobs.md](./jobs.md), [HANDOFF.md](./HANDOFF.md) |
| 3 | Un crawl atascado cierra la fila del tablero | backend | #40 | no consta | sin decidir | [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md), [jobs.md](./jobs.md) |
| 4 | Más volumen de gaceta para pruebas reales; PDF fuera del event loop | backend | #41 | no consta | sin decidir | [jobs.md](./jobs.md), [HANDOFF.md](./HANDOFF.md) |
| 5 | HUD: Rastrear / Extraer / Analizar, y no volver a crawlear si hoy ya hubo SUCCESS | backend + front | #42 y #22 | no consta | Los tres botones se quedan: el operador los quiere en el piloto. El salto de mismo día: sin decidir | [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md). El front no tiene doc propio |
| 6 | La pastilla Incluidos no se recorta con fecha, estado, fuente ni semáforo | backend | #43 | no consta | sin decidir | [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md), [HANDOFF.md](./HANDOFF.md) |
| 7 | El crawl se queda en publicaciones de 2026 en adelante (`CRAWL_MIN_YEAR`) | backend | #44, #46 | no consta | Sí. Regla del piloto, permanente | [jobs.md](./jobs.md), [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md) |
| 8 | Arreglo de build: filename al encolar classify | backend | #45 | no consta | sin decidir | solo el commit |
| 9a | Cookie de sesión (portadas tipo Senado) y `gob.mx` no sale del path de la fuente | backend | #46 | no consta | sin decidir | [jobs.md](./jobs.md) |
| 9b | Cron de las 07:00 | backend | #46 | no consta | Apagado solo hasta que el cliente recargue créditos de OpenAI; después queda encendido. No es un apagado permanente | [jobs.md](./jobs.md), [render-deploy.md](./render-deploy.md) |
| 9c | Worker en Hetzner | backend | #46 | no consta | Este mes no. API y worker siguen los dos en Render. El mes que viene el worker pasa a Hetzner por capacidad | [worker-vps.md](./worker-vps.md), [render-deploy.md](./render-deploy.md) |
| 10 | Brillo «pensando» y botones por etapa en el tablero; `.env.development` pasó de puerto 3001 a 3000 | front | #22 | no consta | El brillo se queda, junto con los tres botones. El cambio de puerto: sin decidir | no hay doc de front |

Índice: [README.md](./README.md). Backlog que sigue abierto: [SPRINTS.md](./SPRINTS.md) (resto de S9, S10, conectores después de S10).
