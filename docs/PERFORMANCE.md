# Laboratorio de rendimiento

El personal carga el catálogo completo. NORMA **encola el pico** y drena a un ritmo seguro. No hay regla de “rastrear de a una” ni tope de 15 fuentes.

Soportar picos **no** es crawlear 200 sitios a la vez. Es: `POST /jobs/crawl/all` o el scheduler de las 07:00 encolan todo en segundos; solo `CRAWL_CONCURRENCY` crawls corren (default 2); extract/classify van detrás; `/health` y `/alertas` siguen respondiendo.

Medir → un cambio → volver a medir. No subir `JOBS_CONCURRENCY` a ciegas. Docker local primero ([docker.md](./docker.md): `api` sin workers + `worker`). S9 envío no entra.

Capacitación y este lab **comparten Supabase**. Al cerrar el día: `pnpm prisma:reset-training -- --yes` y `SEED_CATALOG=false`.

## Glosario

- **`GET /health` &lt; 1 s** — el panel se puede usar. 3–10 s o error = Nest HTTP saturado. Con el split, waiting alto **no** debe tumbar health.
- **`waiting`** — jobs en fila. **Alto es normal** tras un pico. Debe bajar a 0 mientras drena.
- **`active`** — corriendo ahora. Crawl: tope `CRAWL_CONCURRENCY` (default 2). Extract/normalize: `JOBS_CONCURRENCY`. Classify: `CLASSIFY_CONCURRENCY`.
- **`failed` / `stalled`** — se rompió, o BullMQ creyó que el job se colgó. Crawl: lock ~15 min. Extract/classify: lock ~10 min (`DOCUMENT_LOCK_MS`). Sin eso, OpenAI o un PDF enorme marcan `Missing lock` / stalled a los ~30 s aunque el hallazgo sí se haya guardado. En esta versión de BullMQ `stalled` no es un tipo de job: sale `0` en `/jobs/status`. Redis de colas: política **noeviction** (no `allkeys-lru`).

Termómetro: `GET /jobs/status` → `queues` (las 4 colas) + `consumers` + `worker` (true si hay consumidor de `source.crawl`, aunque el API tenga `JOBS_WORKER=false`). Sin Redis, cada cola es `null`. El sistema está sano si health &lt; 1 s y `queues["source.crawl"].active` ≤ `CRAWL_CONCURRENCY`.

## Preparación

```bash
docker compose up --build
```

En `.env` para las primeras corridas: `CRAWL_MAX_PAGES=10` (rebuild). Un run con default 80 solo cuando pasen las fases 1–3.

Fuentes `WEB` ACTIVE:

```bash
pnpm exec tsx prisma/perf-lab-setup.ts
```

| code | URL |
|------|-----|
| `perf-dof` | https://www.dof.gob.mx/ |
| `perf-diputados` | https://gaceta.diputados.gob.mx/ |
| `perf-jalisco` | https://www.congresojal.gob.mx/ |
| `perf-agu` | https://congresoags.gob.mx/ |
| `perf-bc` | https://www.congresobc.gob.mx/ |

Cliente `perf-lab` (slug `perf-lab`): **solo** al llegar a classify, vinculado a 1–2 de esas fuentes.

Poll cada ~10 s mientras hay crawl: tiempo de `GET /health`, `GET /jobs/status` (`queues`, `worker`, `consumers`), `GET /jobs/progress`. Anotar el peor health. `waiting` &gt; 0 durante el drenaje **no** es un error.

## Fases

