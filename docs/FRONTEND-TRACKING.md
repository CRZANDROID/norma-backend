# Frontend — Panel de rastreo, extracción y análisis

**Audiencia:** `norma-frontend` (JobsPanel / DocumentsRegistry).  
**Backend:** implementado. Copy en español. Badge `classified` = Sprint 7 ([FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md)).

Los listados técnicos (`GET /jobs/runs`) siguen para Swagger/ops. El resumen del día es **una fila por fuente**. Al abrir una fuente, el dashboard lista **PDF, Word y HTML** con `GET /documents` (preview) y `GET /documents/:id` (texto extraído).

Detalle backend: [jobs-crawl.md](./jobs-crawl.md), [document-processing.md](./document-processing.md).

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`. Roles: `ADMIN` \| `ANALYST`. Sin token → `401`.

## Día civil

Query opcional `date=YYYY-MM-DD`. Default: hoy en `America/Mexico_City` (igual que el schedule de fuentes). Fecha inválida → `400`.

Fuentes: **solo `ACTIVE`**. Si apagas una (piloto o no), deja de aparecer en los tres `progress`. Documentos y hallazgos **no se borran**; se leen con `GET /documents?sourceId=` y `GET /findings?sourceId=`. El crawl guarda **varias** páginas por fuente; este GET sigue siendo **una fila por fuente**.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/jobs/progress?date=` | Rastreo: último crawl del día (no duplicar admin+scheduler) |
| `GET` | `/documents/progress?date=` | Extracción: 1 fila/fuente. `status` = hay trabajo en el lote, no la página más avanzada. `headline` sí sale de la mejor página |
| `GET` | `/findings/progress?date=` | Análisis: 1 fila/fuente. `status` = hay classify pendiente (o crawl aún vivo); `counts` se pintan aunque siga `classifying` |
| `GET` | `/documents?pilotOnly=true&limit=&date=&sourceId=` | Páginas internas: preview + `url`. `limit` hasta 800. `date` = día civil. `sourceId` = detalle de una fuente |
| `GET` | `/documents/:id` | Texto extraído de una página (`extractedText`, no HTML crudo) |

`GET /documents` puede devolver `processingStatus: "CLASSIFIED"` (Sprint 7). El union del front debe incluirlo; no descartar filas con status desconocido.

**No pollar `GET /documents?limit=800` ni `GET /findings` cada pocos segundos.** El panel solo refresca `/jobs/progress`, `/documents/progress` y `/findings/progress` (15 s si hay `queued` / `running` / `extracting` / `classifying`, 45 s si no). Cuando el rastreo de una fuente pasa a `crawled` / `failed` / `skipped`, pide extract y análisis **enseguida** (no esperes el siguiente ciclo): en fuentes cortas extract+classify caben entre dos polls de 15 s. El listado de páginas se pide al entrar y al abrir una fuente (`sourceId`). El listado de hallazgos es otra pantalla (`GET /findings`). Poll agresivo + CORS `OPTIONS` satura el plan gratuito de Render (`429` / `502` / `503`).

## Rastreo — `GET /jobs/progress`

```json
{
  "date": "2026-08-25",
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
| `POST /jobs/crawl` | Botón ADMIN “Rastrear ahora” / “Poner a rastrear” |
| `POST /documents/:id/reprocess` | Reintento ADMIN (extract) |
| `POST /documents/:id/classify` | Reintento ADMIN (clasificación S7) |
| `GET /findings` | Lista de hallazgos / semáforo (otra pantalla, no este resumen) |

`GET /documents` y `GET /documents/:id` **sí** van en el dashboard, en el **detalle de la fuente** (PDF / Word / HTML), no en el resumen ejecutivo.

Clasificación / semáforo **de lista** = [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md) (`GET /findings`). El avance por fuente en este panel es `GET /findings/progress`.
