# Jobs — crawl, documentos y clasificación

Redis + BullMQ. **HTTP y workers son procesos distintos** (Compose `api` + `worker`; prod este mes: Web Service + Background Worker en Render). El mes que viene el worker pasa a Hetzner ([worker-vps.md](./worker-vps.md)). Local: [docker.md](./docker.md) (no Redis suelto en Windows).  
UI del panel: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md). Hallazgos: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md). El pico de catálogo se encola; [PERFORMANCE.md](./PERFORMANCE.md).

```text
crawl SUCCESS (HTML/PDF/Word del mismo sitio)
  → Document RECEIVED + document.extract
  → EXTRACTED (derived/{id}/extracted.txt)
  → document.normalize_dedup
  → NORMALIZED → HASHED
  → READY_FOR_AI  |  DEDUPED + canonicalDocumentId
  → document.classify (solo canónicos)
  → CLASSIFIED + Finding por cliente en client_sources
```

Crawl no extrae ni clasifica. Extract no es LLM. Informe PDF = S9.

Si extract/classify/crawl se quedan `stalled` (restart del worker, PDF que bloquea el event loop), BullMQ falla el job. El worker **actualiza Postgres**: `job_runs` deja de estar `RUNNING` y el documento pasa a `FAILED` si seguía a medias. Si no, el panel se queda en “Rastreando / Extrayendo / Analizando” aunque Redis ya no tenga trabajo. Al arrancar, el worker reencola documentos huérfanos de las últimas 48 h y cierra crawls abandonados. Logs: `crawl page N/M` y `extract start` (el crawl ya no calla hasta el final).

PDF pesado (congreso estatal, gaceta escaneada a medias): extract **no** usa el event loop de Nest (`pdf-extract.worker.js`). Sin clientes en `client_sources` el classify se salta (0 hallazgos); el texto igual queda listo. Cuando un cliente se vincula **después**: `POST /jobs/classify` `{ sourceId }` (o `sourceCode`) del día — no recrawlea; un SUCCESS del mismo día no se reencola con “Rastrear ahora”. Sin clientes, classify por fuente es **400**. Un archivo: `POST /documents/:id/classify`. Extract atascado: `POST /jobs/extract` de esa fuente.

---

## Env

| Variable | Default | Notas |
|----------|---------|-------|
| `REDIS_URL` | — | Vacío → `POST /jobs/crawl` 503. Compose pisa `redis://redis:6379` |
| `JOBS_WORKER` | on salvo `false` | Compose `api` = `false`; `worker` = on |
| `JOBS_SCHEDULER` | off en dev/test salvo `true`; on en prod salvo `false` | Cron en el **worker**. Compose `api` = `false`, `worker` = `true`. Este mes en prod: `false` hasta que el cliente recargue créditos OpenAI; después `true` |
| `CRAWL_CONCURRENCY` | `2` | Sitios a la vez. Da igual si hay 8 o 800 ACTIVE. **No subir** en el piloto (RAM + origen) |
| `JOBS_CONCURRENCY` | `2` | extract + normalize. **No subir** a ciegas |
| `CLASSIFY_CONCURRENCY` | igual que `JOBS_CONCURRENCY` | Solo cola `document.classify` (bajar si OpenAI 429) |
| `CRAWL_LOCK_MS` | `5400000` (90 min) | Lock BullMQ del crawl + renew 15 s. Si Render sigue en 1800000, pisa este default |
| `DOCUMENT_LOCK_MS` | `900000` (15 min) | Lock extract / normalize / classify |
| `EXTRACT_PDF_TIMEOUT_MS` | `300000` (5 min) | unpdf en worker thread; ese PDF falla, el resto sigue |
| `CRAWL_MAX_BYTES` | `25000000` | Body HTTP por página (homes/PDFs pesados) |
| `CRAWL_MAX_PAGES` | `200` | Documentos legislativos por job (tope absoluto 2000). Menús no cuentan. Si Render tiene 800, pisa el default |
| `CRAWL_MAX_DEPTH` | `4` | Clics desde la portada (paginación). Tope absoluto 8 |
| `CRAWL_MIN_YEAR` | `2026` | No sigue ni guarda gacetas/alertas con **fecha de publicación** anterior: URL (`fecha=`, `/2024/`, `yyyyMMdd`, `ddMMyyyy` tipo `30062023.pdf`) o dateline al inicio del texto (“23 de febrero de 2022”). Sin fecha se guarda (portadas). |
| `OPENAI_API_KEY` | — | Classify y `POST /ai/ask`; vacío → 503 |

No subir en el piloto: `CRAWL_CONCURRENCY`, `JOBS_CONCURRENCY`, ni quitar mismo host / circuito / delay 150 ms. Si Render ya tiene `CRAWL_MAX_PAGES=800` (o `200` viejo), **pisa** el default 200: borrar la variable o dejarla en `200`. `CRAWL_LOCK_MS` sigue en 90 min.

