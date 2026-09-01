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
| `CRAWL_MAX_PAGES` | No | `80` (máx. 80). Páginas HTML/PDF del mismo sitio por job, no solo la portada. |

Redis local:

```bash
# API + Redis juntos (Postgres sigue en Supabase): ver docker.md
docker compose up --build

# Solo Redis, Nest en el host
docker run --rm -p 6379:6379 redis:7-alpine

# Windows sin Docker
redis-server --bind 127.0.0.1 --port 6379
```

```env
REDIS_URL=redis://127.0.0.1:6379
```

Con `docker compose`, no uses esa URL dentro del contenedor: Compose pisa `REDIS_URL=redis://redis:6379`. Detalle: [docker.md](./docker.md).

En **Render**: no uses Docker. Crea **New → Key Value** (misma región), copia la **Internal URL** y pégala como `REDIS_URL` en el Web Service. Paso a paso: [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) (Redis en Render) y [render-deploy.md](./render-deploy.md).

Sin Redis la API arranca igual. `GET /jobs/status` indica `{ configured, redis, worker, scheduler }`.

Storage: si hay `SUPABASE_*`, el crudo va al bucket; si no, a `data/crawl/` (gitignored).

## Scheduler

Lee fuentes `ACTIVE` cada minuto. Encola si el día (ISO 1=lunes…7=domingo) está en `scheduleWeekdays` y la hora local (`scheduleTimezone`) ya alcanzó `scheduleTime`. Idempotencia: `{sourceCode}:{YYYY-MM-DD}:scheduled`. `INACTIVE` se ignora.

## Alcance del crawl (no solo la portada)

Cada job parte de `Source.url` y **sigue links del mismo host** (con o sin `www`). Prioriza materia legislativa (`gaceta`, iniciativas, decretos, dictámenes, `nota_detalle`, debates, PDFs). No recorre redes sociales, login, assets, transmisiones en vivo ni portales de transparencia masivos. Si la portada es un HTML corto con `meta refresh`, no guarda esa página trampolín: sigue el destino en el **mismo host** (Coahuila `/coahuila/`) o un **subdominio del mismo `*.gob.mx`** (Chiapas `www` → `web`). El resto de links del crawl sigue siendo solo el mismo host. Un refresh a Facebook u otro congreso no se sigue.

Tope: profundidad 2 y `CRAWL_MAX_PAGES` (default 80). Cada página/PDF/Word se guarda como documento propio y entra a extract. Los `.pdf` y `.doc`/`.docx` de un listado (orden del día, gaceta, DOF `nota_to_doc`) se encolan con prioridad sobre el menú HTML. `meta.json` del job se descarta del pipeline.

No es un spider de todo el sitio: si hace falta otra sección, súbela al `url` de la fuente o a `sections` (se usan como pistas de ranking).

## Conectores piloto (ACTIVE en seed)

| `Source.code` | Origen |
|---------------|--------|
| `dof` | DOF |
| `diputados-gaceta` | Gaceta Diputados |
| `jalisco-congreso` | Congreso de Jalisco |
| `congreso-agu` | Congreso de Aguascalientes |
| `congreso-bcn` | Congreso de Baja California |
| `congreso-bcs` | Congreso de Baja California Sur |
| `congreso-cam` | Congreso de Campeche |
| `congreso-chh` | Congreso de Chihuahua |

Otras `ACTIVE` con URL usan el mismo crawl HTTP genérico. Errores se loguean con `sourceId` / `sourceCode` y `errorCode` (`NETWORK` retryable; `PARSE`/`AUTH` no). Si una página interna falla, el job sigue con las demás; si falla la URL de arranque, el job falla.

Familias de fallo (no se repara URL a URL ni con LLM):

- **PDF en endpoint de descarga** (`/Home/Download?filename=….pdf`, `octet-stream`): se detecta por magic bytes `%PDF`, query o `Content-Disposition`; se guarda y extrae como PDF (`unpdf`), no como HTML.
- **Word (`.doc` / `.docx`)**: p. ej. DOF `nota_to_doc.php` (`application/msword`, magic OLE `d0cf11e0`). Se guarda y extrae como Word, no como HTML.
- **PDF escaneado:** el crawl guarda el archivo; extract falla a propósito con “PDF escaneado” (imagen, sin capa de texto). No es un bug de rastreo; OCR no está en este sprint.
- **Portada con meta refresh:** no se guarda el HTML trampolín. Sigue el destino en el mismo host o un subdominio del mismo `*.gob.mx`. No hay que editar URL a URL.
- **XML:** entra a extract (mismo strip de tags).
- **TLS de sitios de gobierno:** un reintento con verificación de certificado relajada (solo esa URL; log `crawl TLS laxo`). Redes sociales, players en vivo (`/transmision-en-vivo`, YouTube, `.mp4`) y portales de transparencia masivos siguen fuera del crawl HTTP. Un tema WordPress con CSS de recaptcha no se marca como captcha si hay texto/PDF visible.

Si un crawl falla con **Respuesta demasiado grande**, el body crudo superó `CRAWL_MAX_BYTES`. Sube el tope en `.env`. Tras cambiar el tope, vuelve a **Rastrear ahora** (ADMIN): el scheduler no reintenta `FAILED` el mismo día.

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

Filas de `job_runs` (historial técnico: intentos, `idempotencyKey`, paths).

### `GET /jobs/progress?date=YYYY-MM-DD`

Resumen ejecutivo: **una fila por fuente**, último crawl del día civil (`America/Mexico_City`). Copy en español (`label` / `note`). No duplica admin+scheduler en la UI. Contrato para el front: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

`GET /jobs/runs` no cambia; sigue para Swagger/ops.

## Paths

```text
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/doc-00-{hash}.html
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/doc-01-{hash}.pdf
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/meta.json
```

## Vaciar rastreo de prueba (local)

Borra documentos de crawl y `job_runs` (no toca fuentes ni usuarios). También vacía `data/crawl/` y las colas Redis.

```bash
pnpm exec tsx prisma/reset-crawl.ts
```

Luego **Rastrear ahora** / **Rastrear todas** (ADMIN). Sin esto, un crawl `SUCCESS` del mismo día no se vuelve a encolar.

## Qué no hace S5

Extract/normalize/dedup es Sprint 6: [document-processing.md](./document-processing.md). Tampoco clasificación OpenAI (S7), email/WhatsApp, ni scrapers de fuentes `INACTIVE`.

**Redes y multimedia sí son del MVP**, pero **no de este spider.** YouTube / X / Facebook van como conectores de plataforma después de S7: [PRODUCT.md](./PRODUCT.md) § Conectores social / multimedia. El HTTP no sigue `/transmision-en-vivo` ni timelines.
