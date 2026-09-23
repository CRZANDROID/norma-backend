# Frontend — Panel de rastreo, extracción y análisis

**Audiencia:** `norma-frontend` (JobsPanel / DocumentsRegistry).  
**Backend:** implementado. Copy en español. Badge `classified` = Sprint 7 ([FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)).

Los listados técnicos (`GET /jobs/runs`) siguen para Swagger/ops. El resumen del día es **una fila por fuente**. Al abrir una fuente, el dashboard lista **PDF, Word y HTML** con `GET /documents` (preview) y `GET /documents/:id` (texto extraído).

Detalle backend: [jobs.md](./jobs.md).

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`. Roles: `ADMIN` \| `ANALYST`. Sin token → `401`.

## Día civil

Query opcional `date=YYYY-MM-DD`. Default: hoy en `America/Mexico_City` (igual que el schedule de fuentes). Fecha inválida → `400`.

Fuentes: **solo `ACTIVE`**. Si apagas una (piloto o no), deja de aparecer en los tres `progress`. Documentos y hallazgos **no se borran**; se leen con `GET /documents?sourceId=` y `GET /findings?sourceId=`. El crawl guarda **varias** páginas legislativas por fuente (hasta 200, profundidad 4; menús no cuentan) y **omite gacetas/alertas con fecha de publicación anterior a 2026** (`CRAWL_MIN_YEAR`: URL, `ddMMyyyy` en el archivo, o dateline al inicio del texto). En `gob.mx` no sale del path de la fuente. Este GET sigue siendo **una fila por fuente**. Un rastreo de gaceta grande puede tardar 20–90 min con logs `crawl page N/M`; no es un cuelgue. Muchas filas `queued` a la vez (catálogo entero encolado) es el drenaje esperado: `waiting` alto no es un error.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/jobs/progress?date=` | Rastreo: último crawl del día (no duplicar admin+scheduler) |
| `GET` | `/documents/progress?date=` | Extracción: 1 fila/fuente. `status` = hay trabajo en el lote, no la página más avanzada. `headline` sí sale de la mejor página |
| `GET` | `/findings/progress?date=` | Análisis: 1 fila/fuente. `status` = hay classify pendiente (o crawl aún vivo); `counts` se pintan aunque siga `classifying` |
| `GET` | `/documents?pilotOnly=true&limit=&date=&sourceId=` | Páginas internas: preview + `url`. `limit` hasta 800. `date` = día civil. `sourceId` = detalle de una fuente |
| `GET` | `/documents/:id` | Texto extraído de una página (`extractedText`, no HTML crudo) |

## HUD — 3 botones ADMIN

Cada hueco del HUD es un agente. Body opcional `{ "date": "YYYY-MM-DD" }` (default hoy CDMX). Role `ADMIN`. Worker tiene que estar vivo (`GET /jobs/status` → `worker: true`); si no, queda en cola.

| Hueco | Botón | Endpoint | Encadena |
|-------|--------|----------|----------|
| Crawl | Rastrear | `POST /jobs/crawl/all` | extract → classify en el worker |
| Extract | Extraer | `POST /jobs/extract/all` | classify de lo que ya tiene texto y le falta hallazgo |
| Classify | Analizar | `POST /jobs/classify/all` | nada más |

Crawl de hoy ya SUCCESS → esa fuente no se vuelve a rastrear (`skipped` / `already-completed`). Extract y classify **no** recrawlean. Classify sin cliente en esa fuente: no 400 del lote; `reason: "no-clients"`. Una fuente suelta: `POST /jobs/crawl` \| `/jobs/extract` \| `/jobs/classify` con `{ sourceId }`. Classify de una fuente sin cliente → **400**.

Poll igual: `/jobs/progress`, `/documents/progress`, `/findings/progress`.

`GET /documents` puede devolver `processingStatus: "CLASSIFIED"` (Sprint 7). El union del front debe incluirlo; no descartar filas con status desconocido.

**No pollar `GET /documents?limit=800` ni `GET /findings` cada pocos segundos.** El panel solo refresca `/jobs/progress`, `/documents/progress` y `/findings/progress` (15 s si hay `queued` / `running` / `extracting` / `classifying`, 45 s si no). Cuando el rastreo de una fuente pasa a `crawled` / `failed` / `skipped`, pide extract y análisis **enseguida** (no esperes el siguiente ciclo): en fuentes cortas extract+classify caben entre dos polls de 15 s. El listado de páginas se pide al entrar y al abrir una fuente (`sourceId`). El listado de hallazgos es otra pantalla (`GET /findings`). Poll agresivo + CORS `OPTIONS` satura el plan gratuito de Render (`429` / `502` / `503`).