Render: **New → Key Value** (misma región) → Internal URL en el Web Service y en el Background Worker. Cuando el worker pase a Hetzner, ese VPS usa la URL **externa** + IP allowlist ([worker-vps.md](./worker-vps.md)). Detalle HTTP: [render-deploy.md](./render-deploy.md).  
Storage: `SUPABASE_*` → bucket; si no, `data/crawl/` (gitignored).

`GET /jobs/status` → `{ configured, redis, worker, scheduler, queues, consumers }`.  
`worker` = hay al menos un consumidor de `source.crawl` (el proceso `worker`), no “este HTTP process tiene JOBS_WORKER”. `scheduler` = si **este** proceso tiene el cron (en Compose el API es `false`; el 07:00 corre en `worker`).  
`queues` = las 4 colas (`source.crawl`, `document.extract`, `document.normalize_dedup`, `document.classify`) con `waiting` / `active` / `delayed` / `failed` / `paused` / `stalled`. `waiting` alto tras un pico es normal. Sin Redis cada valor es `null`. Lab: [PERFORMANCE.md](./PERFORMANCE.md).

---

## Crawl (`source.crawl`)

Scheduler: fuentes `ACTIVE` cuyo día (`scheduleWeekdays`, 1=lunes) y hora local (`scheduleTimezone`) ya alcanzaron `scheduleTime`. Idempotencia: `{sourceCode}:{YYYY-MM-DD}:scheduled`.

**Alcance:** parte de `Source.url`, sigue links del **mismo host** (con/sin `www`). En el portal `www.gob.mx` no se recorre todo el gobierno: solo el primer segmento de la fuente (`/cofepris/…`) más adjuntos `/cms/uploads/` del mismo host. Prioriza gaceta, iniciativas, decretos, dictámenes, `nota_detalle`, debates, PDFs de 2026+. **No archivos con fecha de publicación anterior a `CRAWL_MIN_YEAR` (default 2026):** año en URL/nombre (`fecha=`, `/2024/`, `ddMMyyyy`) o dateline al inicio del texto extraído. Sin fecha reconocida sí entra (portadas). Menús institucionales se recorren para descubrir links, **no gastan** `CRAWL_MAX_PAGES`. No redes, login, assets, transmisiones en vivo ni transparencia masiva. Meta refresh: no guarda el trampolín; sigue destino en el mismo host o subdominio `*.gob.mx`. Tope: profundidad 4 + 200 documentos (absoluto 2000). PDF/Word de un listado van primero. `meta.json` se descarta. Classify usa hasta 25k caracteres del texto. Classify también salta documentos ya guardados con publicación anterior (sin OpenAI). Un congreso 2026 cabe casi entero; el DOF entero del año puede superar el tope: se llenan primero notas/PDF 2026.

**ACTIVE en seed:** `dof`, `diputados-gaceta`, `jalisco-congreso`, `congreso-agu`, `congreso-bcn`, `congreso-bcs`, `congreso-cam`, `congreso-chh`. Otras ACTIVE con URL usan el mismo HTTP genérico.

Familias de fallo (no se “arregla” URL a URL):

- PDF en download/`octet-stream`: magic `%PDF` → `unpdf`
- Word (`.doc`/`.docx`, DOF `nota_to_doc`): Mammoth / word-extractor
- PDF escaneado: crawl guarda; extract `FAILED` (“PDF escaneado”). Sin OCR
- TLS gobierno: un reintento laxo; si falla = error de **la página de origen** (no “falló NORMA”)
- Portada que en Chrome carga y en Node da 302 eterno: cookie jar + User-Agent de Chrome en cada hop (no conector por URL). Un bucle de redirects **no** se reintenta como TLS.
- Circuito + tope `maxPages * 2` intentos: el job termina con lo que sí bajó
- Body > `CRAWL_MAX_BYTES` → “Respuesta demasiado grande”; sube el tope y **Rastrear ahora** (el scheduler no reintenta FAILED el mismo día)

YouTube / X / Facebook: conectores **después de S10**, no este spider ([PRODUCT.md](./PRODUCT.md)).

### API crawl (trigger: ADMIN)

| Método | Ruta | Notas |
|--------|------|-------|
| `GET` | `/jobs/status` | Redis / consumidores / `queues` (conteos). `waiting` alto ≠ error |
| `POST` | `/jobs/crawl` | Una fuente. Si hoy ya hay SUCCESS (cron o admin), `skipped` |
| `POST` | `/jobs/crawl/all` | HUD rastreo: todas las ACTIVE. Encadena extract → classify en el worker |
| `POST` | `/jobs/extract` | `{ sourceId }` o `{ sourceCode }`, `date?`. Extract del día + classify que falte |
| `POST` | `/jobs/extract/all` | HUD extract: todas las ACTIVE. No recrawlea. Body `{ date? }` |
| `POST` | `/jobs/classify` | Una fuente. **400** sin clientes |
| `POST` | `/jobs/classify/all` | HUD análisis: todas las ACTIVE; fuentes sin cliente salen `reason: "no-clients"` (no 400) |
| `GET` | `/jobs/runs` | Historial técnico |
| `GET` | `/jobs/progress?date=` | 1 fila/fuente + `summary` del día (`done`/`pending`/`inFlight`) |

