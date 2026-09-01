# Frontend — Hallazgos y semáforo (`GET /findings`)

**Audiencia:** `norma-frontend`. Feature nueva: `features/findings/` (o equivalente).  
**Backend:** Sprint 7 implementado. Local: `http://localhost:3000` vía [docker.md](./docker.md) (`docker compose up --build`).

Esto **no** es `/alertas`. Esa ruta (si existe) lee la **config** del semáforo: [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md) (`GET /clients/:id/delivery`). No reescribir Alertas para mostrar hallazgos: se pierde la matriz de acciones por color.

S7 = lista + detalle de normas ya clasificadas. **No** inbox: no hay `PATCH`, ACK, correo ni WhatsApp (S8).

Jobs: [DOCUMENT-JOB-CONTRACTS.md](./DOCUMENT-JOB-CONTRACTS.md) §4.4. Panel de rastreo: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

## Dónde vive en la UI

El backend no impone path. Sugerencia piloto:

| Vista | Ruta front (sugerida) | API |
|-------|------------------------|-----|
| Config semáforo / canales | la que ya es `/alertas` | `GET /clients/:id/delivery` |
| Hallazgos del cliente | p. ej. `/hallazgos` o `/clientes/:clientId/hallazgos` | `GET /findings?clientId=` |
| Detalle de un hallazgo | p. ej. `/hallazgos/:id` | `GET /findings/:id` |
| Texto del documento | ficha ya existente | `GET /documents/:id` |

Deep link: `GET /findings/:id` basta; el `clientId` viene en el body. Query `?clientId=` en la lista para el semáforo **de un** cliente.

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`. Roles: `ADMIN` \| `ANALYST`. Sin token → `401`.

No-ADMIN: la lista se recorta a memberships. ANALYST **no** ve el botón reclasificar (el API responde `403`).

## Endpoints

| Método | Ruta | Quién | Uso |
|--------|------|--------|-----|
| `GET` | `/findings` | ADMIN / ANALYST | Lista (array JSON) |
| `GET` | `/findings/:id` | igual | Detalle |
| `POST` | `/documents/:id/classify` | **solo ADMIN** | Encola classify; **no** devuelve el finding |

No hay `PATCH /findings/:id`. No pintar ACK/RESOLVE.

En Axios son dos URLs distintas (`/findings` vs `/findings/${id}`). No hace falta “registrar la lista antes del detalle”.

## Lista — `GET /findings`

**Sobre:** un **array JSON**. Vacío = `[]`. **No** `{ items }`. No uses `unwrapList` pensando en un wrapper.

**Orden:** `createdAt` descendente (más nuevo primero).

**Tope:** `limit` 1–200; **default 50**. Sin cursor ni offset. Si hay más de `limit` filas, el resto **no llega** (corte silencioso). Para el piloto: `limit=200` en la vista de un cliente.

### Query (todas opcionales)

| Query | Qué |
|-------|-----|
| `clientId` | Un cliente. ANALYST sin membership → **403** (`No access to this client`) |
| `sourceId` | Una fuente (cuid). Si mandas este, **ignora** `sourceCode` |
| `sourceCode` | Código de catálogo (`dof`, `diputados-gaceta`, …). Combo del filtro de fuente |
| `documentId` | Un documento (útil tras reclasificar) |
| `impact` | `GREEN` \| `YELLOW` \| `ORANGE` \| `RED` |
| `status` | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` \| `DISMISSED`. **Si omites, Nest no filtra.** S7 solo crea `OPEN`; manda `status=OPEN` si quieres ese recorte explícito (S8 mezclará otros) |
| `limit` | 1–200; default 50 |

ANALYST sin `clientId`: ve findings de **todos** sus clientes (hasta el `limit`). Para un semáforo por cliente, **manda `clientId`**.

### Item (lista)

```json
[
  {
    "id": "clx...",
    "title": "Etiquetado y vigilancia sanitaria",
    "impact": "ORANGE",
    "status": "OPEN",
    "suggestedAction": "Elaborar nota y monitorear avance",
    "justificationShort": "El decreto toca etiquetado de bebidas…",
    "client": { "id": "…", "name": "Arca Continental", "slug": "arca-continental" },
    "source": {
      "id": "…",
      "name": "Diario Oficial de la Federación",
      "code": "dof",
      "url": "https://www.dof.gob.mx/"
    },
    "document": {
      "id": "…",
      "filename": "page.html",
      "processingStatus": "CLASSIFIED",
      "url": "https://www.dof.gob.mx/nota_detalle.php?codigo=5797407"
    },
    "createdAt": "2026-09-01T18:00:00.000Z",
    "updatedAt": "2026-09-01T18:00:00.000Z"
  }
]
```

Tipos TypeScript (nullables de verdad):

```ts
type FindingImpact = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
type FindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

type FindingListItem = {
  id: string;
  title: string;
  impact: FindingImpact;
  status: FindingStatus;
  suggestedAction: string | null;
  justificationShort: string; // máx. 240 chars
  client: { id: string; name: string; slug: string };
  source: {
    id: string;
    name: string;
    code: string;
    url: string | null; // homepage del catálogo
  } | null;
  document: {
    id: string;
    filename: string;
    processingStatus: string; // ver CLASSIFIED abajo
    url: string | null; // página/PDF rastreados (abrir en pestaña)
  };
  createdAt: string; // ISO
  updatedAt: string;
};
```

