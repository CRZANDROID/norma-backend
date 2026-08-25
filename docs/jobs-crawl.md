# Crawl de fuentes (Sprint 5)

Jobs `source.crawl`: Redis + BullMQ + worker en el mismo proceso Nest. Traen **HTML/PDF crudo**; no extraen, no clasifican, no crean findings.

Contrato: [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md).

## Env

| Variable | Obligatorio | Default |
|----------|-------------|---------|
| `REDIS_URL` | Para encolar | vacío → `POST /jobs/crawl` 503 |
| `JOBS_WORKER` | No | arranca worker salvo `false` |
| `JOBS_SCHEDULER` | No | cron cada minuto salvo `false` (en `NODE_ENV=test` queda off) |
| `JOBS_CONCURRENCY` | No | `2` |

Redis local:

```bash
# Docker
docker run --rm -p 6379:6379 redis:7-alpine

# Windows sin Docker
redis-server --bind 127.0.0.1 --port 6379
```

```env
REDIS_URL=redis://127.0.0.1:6379
```

En **Render**: no uses Docker. Crea **New → Key Value** (misma región), copia la **Internal URL** y pégala como `REDIS_URL` en el Web Service. Paso a paso: [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) (Redis en Render) y [render-deploy.md](./render-deploy.md).

Sin Redis la API arranca igual. `GET /jobs/status` indica `{ configured, redis, worker, scheduler }`.

Storage: si hay `SUPABASE_*`, el crudo va al bucket; si no, a `data/crawl/` (gitignored).

## Scheduler

Lee fuentes `ACTIVE` cada minuto. Encola si el día (ISO 1=lunes…7=domingo) está en `scheduleWeekdays` y la hora local (`scheduleTimezone`) ya alcanzó `scheduleTime`. Idempotencia: `{sourceCode}:{YYYY-MM-DD}:scheduled`. `INACTIVE` se ignora.

## Conectores piloto

| `Source.code` | Origen |
|---------------|--------|
| `dof` | DOF |
| `diputados-gaceta` | Gaceta Diputados |
| `jalisco-congreso` | Congreso de Jalisco |

Otras `ACTIVE` con URL usan el conector HTTP genérico (GET de `Source.url`). Errores se loguean con `sourceId` / `sourceCode` y `errorCode` (`NETWORK` retryable; `PARSE`/`AUTH` no).

## API

Auth: Bearer JWT. Trigger: solo `ADMIN`.

### `GET /jobs/status`

```json
{
  "configured": false,
  "redis": "disabled",
  "worker": false,
  "scheduler": false,
  "queue": "source.crawl",
  "storage": "local-fallback",
  "connectors": [{ "code": "dof", "label": "DOF" }]
}
```

### `POST /jobs/crawl`

```json
{ "sourceCode": "dof" }
```

o `{ "sourceId": "..." }`. Clave del día: `{code}:{fecha}:admin`. Reintentos BullMQ: 3, backoff exponencial.

Si un crawl **falla**, el job se queda en Redis como failed. **Rastrear todas** (admin) borra ese job y vuelve a encolar; el scheduler **no** reintenta FAILED el mismo día (evita pegarle al origen cada minuto). Un `QUEUED` huérfano (Redis ya no tiene el job waiting) también se reencola.

### `POST /jobs/crawl/all`

Encola todas las `ACTIVE`.

### `GET /jobs/runs?sourceCode=dof&limit=20`

Filas de `job_runs`.

## Paths

```text
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/page.html
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/meta.json
```

## Qué no hace S5

Extract/normalize/dedup es Sprint 6: [document-processing.md](./document-processing.md). Tampoco clasificación OpenAI (S7), email/WhatsApp, ni scrapers de fuentes `INACTIVE`.
