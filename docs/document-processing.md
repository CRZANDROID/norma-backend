# Registro documental (Sprint 6)

Tras un crawl **SUCCESS**, cada HTML/PDF/Word interno se extrae, se arma ficha y se calcula SHA-256. Si el contenido ya existía, el documento nuevo queda `DEDUPED` enlazado al canónico; **no se borra**. El crawl ya no se queda en la portada: ver [jobs-crawl.md](./jobs-crawl.md).

No abre inbox ni envía email (S8). Copy de producto: **registro documental**, no LLM, hasta el paso classify.

Contrato: [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) §§4.2–4.3.

## Flujo

```text
crawl SUCCESS (N páginas HTML/PDF/Word del mismo sitio)
  → Document RECEIVED + cola document.extract (uno por archivo)
  → EXTRACTED (derived/{id}/extracted.txt)
  → cola document.normalize_dedup
  → NORMALIZED → HASHED
  → READY_FOR_AI  |  DEDUPED + canonicalDocumentId
  → cola document.classify (solo canónicos)
  → CLASSIFIED + Finding por cliente en client_sources
```

`meta.json` se ignora (`DISCARDED`). HTML vacío, captcha **visible** (Cloudflare / “Just a moment”) o texto < 80 caracteres → `FAILED` (`lastError`), sin normalize. Clases CSS de recaptcha en el tema (Avada, Contact Form 7) no cuentan: el listado de PDFs de una gaceta/orden del día se extrae.

Extract no se fía solo del `Content-Type` ni de la extensión: un PDF servido como `octet-stream` o `/Download?filename=x.pdf` se trata con `unpdf`. Un `.doc`/`.docx` (p. ej. DOF `nota_to_doc.php` con `application/msword`) se extrae con Mammoth / word-extractor, no como HTML. XML usa el mismo strip de tags que HTML. Un PDF ya extraído no se clasifica como captcha por coincidencia de bytes.

Un **PDF escaneado** (imagen, sin capa de texto) se guarda bien en crawl; extract queda `FAILED` con `lastError` que dice **PDF escaneado**. No es un fallo de rastreo y **no hay OCR en este sprint**. Reprocess no va a inventar texto.

Fuentes ACTIVE en seed: `dof`, `diputados-gaceta`, Jalisco, Aguascalientes, BC, BCS, Campeche, Chihuahua.

## Colas (mismo Redis que S5)

| Cola | Idempotencia |
|------|----------------|
| `document.extract` | `{documentId}:extract:v1` |
| `document.normalize_dedup` | `{documentId}:normalize_dedup:v1` |
| `document.classify` | `{documentId}:classify:v1` |

Paths derivados: `derived/{documentId}/extracted.txt`, `derived/{documentId}/normalized.json`.

## API

Auth JWT. Lectura: `ADMIN` \| `ANALYST`. Reproceso: `ADMIN`.

### `GET /documents/progress?date=YYYY-MM-DD`

Resumen ejecutivo: **una fila por fuente**. El `status` es el del **lote** (si alguna página sigue en extract, o el crawl del día sigue `queued`/`running`, la fila es `extracting`). `headline` sale de la mejor página (`meta.json` se ignora; si hay canónico + `DEDUPED`, gana el canónico). Copy en español. Contrato UI: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md). El listado `GET /documents` muestra **todas** las páginas internas del crawl.

Registrar esta ruta **antes** de `GET /documents/:id`.

### `GET /documents?sourceCode=dof&processingStatus=READY_FOR_AI&pilotOnly=true&limit=20`

Lista ficha + estado de pipeline + `textPreview` + `url` de la página. **No** devuelve HTML crudo. `limit` hasta 800 (8 fuentes × ~80 páginas). Query opcional `date=YYYY-MM-DD` (mismo día civil que `progress`) y `sourceId` para el detalle de una fuente.

### `GET /documents/:id`

Ficha + `extractedText` + `url` + `processingHistory` (`[{ status, at }]`).

### `POST /documents/:id/reprocess`

Reencola extract (vuelve a `RECEIVED`).

### `POST /documents/:id/classify`

Reencola classify (ADMIN). Requiere Redis + `OPENAI_API_KEY`. Hallazgos: [FRONTEND-FINDINGS.md](./FRONTEND-FINDINGS.md).

## Cómo se comprueba

1. **Rastrear ahora** en una fuente ACTIVE → `job_runs` SUCCESS con `stats.fetched` > 1 si el sitio tiene gaceta/iniciativas/notas.
2. `GET /jobs/progress` → una fila por fuente con `label` (p. ej. Rastreada).
3. `GET /documents?sourceCode=dof` → fila `EXTRACTED` o `READY_FOR_AI` con texto legible.
4. `GET /documents/progress` → una fila por fuente (`Texto listo` / `Rastreada, sin texto usable` / `Sin cambios…` con `note`).
5. Segundo rastreo del mismo contenido (o reprocess) → `DEDUPED` al primero; ambas filas siguen vivas. El resumen queda `unchanged` (no “Texto listo” otra vez) y la nota explica que ya estaba registrado.
