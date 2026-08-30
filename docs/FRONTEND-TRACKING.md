# Frontend — Panel de rastreo y extracción

**Audiencia:** `norma-frontend` (JobsPanel / DocumentsRegistry).  
**Backend:** implementado. Copy en español. **No** clasifica (S7).

Los listados técnicos (`GET /jobs/runs`) siguen para Swagger/ops. El resumen del día es **una fila por fuente**. Al abrir una fuente, el dashboard lista **PDF, Word y HTML** con `GET /documents` (preview) y `GET /documents/:id` (texto extraído).

Detalle backend: [jobs-crawl.md](./jobs-crawl.md), [document-processing.md](./document-processing.md).

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`. Roles: `ADMIN` \| `ANALYST`. Sin token → `401`.

## Día civil

Query opcional `date=YYYY-MM-DD`. Default: hoy en `America/Mexico_City` (igual que el schedule de fuentes). Fecha inválida → `400`.

Fuentes: piloto (`dof`, `diputados-gaceta`, congresos ACTIVE) + cualquier otra `ACTIVE`. El crawl guarda **varias** páginas por fuente; este GET sigue siendo **una fila por fuente**.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/jobs/progress?date=` | Rastreo: último crawl del día (no duplicar admin+scheduler) |
| `GET` | `/documents/progress?date=` | Extracción: mejor HTML/PDF del día (`meta.json` se ignora) |
| `GET` | `/documents?pilotOnly=true&limit=&date=&sourceId=` | Páginas internas: preview + `url`. `limit` hasta 800. `date` = día civil. `sourceId` = detalle de una fuente |
| `GET` | `/documents/:id` | Texto extraído de una página (`extractedText`, no HTML crudo) |

`GET /documents/progress` es ruta estática; no usar `GET /documents/:id` con id `progress`.

**No pollar `GET /documents?limit=800` cada pocos segundos.** El panel solo refresca `/jobs/progress` y `/documents/progress` (15 s si hay trabajo en curso, 45 s si no). El listado de páginas se pide al entrar y al abrir una fuente (`sourceId`). Poll agresivo + CORS `OPTIONS` satura el plan gratuito de Render (`429` / `502` / `503`).

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

Pintar: **nombre + badge `label` + `headline`**. Mostrar `note` si el contenido ya estaba (`unchanged`), si no hay texto usable (`unread` / `failed`), o si el día mezcló texto listo con un intento fallido. Un badge (el resultado principal); la nota dice si hubo duplicado o error, sin palabras como `DEDUPED` ni `FAILED`.

| Pipeline | `status` | `label` |
|----------|----------|---------|
| sin HTML aún | `pending` | Sin texto aún |
| extract en curso | `extracting` | Extrayendo texto |
| `READY_FOR_AI` | `ready` | Texto listo |
| solo `DEDUPED` | `unchanged` | Sin cambios (ya registrada) |
| umbral / captcha | `unread` | Rastreada, sin texto usable |
| PDF escaneado (imagen, sin capa de texto) | `unread` | Rastreada, sin texto usable — `note` dice que es PDF escaneado; el archivo sí está guardado. OCR no está en este sprint |
| error técnico | `failed` | No se pudo extraer |

`headline`: ~80 caracteres del preview de texto, no HTML. No hay `contentHash`, paths ni `canonicalDocumentId`.

## Flujo piloto (hasta S6)

```text
Pendiente → Rastreando → Rastreada → Extrayendo texto → Texto listo
                              ├→ Sin cambios (ya registrada)  ← mismo contenido
                              └→ Rastreada, sin texto usable / No se pudo extraer
Pendiente → No se pudo rastrear
```

En `unchanged`, `headline` es el texto que ya teníamos (no HTML) y `note` aclara que no es texto nuevo.

## Qué no usar en el panel

| Ruta | Para |
|------|------|
| `GET /jobs/runs` | Historial técnico (intentos, claves, paths) |
| `POST /jobs/crawl` | Botón ADMIN “Rastrear ahora” / “Poner a rastrear” |
| `POST /documents/:id/reprocess` | Reintento ADMIN |

`GET /documents` y `GET /documents/:id` **sí** van en el dashboard, en el **detalle de la fuente** (PDF / Word / HTML), no en el resumen ejecutivo.

Clasificación / semáforo = Sprint 7.