Admin reencola **solo FAILED** del día en crawl. Un SUCCESS del cron **o** de un clic admin bloquea el otro. Extract/classify no recrawlean. Scheduler no reintenta FAILED el mismo día.

HUD de 3 agentes (ADMIN):

| Botón | Endpoint | Qué encola | Encadena |
|-------|----------|------------|----------|
| Rastreo | `POST /jobs/crawl/all` | `source.crawl` de ACTIVE sin SUCCESS de hoy | extract → classify (worker) |
| Extracción | `POST /jobs/extract/all` | extract de RECEIVED/FAILED del día | classify de canónicos que aún no tienen hallazgo |
| Análisis | `POST /jobs/classify/all` | solo classify | — |

Sin clientes: crawl y extract sí; classify de esa fuente no (`reason: "no-clients"`). Poll: los tres `GET …/progress`.

```text
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/attempt-{n}/doc-00-{hash}.html
```

Vaciar prueba local (no toca fuentes/usuarios):

```bash
pnpm exec tsx prisma/reset-crawl.ts --date=2026-09-02
docker compose run --rm --entrypoint "" api ./node_modules/.bin/tsx prisma/reset-crawl.ts --date=2026-09-02
```

Luego **Rastrear ahora**. Un SUCCESS del mismo día (cron o admin) no se reencola.

---

## Documentos (extract / normalize / classify)

Estados (`processing_status`):

| Estado | Significado |
|--------|-------------|
| `RECEIVED` | Crawl guardó el raw |
| `EXTRACTED` | Texto extraído |
| `NORMALIZED` / `HASHED` | Ficha + SHA-256 |
| `DEDUPED` | Mismo contenido; `canonicalDocumentId`; **no se borra** |
| `READY_FOR_AI` | Listo para classify |
| `CLASSIFIED` | Findings (o skip sin clientes) |
| `FAILED` | Ver `lastError` |
| `DISCARDED` | Soft-out (`meta.json`, etc.) |

```text
RECEIVED → EXTRACTED → NORMALIZED → HASHED → DEDUPED | READY_FOR_AI → CLASSIFIED
```

HTML vacío, captcha visible o texto < 80 chars → `FAILED` (sin normalize). Recaptcha en CSS del tema no cuenta si hay texto/PDF. Extract no se fía solo del Content-Type.

| Cola | Idempotencia |
|------|----------------|
| `document.extract` | `{documentId}:extract:v1` |
| `document.normalize_dedup` | `{documentId}:normalize_dedup:v1` |
| `document.classify` | `{documentId}:classify:v1` |

Paths: `derived/{documentId}/extracted.txt`, `derived/{documentId}/normalized.json`.

### Classify (S7, hecho)

Solo canónicos. Fan-out: un `Finding` por `Client` ACTIVE en `client_sources`. Unique `(documentId, clientId)`. Sin clientes: `CLASSIFIED` sin LLM. El modelo devuelve `relevant`, `impact`, `title` (la medida, no el cliente) y `justification` (briefing Markdown; `classify-v2`). `suggestedAction` es snapshot de delivery, no lo escribe la IA. Hallazgos viejos siguen `classify-v1` hasta `POST /documents/:id/classify`.

Reescritura VCGA (S8): `POST /findings/:id/rewrite` es síncrono; no usa esta cola ni `POST /ai/ask`.

### API documentos

Lectura: `ADMIN` \| `ANALYST`. Reproceso/classify: `ADMIN`.

| Método | Ruta |
|--------|------|
| `GET` | `/documents/progress?date=` — 1 fila/fuente (lote) + `summary` del día |
| `GET` | `/documents` — páginas (`sourceId` / `sourceCode` / `pilotOnly` / `date` / `limit` hasta 800) |
| `GET` | `/documents/:id` — texto + `processingHistory` |
| `POST` | `/documents/:id/reprocess` — vuelve a extract |
| `POST` | `/documents/:id/classify` — reencola classify |

Registrar `/documents/progress` antes que `/documents/:id`. No devolver HTML crudo en el listado.

---

## Principios

1. Original inmutable; nueva versión = nuevo path.
2. Soft-status; no hard-delete en el piloto.
3. Crawl una vez por fuente; relevancia por cliente en classify.
4. Jobs idempotentes (`idempotencyKey`).