`source`, `source.url`, `document.url` y `suggestedAction` **pueden ser `null`**. No asumir objeto fuente siempre.

**Enlace original:** `document.url` es la página o PDF de donde salió el texto. `source.url` es la portada del catálogo (DOF, gaceta, …), no la nota. Si `document.url` es null, no inventar un href con `source.url` como si fuera el mismo documento.

Filtro de fuente en UI: combo con `GET /sources` (o las del cliente) → `GET /findings?clientId=&sourceCode=dof`. `sourceCode` desconocido → `[]`, no 400.

Pintar: **semáforo (`impact`) + título + cliente + fuente + link `document.url`**. `suggestedAction` es copy (snapshot al clasificar), no un botón que envíe correo.

| `impact` | Uso UI |
|----------|--------|
| `GREEN` | Contexto / poco impacto |
| `YELLOW` | Seguimiento |
| `ORANGE` | Nota y monitoreo |
| `RED` | Alerta |

Conteos “cuántos rojos” = agrupar este array en el cliente. No hay `GET /findings/summary`.

## Detalle — `GET /findings/:id`

Misma forma que el ítem de lista, **más**:

```json
{
  "justification": "El decreto toca etiquetado de bebidas, alineado al perfil de Arca Continental.",
  "description": "misma justificación recortada o null",
  "aiMeta": {
    "model": "gpt-4o-mini",
    "promptVersion": "classify-v1",
    "relevant": true,
    "usage": {
      "promptTokens": 12,
      "completionTokens": 40,
      "totalTokens": 52
    }
  }
}
```

- `description` y `aiMeta` pueden ser `null`.
- `aiMeta.relevant`: si el modelo dijo que el texto aplica al perfil. Opcional en UI; **no** mostrar `usage` / tokens al consultor.

| Código | Cuándo |
|--------|--------|
| `401` | Sin token |
| `404` | No existe **o** ANALYST sin membership de ese cliente (no es 403) |

## Reclasificar — `POST /documents/:id/classify`

Body: **vacío**. Solo ADMIN.

Respuesta **201** (Nest POST) con algo así. **No** trae el finding:

```json
{
  "id": "clxdocumento…",
  "processingStatus": "READY_FOR_AI",
  "enqueued": true,
  "skipped": false,
  "idempotencyKey": "clxdocumento…:classify:v1"
}
```

`processingStatus` es el estado **actual** del documento (sigue `READY_FOR_AI` o ya `CLASSIFIED`). El worker corre **después**. `enqueued: false` + `skipped: true` = ya había un job en vuelo y no se forzó de nuevo.

Documento canónico en `READY_FOR_AI` o `CLASSIFIED`. Duplicados (`DEDUPED`) → `400`.

| Código | Cuándo |
|--------|--------|
| `401` | Sin token |
| `403` | No ADMIN |
| `404` | Documento no existe |
| `400` | Duplicado o estado no clasificable |
| `503` | Sin `REDIS_URL` o sin `OPENAI_API_KEY` |

### Poll (no infinita)

Cuando `enqueued: true`, refrescar **poco**:

1. `GET /findings?documentId={id}&limit=20` hasta que haya fila(s), **o**
2. `GET /documents/{id}` hasta `processingStatus === "CLASSIFIED"` (si no hubo clientes ligados, queda `CLASSIFIED` **sin** findings).

Intervalo: **mismo criterio que rastreo** — 15 s si sigue en curso, 45 s si no. Máximo ~8 intentos y parar con copy “sigue procesando; recarga”. **No** pollar `GET /documents?limit=800` ni `GET /findings` cada 2 s (429/502 en Render).

Upsert por `documentId` + `clientId`. El `update` **no resetea** `status`: si en S8 el hallazgo estaba ACK, reclasificar cambia título/impacto y deja ACK. En S7 todo es `OPEN`.

## Documentos: sumar `CLASSIFIED`

`GET /documents` y `GET /documents/:id` ya pueden devolver `"processingStatus": "CLASSIFIED"`.  
`GET /documents/progress` usa el ejecutivo `status: "classified"` / label `Clasificada`.

**Extender el union del front.** Si `documents-api.ts` tira status desconocido, las páginas clasificadas **desaparecen** del registro.

Prisma / query: `RECEIVED` \| `EXTRACTED` \| `NORMALIZED` \| `HASHED` \| `DEDUPED` \| `READY_FOR_AI` \| **`CLASSIFIED`** \| `FAILED` \| `DISCARDED`.

Detalle: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

## Lista vacía

`[]` es válido. Hasta que corra crawl + extract + classify (Arca en `client_sources` + `OPENAI_API_KEY`), no hay filas. La UI vacía no es un bug de contrato.

## Qué no hacer

- No reutilizar `/alertas` ni `GET /clients/:id/delivery` como lista de hallazgos.
- No inbox ni cambio de `status`.
- No Resend / WhatsApp.
- No mostrar tokens al consultor.
- No clasificar HTML de redes ni YouTube.