**Pestaña en segundo plano:** el navegador frena o pausa los `setInterval` sin foco. Pausar el timer con `document.hidden` está bien (ahorra Render). Al volver a visible (`visibilitychange` → `visible`, o `pageshow` tras bfcache) hay que **pedir los tres `progress` enseguida**, no arrancar un conteo de 15 s y esperar. Pintar esa respuesta aunque el lote ya haya terminado. Si el resume del poll está atado a “¿el último snapshot seguía `running`/`extracting`/`classifying`?”, ocurre esto: una petición en background (o ninguna) deja el store en `crawled` y el badge en “Rastreando”; al volver no se reanuda el timer y la UI nunca se entera. El intervalo 15/45 se decide **después** de esa respuesta, no con el snapshot viejo.

## Rastreo — `GET /jobs/progress`

```json
{
  "date": "2026-08-25",
  "summary": { "total": 5, "pending": 5, "inFlight": 0, "done": 0 },
  "sources": [
    {
      "sourceId": "...",
      "sourceName": "Congreso de Jalisco",
      "status": "crawled",
      "label": "Rastreada",
      "at": "2026-08-25T19:01:00.558Z",
      "note": null,
      "detail": { "jobRunId": "clx..." }
    }
  ]
}
```

**Contador del día:** `summary.done` / `summary.total`. `sources` **siempre** trae una fila por fuente ACTIVE (las que aún no toca hoy van `pending`). No uses `sources.length` como “ya rastreadas”: eso queda en el total aunque el día esté en cero. `pending` = aún no hay crawl de ese día; `inFlight` = `queued`/`running`; `done` = `crawled` + `failed` + `skipped`. Al cambiar el día civil, `done` vuelve a 0 hasta el rastrea de hoy.

Pintar: **nombre de fuente + badge `label` + hora `at`**. Mostrar `note` si hay fallo, fuente omitida, o un intento fallido el mismo día aunque el último rastree bien. Un badge; la nota explica el extra.

Si el origen está caído o el certificado falla, `status` es `failed` y `note` es **`La página de la fuente no está disponible.`** (responsabilidad del sitio, no del rastreo). Si el job alcanzó a guardar algo y cortó el circuito, `status` es `crawled` y `note` es **`Algunas páginas del sitio no respondieron; se guardó lo que sí estaba disponible.`** No mostrar códigos TLS, stacks ni `UNABLE_TO_VERIFY`.

| `status` | `label` |
|----------|---------|
| `pending` | Pendiente hoy |
| `queued` / `running` | Rastreando |
| `crawled` | Rastreada |
| `failed` | No se pudo rastrear |
| `skipped` | Omitida |

No mostrar `idempotencyKey`, paths ni artifacts. `detail.jobRunId` es opcional (ficha técnica / Swagger), no la UI piloto.

## Extracción — `GET /documents/progress`

```json
{
  "date": "2026-08-25",
  "summary": { "total": 5, "pending": 5, "inFlight": 0, "done": 0 },
  "sources": [
    {
      "sourceId": "...",
      "sourceName": "Diario Oficial de la Federación",
      "status": "ready",
      "label": "Texto listo",
      "headline": "DOF - Diario Oficial…",
      "note": null
    }
  ]
}
```

Mismo `summary` que rastreo: `done` / `total` del **día** (`date`). `inFlight` aquí es `extracting`. No cuentes filas con `headline` de otro día: si no hay documentos de `date`, la fila es `pending` y `headline` es `null`.

Pintar: **nombre + badge `label` + `headline`**. El orbe de espera usa `status === "extracting"`, no si ya hay `headline`. Mostrar `note` si el contenido ya estaba (`unchanged`), si no hay texto usable (`unread` / `failed`), si el día mezcló texto listo con un intento fallido, o si **sigue** el lote (`extracting` con páginas ya listas). Un badge; `headline` puede ser de una página ya lista aunque el lote no haya acabado.

`status` de la **fuente** (no de la mejor página):

- `extracting` si **cualquier** página del día sigue en extract (`RECEIVED`…`HASHED`), **o** si el crawl de hoy de esa fuente sigue `queued`/`running` (aún pueden llegar páginas)
- si no, el resultado terminal de la mejor página (`ready` / `classified` / `unchanged` / `unread` / `failed` / `pending`)

| Pipeline | `status` | `label` |
|----------|----------|---------|
| sin HTML aún y crawl del día no vivo | `pending` | Sin texto aún |
| extract en curso, o crawl del día `queued`/`running` | `extracting` | Extrayendo texto |
| `READY_FOR_AI` | `ready` | Texto listo |
| `CLASSIFIED` | `classified` | Clasificada |
| solo `DEDUPED` | `unchanged` | Sin cambios (ya registrada) |
| umbral / captcha | `unread` | Rastreada, sin texto usable |
| PDF escaneado (imagen, sin capa de texto) | `unread` | Rastreada, sin texto usable — `note` dice que es PDF escaneado; el archivo sí está guardado. OCR no está en este sprint |
| error técnico | `failed` | No se pudo extraer |