1. **Una fuente** (`POST /jobs/crawl` `{ "sourceCode": "perf-dof" }`). Pasa: health &lt; 1 s, crawl SUCCESS, `waiting` de crawl a 0, extract/normalize drenan. Si `stalled` o el crawl se relanza → fase 2. Si health &gt; 1 s con una sola fuente: anotar y seguir.
2. **Lock del crawl** (hecho en el worker: `lockDuration` ~15 min). Repetir fase 1 solo si hubo stalled.
3. **Cinco fuentes** ACTIVE / `POST /jobs/crawl/all`. Pasa: health &lt; 1 s **mientras** `source.crawl.waiting` &gt; 0, colas bajan, progress sin 502. El API no debe consumir jobs (`JOBS_WORKER=false`). No subir concurrencia global. Repetir las 5.
4. **Classify:** vincular `perf-lab`. Mirar `document.classify` y 429 de OpenAI. Si 429: bajar solo `CLASSIFY_CONCURRENCY`. Lento con health ok ≠ saturación de Nest.
5. **Render (opcional):** mismas fases 1 y 3 **con Web Service + Background Worker**. Local ok + Render no = plan Free / RAM. Ambos mal = bug del proceso. Un solo Web Service con workers adentro no es el techo de producto.

## Cierre

```bash
pnpm prisma:reset-training -- --yes
```

## Registro (2026-09-17, Docker local)

Fase 1 `perf-dof`: crawl SUCCESS en ~59 s, attempt 1, origen parcial. Health máximo 1071 ms (un pico al arrancar extract/classify); el resto ~100 ms. Colas drenaron. Sin stalled ni reintento. **Fase 2 no aplica** (después se puso lock 15 min de todos modos).

Fase 3 cinco fuentes (API+workers **en el mismo proceso**, antes del split): 4 `crawled`, `perf-bc` `failed` (origen). Health máximo **293 ms**. `source.crawl` waiting 3 / active 2 y drenó.

Fase 4: cliente `perf-lab` ↔ `perf-dof` + `perf-diputados`. 8 canónicos re-clasificados, 8 findings, cola classify w=6 a=2 → 0, health ~100 ms, `failed=0`. Sin 429. `CLASSIFY_CONCURRENCY` existe por si aparece 429; no se bajó.

Fase 5 Render: no corrida (local pasó). Cierre: wipe ejecutado (solo ADMIN; catálogo vacío). `SEED_CATALOG=false`.

**Split API/worker (2026-09-17):** Compose `api` (`JOBS_WORKER=false`, health) + `worker` (`concurrency=2`, `lockMs=900000`, scheduler on). Cinco fuentes `perf-*` encoladas (`POST /jobs/crawl` × 5); el cron del worker sumó las claves `:scheduled` (pico `source.crawl` waiting 7 / active 2). Health **102–251 ms**, `healthFails=0`, `worker=true`, `crawlConsumers=1`. `/health` se mantuvo &lt; 1 s **mientras** `waiting` &gt; 0.

**Render extract/classify stalled (2026-09-18):** worker Starter 512 MB + lock default ~30 s → `could not renew lock` / `Missing lock` / `job stalled more than allowable limit`. El hallazgo a veces sí se guardó, pero **Postgres no se cerraba** (`job_runs` `RUNNING`, docs `RECEIVED`/`READY_FOR_AI`) y el panel giraba para siempre. Fix: `DOCUMENT_LOCK_MS` ~10 min; el `failed` del worker marca `FAILED` / cierra el crawl; al boot reencola huérfanos 48 h. unpdf en **worker thread** (`EXTRACT_PDF_TIMEOUT_MS` 3 min) para que un PDF de Congreso BC no stalee `perf-agu` ni el catálogo real. Redis: `noeviction`. RAM: Standard 2 GB si los PDF tiran el proceso.

## Después (cuando el drenaje sea el problema, no el HTTP)

- Réplicas de `worker` (más `active` totales = `CRAWL_CONCURRENCY` × réplicas).
- Tope por host (no martillar el mismo `.gob.mx`).
- Ventana de horario (no todas a las 07:00 exactas) si el origen rate-limita.
- Infra de prod con RAM de verdad; Render Free no es ese techo.

OpenAI y Storage siguen siendo límites de **cola**, no de clics: classify se atrasa, el panel no se cae.
