# Crawl de fuentes (Sprint 5)

Jobs `source.crawl`: Redis + BullMQ + worker en el mismo proceso Nest. Traen **HTML/PDF crudo**; no extraen, no clasifican, no crean findings.

Contrato: [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md).

## Env

| Variable | Obligatorio | Default |
|----------|-------------|---------|
| `REDIS_URL` | Para encolar | vacío → `POST /jobs/crawl` 503 |
| `JOBS_WORKER` | No | arranca worker salvo `false` |
| `JOBS_SCHEDULER` | No | En `development`/`test`: off salvo `true`. En prod: on salvo `false`. Cron cada minuto. |
| `JOBS_CONCURRENCY` | No | `2` |
| `CRAWL_MAX_BYTES` | No | `10000000` (10 MB). Homes de congresos a veces superan 2–3 MB. |

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

Otras `ACTIVE` con URL usan el conector HTTP genérico (GET de `Source.url`). Si la URL es un `frameset` / cáscara sin texto (p. ej. Gaceta Diputados: `gp_hoy.html`), el crawl sigue los frames **mismo host** y guarda el panel con más texto visible. Si HTTPS falla por cadena TLS incompleta (algunos `.gob.mx`, p. ej. BCS), se reintenta esa misma URL. Errores se loguean con `sourceId` / `sourceCode` y `errorCode` (`NETWORK` retryable; `PARSE`/`AUTH` no).

Si un crawl falla con **Respuesta demasiado grande**, el body crudo superó `CRAWL_MAX_BYTES`. Sube el tope en `.env` o apunta `Source.url` a una sección más liviana (gaceta / iniciativas), no solo la home. Tras cambiar el tope, vuelve a **Rastrear ahora** (ADMIN): el scheduler no reintenta `FAILED` el mismo día.

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

Si un crawl **falla**, el job se queda en Redis como failed. **Rastrear ahora / todas** (admin) reencola FAILED y también un SUCCESS del mismo día (p. ej. tras un arreglo de conector). El scheduler **no** reintenta FAILED ni SUCCESS el mismo día (evita pegarle al origen cada minuto). Un `QUEUED` huérfano (Redis ya no tiene el job waiting) también se reencola.

### `POST /jobs/crawl/all`

Encola todas las `ACTIVE`.

### `GET /jobs/runs?sourceCode=dof&limit=20`

Filas de `job_runs` (historial técnico: intentos, `idempotencyKey`, paths).

### `GET /jobs/progress?date=YYYY-MM-DD`

Resumen ejecutivo: **una fila por fuente**, último crawl del día civil (`America/Mexico_City`). Copy en español (`label` / `note`). No duplica admin+scheduler en la UI. Contrato para el front: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

`GET /jobs/runs` no cambia; sigue para Swagger/ops.

## Paths

```text
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/page.html
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/meta.json
```

## Qué no hace S5

Extract/normalize/dedup es Sprint 6: [document-processing.md](./document-processing.md). Tampoco clasificación OpenAI (S7), email/WhatsApp, ni scrapers de fuentes `INACTIVE`.