`headline`: ~80 caracteres del preview de texto, no HTML. No hay `contentHash`, paths ni `canonicalDocumentId`.

## Análisis — `GET /findings/progress`

Tercera columna del mismo dashboard (no sustituye `GET /findings`).

```json
{
  "date": "2026-09-02",
  "summary": { "total": 5, "pending": 5, "inFlight": 0, "done": 0 },
  "sources": [
    {
      "sourceId": "...",
      "sourceName": "Diario Oficial de la Federación",
      "status": "classified",
      "label": "Analizada",
      "counts": { "red": 0, "orange": 1, "yellow": 2, "green": 4 },
      "note": null
    }
  ]
}
```

Pintar: **nombre + badge `label` + `counts`**. El orbe de espera usa `status === "classifying"`; **no** apagues el orbe solo porque ya hay `counts`. El semáforo no es de la fuente: cada archivo se clasifica aparte (`GET /findings?sourceId=`). `counts` es el agregado del día y **sí se pinta durante `classifying`**. No hay `headline` ni `impact` en esta fila. Mostrar `note` si el análisis sigue, falló, o no hay clientes vinculados.

`status` de la **fuente**:

- `classifying` si **cualquier** página del día sigue en `READY_FOR_AI`, **o** si el crawl de hoy sigue vivo y ya hay hallazgos / docs clasificados (no marcar `classified` a mitad del rastreo)
- si no: `classified` / `skipped` / `failed` / `pending`

| Pipeline | `status` | `label` |
|----------|----------|---------|
| sin texto listo para IA | `pending` | Sin análisis aún |
| `READY_FOR_AI` en cola, o crawl del día aún vivo con hallazgos | `classifying` | Analizando |
| todas las páginas del día ya analizadas (hay hallazgos) | `classified` | Analizada |
| classify falló (OpenAI / red del modelo) | `failed` | No se pudo analizar |
| `CLASSIFIED` sin findings (sin `client_sources`) | `skipped` | Sin análisis |

No pintar `justification`, `aiMeta`, título de un hallazgo ni un color único de la fuente. El detalle por archivo es `GET /findings?sourceId=` (mismo patrón que `GET /documents?sourceId=`).

Un fallo de **extracción** (captcha, PDF escaneado, página caída) no marca esta columna como `failed`: eso vive en `/documents/progress` o `/jobs/progress`.

Si el worker se reinicia o BullMQ marca el job `stalled`, el backend **cierra** la fila: crawl `failed` (o `crawled` con nota si ya había páginas), extract/classify `failed`. El orbe no debe quedar en `running` / `extracting` / `classifying` para siempre. Copy: “El rastreo se interrumpió; se guardó lo que sí estaba disponible.” / “No se pudo extraer” / “No se pudo analizar”.

## Flujo piloto (hasta S7)

```text
Pendiente → Rastreando → Rastreada → Extrayendo texto → Texto listo → Analizando → Analizada
                              ├→ Sin cambios (ya registrada)  ← mismo contenido
                              └→ Rastreada, sin texto usable / No se pudo extraer
Pendiente → No se pudo rastrear
Texto listo → No se pudo analizar / Sin análisis (sin clientes)
```

En `unchanged`, `headline` es el texto que ya teníamos (no HTML) y `note` aclara que no es texto nuevo.

## Qué no usar en el panel

| Ruta | Para |
|------|------|
| `GET /jobs/runs` | Historial técnico (intentos, claves, paths) |
| `POST /jobs/crawl` | Una fuente. Idempotente el día civil |
| `POST /jobs/crawl/all` | HUD **Rastreo**. Encadena extract+classify en el worker. SUCCESS de hoy → `skipped` |
| `POST /jobs/extract` | Una fuente: extract + classify que falte. `{ sourceId }`, `date?` |
| `POST /jobs/extract/all` | HUD **Extracción**. Body `{ date? }`. No recrawlea. Respuesta `extract` + `classify` (conteos) |
| `POST /jobs/classify` | Una fuente. **400** si no hay clientes |
| `POST /jobs/classify/all` | HUD **Análisis**. Body `{ date? }`. Fuentes sin cliente: `reason: "no-clients"` |
| `POST /documents/:id/reprocess` | Reintento ADMIN de un archivo (extract) |
| `POST /documents/:id/classify` | Reintento ADMIN de un archivo (clasificación S7) |
| `GET /findings` | Lista de hallazgos / semáforo (otra pantalla, no este resumen) |

`GET /documents` y `GET /documents/:id` **sí** van en el dashboard, en el **detalle de la fuente** (PDF / Word / HTML), no en el resumen ejecutivo.

Clasificación / semáforo **de lista** = `/alertas` ([FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)). El avance por fuente en este panel es `GET /findings/progress`. No generar PDF si alguna fuente del día sigue `classifying`.
