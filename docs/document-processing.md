# Registro documental (Sprint 6)

Tras un crawl **SUCCESS** de `page.html` / `page.pdf`, NORMA extrae texto, arma una ficha y calcula SHA-256. Si el contenido ya existía, el documento nuevo queda `DEDUPED` enlazado al canónico; **no se borra**.

No clasifica (S7) ni abre inbox (S8). Copy de producto: **registro documental**, no LLM.

Contrato: [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) §§4.2–4.3.

## Flujo

```text
crawl SUCCESS (page.html|page.pdf)
  → Document RECEIVED + cola document.extract
  → EXTRACTED (derived/{id}/extracted.txt)
  → cola document.normalize_dedup
  → NORMALIZED → HASHED
  → READY_FOR_AI  |  DEDUPED + canonicalDocumentId
```

`meta.json` se ignora (`DISCARDED`). HTML vacío, captcha o texto < 80 caracteres → `FAILED` (`lastError`), sin normalize.

Fuentes piloto: `dof`, `diputados-gaceta`, `jalisco-congreso`.

## Colas (mismo Redis que S5)

| Cola | Idempotencia |
|------|----------------|
| `document.extract` | `{documentId}:extract:v1` |
| `document.normalize_dedup` | `{documentId}:normalize_dedup:v1` |

Paths derivados: `derived/{documentId}/extracted.txt`, `derived/{documentId}/normalized.json`.

## API

Auth JWT. Lectura: `ADMIN` \| `ANALYST`. Reproceso: `ADMIN`.

### `GET /documents?sourceCode=dof&processingStatus=READY_FOR_AI&pilotOnly=true&limit=20`

Lista ficha + estado de pipeline + preview de texto. **No** devuelve HTML crudo.

### `GET /documents/:id`

Ficha + `extractedText` + `processingHistory` (`[{ status, at }]`).

### `POST /documents/:id/reprocess`

Reencola extract (vuelve a `RECEIVED`).

## Cómo se comprueba

1. **Rastrear ahora** en DOF / Diputados / Jalisco → `job_runs` SUCCESS (igual que S5).
2. `GET /documents?sourceCode=dof` → fila `EXTRACTED` o `READY_FOR_AI` con texto legible.
3. Segundo rastreo del mismo contenido (o reprocess) → `DEDUPED` al primero; ambas filas siguen vivas.
