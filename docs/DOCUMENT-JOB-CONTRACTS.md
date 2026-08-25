# Contratos de documentos y jobs de ingesta (Sprint 4 → 5)

**Issue:** `S4: Document contracts for documents and ingestion jobs` (#14)  
**Estado:** contrato + **S5 implementado** (`src/jobs/`, cola `source.crawl`, tabla `job_runs`).  
**Operación S5:** [jobs-crawl.md](./jobs-crawl.md).

Relacionado:

- Storage mínimo actual: [sentry-storage.md](./sentry-storage.md)
- Catálogo de fuentes por cliente: [client-sources.md](./client-sources.md)
- Handoff: [HANDOFF.md](./HANDOFF.md)

---

## 1. Principios

1. **Inmutabilidad del original:** el binario en Storage no se sobrescribe; nuevas versiones = nuevo `path`.
2. **Soft-status de negocio:** tablas usan `EntityStatus` (`ACTIVE`/`INACTIVE`) o enums de procesamiento; **no hard-delete** en piloto.
3. **Una fuente, muchos clientes:** el crawl es por `Source.code` / `sourceId`; la relevancia por cliente usa `client_sources` + perfiles.
4. **Jobs idempotentes:** mismo `idempotencyKey` no duplica efectos colaterales (raw artifacts / document rows).
5. Nest administra reglas; **Supabase Storage** solo guarda bytes; workers hablarán Prisma + Storage + colas.

---

## 2. Modelo actual vs pipeline futuro

### Hoy (schema / API, S6 implementado)

| Pieza | Rol |
|-------|-----|
| `Source` | Catálogo de orígenes (`code`, `category`, `platform`, `url`, `sections`) |
| `client_sources` | Qué fuentes monitorear por cliente |
| `Document` | Metadatos Storage + `processingStatus` / hash / texto extraído (S6) |
| `POST /storage/*` | Upload/download/signed-url **sin** crear fila `documents` aún |
| `Finding` | Placeholder de hallazgo (CRUD inbox = S7–S8) |
| `GET /documents` | Lectura admin/analyst del registro documental |

Campo de pipeline (`DocumentProcessingStatus` en columna `processing_status`):

```text
DocumentProcessingStatus
```

| Estado | Significado |
|--------|-------------|
| `RECEIVED` | Job de crawl terminó; raw persistido (Storage y/o tabla raw) |
| `EXTRACTED` | Texto/HTML/PDF extraído |
| `NORMALIZED` | Shape común + campos canónicos |
| `HASHED` | Content hash calculado |
| `DEDUPED` | Evaluado contra duplicados (link a canónico si aplica) |
| `READY_FOR_AI` | Listo para clasificación (S7) |
| `FAILED` | Error recuperable/no; ver `lastError` |
| `DISCARDED` | Soft-out del pipeline (no borrar bytes) |

`EntityStatus` en `Document` sigue siendo **ACTIVE/INACTIVE** (visibilidad admin).  
Implementación S6: [document-processing.md](./document-processing.md).

---

## 3. State machine (documentos de ingesta)

```text
                    ┌──────────────┐
                    │   (crawl)    │
                    └──────┬───────┘
                           ▼
                     RECEIVED ──────► FAILED
                           │
                           ▼
                      EXTRACTED ────► FAILED
                           │
                           ▼
                     NORMALIZED ────► FAILED
                           │
                           ▼
                        HASHED
                           │
                           ▼
                       DEDUPED ─────► DISCARDED (opcional)
                           │
                           ▼
                     READY_FOR_AI ───► (S7 classification)
```

Reglas:

- Transiciones **solo adelante** (salvo re-proceso explícito que crea **nuevo** intento / artifact).
- `FAILED` puede reencolarse → vuelve a `RECEIVED` o al paso fallido según `retryFrom`.
- Duplicado detectado: documento actual → `DEDUPED` con `canonicalDocumentId`; **no** borrar.

---

## 4. Contratos de jobs (Sprint 5)

Cola: Redis + BullMQ (nombres tentativos). Un job = una unidad de trabajo auditable.

### 4.1 `source.crawl` — conectar y traer crudo

**Producer:** scheduler (hora `Source.scheduleTime` + `scheduleWeekdays` + `scheduleTimezone`) o `ADMIN` trigger manual.  
**Consumer:** worker de conectores (`dof`, `diputados-gaceta`, `jalisco-congreso`, …).  
**Filtro de alcance:** sources `ACTIVE` (el catálogo incluye 32 congresos estatales; el piloto crawlea las ACTIVE). Opcionalmente exigir ≥1 `client_sources`.

#### Payload

```ts
type SourceCrawlJob = {
  /** Unique per scheduled run */
  jobId: string; // cuid o uuid
  type: 'source.crawl';
  sourceId: string;
  sourceCode: string; // denormalizado para logs
  /** ISO time when the run was enqueued */
  enqueuedAt: string;
  /** Optional window for connectors that support it */
  since?: string; // ISO
  until?: string; // ISO
  /** Idempotency: sourceCode + calendar day + attempt bucket */
  idempotencyKey: string; // e.g. "dof:2026-08-04:scheduled"
  /** Trace */
  triggeredBy: 'scheduler' | 'admin' | 'retry';
  requestedByUserId?: string;
};
```

#### Result (success)

```ts
type SourceCrawlResult = {
  ok: true;
  jobId: string;
  sourceId: string;
  /** Artifacts written this run */
  artifacts: Array<{
    /** Storage path under bucket documents */
    storagePath: string;
    contentType?: string;
    byteSize?: number;
    /** Optional provisional document id if metadata row created */
    documentId?: string;
    externalRef?: string; // URL o id remoto
  }>;
  /** Connector-specific stats */
  stats: {
    fetched: number;
    saved: number;
    skipped: number;
  };
  finishedAt: string; // ISO
};
```

#### Result (failure)

```ts
type SourceCrawlFailure = {
  ok: false;
  jobId: string;
  sourceId: string;
  errorCode: 'NETWORK' | 'PARSE' | 'AUTH' | 'RATE_LIMIT' | 'UNKNOWN';
  message: string;
  retryable: boolean;
  finishedAt: string;
};
```

**Retries BullMQ:** `retryable: true` → backoff exponencial (ej. 3 intentos).  
**Idempotencia:** si `idempotencyKey` ya tiene resultado `ok`, el worker no vuelve a subir el mismo artifact (skip + log).

---

### 4.2 `document.extract` — implementado S6

```ts
type DocumentExtractJob = {
  type: 'document.extract';
  jobId: string;
  documentId: string;
  storagePath: string;
  idempotencyKey: string; // `${documentId}:extract:v1`
};
```

Resultado: actualiza processing → `EXTRACTED` + texto en tabla/archivo derivado (path hermano). Fallo → `FAILED`.

---

### 4.3 `document.normalize_dedup` — implementado S6

```ts
type DocumentNormalizeJob = {
  type: 'document.normalize_dedup';
  jobId: string;
  documentId: string;
  idempotencyKey: string;
};
```

Resultado: `NORMALIZED` → `HASHED` → `DEDUPED` | `READY_FOR_AI`.

---

## 5. Relación con clientes

1. Crawl corre a nivel **Source** (una vez), no N veces por cliente.
2. Tras `READY_FOR_AI` / findings, la **relevancia** se evalúa por cada `Client` con membership en `client_sources` + `RegulatoryProfile`.
3. No guardar un Document por cliente si el binario es el mismo; usar `clientId` nullable en metadata o tabla de enlace `document_clients` en S6 si hace falta fan-out.

---

## 6. Storage paths (convención)

```text
raw/{sourceCode}/{yyyy}/{mm}/{dd}/{idempotencyKey}/...
derived/{documentId}/extracted.txt
derived/{documentId}/normalized.json
```

Manual upload admin (API actual):

```text
clients/{clientId}/...   // si query clientId
{folder}/...             // si query folder
```

---

## 7. Qué NO hacer en Sprint 4 (histórico)

- Contratos listos; la implementación de Redis/BullMQ es Sprint 5 (hecho: [jobs-crawl.md](./jobs-crawl.md)).
- No extract/normalize (S6) ni clasificación (S7) en el worker de crawl.

---

## 8. Definition of Done (#14)

- [x] State machine de procesamiento documentada
- [x] Payload/result de `source.crawl` documentados
- [x] Contratos adelantados extract/normalize para S6
- [x] Convención de paths e idempotencia

**Siguiente issue de implementación:** `S5: Redis + BullMQ workers and scheduler` (#15) + conectores (#16).

---

## 9. Checklist Sprint 5

1. [x] Cola `source.crawl` con tipos en `src/jobs/types.ts`
2. [x] Scheduler lee `Source` ACTIVE (`scheduleTime` / `scheduleWeekdays` / `scheduleTimezone`)
3. [x] Worker escribe artifacts (Supabase Storage o `data/crawl/`) + `job_runs`
4. [x] Tabla `job_runs` (migración `20260818150000_job_runs`)
5. [x] `idempotencyKey` (`{code}:{fecha}:scheduled` | `:admin`)
6. [x] Conectores piloto DOF, Diputados, Jalisco (GET crudo; HTTP genérico para otras ACTIVE)

**Siguiente:** Sprint 6 extract/normalize/dedup — **hecho:** [document-processing.md](./document-processing.md).
