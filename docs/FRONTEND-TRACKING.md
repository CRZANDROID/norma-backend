# Frontend — Panel de rastreo y extracción

**Audiencia:** `norma-frontend` (JobsPanel / DocumentsRegistry).  
**Backend:** implementado. Copy en español. **No** clasifica (S7).

Los listados técnicos (`GET /jobs/runs`, `GET /documents`) siguen para Swagger/ops. El piloto de consultor debe pintar **estos** GETs: una fila por fuente.

Detalle backend: [jobs-crawl.md](./jobs-crawl.md), [document-processing.md](./document-processing.md).

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`. Roles: `ADMIN` \| `ANALYST`. Sin token → `401`.

## Día civil

Query opcional `date=YYYY-MM-DD`. Default: hoy en `America/Mexico_City` (igual que el schedule de fuentes). Fecha inválida → `400`.

Fuentes: piloto (`dof`, `diputados-gaceta`, `jalisco-congreso`) + cualquier otra `ACTIVE`.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/jobs/progress?date=` | Rastreo: último crawl del día (no duplicar admin+scheduler) |
| `GET` | `/documents/progress?date=` | Extracción: mejor HTML/PDF del día (`meta.json` se ignora) |

`GET /documents/progress` es ruta estática; no usar `GET /documents/:id` con id `progress`.

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
| `GET /documents` / `GET /documents/:id` | Ficha de pipeline |
| `POST /jobs/crawl` | Botón ADMIN “Rastrear ahora” |
| `POST /documents/:id/reprocess` | Reintento ADMIN |

Clasificación / semáforo = Sprint 7.
