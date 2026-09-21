# Frontend — Admin (fuentes, cliente, catálogo)

**Audiencia:** `norma-frontend`. Pantallas **ya implementadas** en API.  
HTTP vivo: Swagger `http://localhost:3000/docs`.  
Auth: `Authorization: Bearer <accessToken>` de `POST /auth/login`. Solo **ADMIN** escribe catálogo.

`frequency` y `type` están muertos (`400`). No hay PostgREST.

Panel de rastreo: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).  
`/alertas` e informe: [FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md).

---

## Fuentes

`GET /sources` queries: `status`, `category`, `platform`, `jurisdiction`, `stateCode`, `clientId`, `q`.

### Shape

```json
{
  "id": "clx...",
  "code": "jalisco-congreso",
  "name": "Congreso de Jalisco",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.congresojal.gob.mx/",
  "jurisdiction": "STATE",
  "stateCode": "JAL",
  "schedule": {
    "time": "07:00",
    "timezone": "America/Mexico_City",
    "weekdays": [1, 2, 3, 4, 5]
  },
  "sections": [["Gaceta"], ["Iniciativas"]],
  "keywordsGuide": ["bebidas", "salud"],
  "searchFocus": ["Bebidas", "alimentos", "publicidad"],
  "notes": "Alta prioridad",
  "status": "ACTIVE",
  "clients": [{ "id": "...", "name": "...", "slug": "...", "status": "ACTIVE" }]
}
```

Federales (`dof`, `diputados-gaceta`): `jurisdiction: FEDERAL`, `stateCode: null`.

| Campo | Valores |
|-------|---------|
| `category` | `OFFICIAL` \| `MEDIA` \| `SOCIAL` |
| `platform` | `WEB` \| `YOUTUBE` \| `X` \| `TIKTOK` \| `FACEBOOK` \| `INSTAGRAM` \| `OTHER` |
| `jurisdiction` | `FEDERAL` \| `STATE` |
| `stateCode` | ISO 3166-2:MX sin prefijo: `AGU BCN BCS CAM CHP CHH CMX COA COL DUR GUA GRO HID JAL MEX MIC MOR NAY NLE OAX PUE QUE ROO SLP SIN SON TAB TAM TLA VER YUC ZAC` |

`weekdays`: 1 = lunes … 7 = domingo. Default `[1,2,3,4,5]` a las `07:00` `America/Mexico_City`.

| Campo | Create | Patch |
|-------|--------|-------|
| `name`, `category`, `platform` | sí | sí |
| `code` | sí (único, kebab `[a-z0-9-]`) | no |
| `url` | no | sí (`null` limpia) |
| `jurisdiction` | default FEDERAL | sí; STATE exige `stateCode` |
| `stateCode` | no | sí (`null` limpia) |
| `schedule` | no | `{ time, timezone?, weekdays? }` |
| `sections` | no | `string[][]` |
| `keywordsGuide`, `searchFocus` | no | `string[]`; omitir = no tocar; `[]` = vaciar; no `null` |
| `notes` | no | sí (`null` limpia) |
| `clientIds` | opcional | **no** (400) |

Eliminados: `frequency`, `type`, `section`, `config`.

UI: Federal vs Estatal + selector de entidad; horario de rastreo (no combo daily/weekly). En operación no listar INACTIVE como “monitoreando”.

### Seed / crawl ACTIVE

32 congresos en seed (`jalisco-congreso` conserva el code). **ACTIVE (crawl):** AGU, BC, BCS, Campeche, Chihuahua, Jalisco + federales `dof`, `diputados-gaceta`. El resto INACTIVE. Scheduler ignora INACTIVE.

INACTIVE de catálogo (activar a mano): `senado-gaceta`, `mananera-presidencia`, `cofepris`, `profeco`, `conamer`. YouTube / X / Facebook = MVP **después de S10** ([PRODUCT.md](./PRODUCT.md)).

---

## Cliente ↔ fuentes (N:N)

| Acción | Request |
|--------|---------|
| Crear cliente | `POST /clients` opcional `sourceIds: string[]` |
| Editar vínculos | `PATCH /clients/:id` con `sourceIds` (**reemplaza** el set; omitir = no tocar; `[]` = quitar todas) |
| Crear fuente | `POST /sources` opcional `clientIds: string[]` |
| Editar fuente | `PATCH /sources/:id` **no** acepta `clientIds` |
| Listar fuentes de un cliente | `GET /sources?clientId=` |
| Detalle | `GET /clients/:id` → `sources`; `GET /sources/:id` → `clients` |

IDs inválidos → `400`. Para selects: `GET /sources?status=ACTIVE` y `GET /clients?status=ACTIVE`.

Crawl (solo ADMIN; Redis en Nest, no en el front):

| Método | Ruta | Body |
|--------|------|------|
| `GET` | `/jobs/status` | — |
| `POST` | `/jobs/crawl` | `{ "sourceCode": "dof" }` o `{ "sourceId": "..." }` |
| `POST` | `/jobs/crawl/all` | — |

`configured: false` → banner; no pintar HTML crudo aquí. `queues.*.waiting` alto tras «Rastrear todo» es el pico encolado, no un error. `worker: true` = hay consumidor BullMQ (aunque el HTTP no procese jobs). Detalle: [jobs.md](./jobs.md). Panel: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md).

---

## Fiscales y contactos

Bloque `fiscal` (create/PATCH) → respuesta `fiscalData`: `legalName`, `rfc` (12–13, mayúsculas), `postalCode` (5 dígitos), `cfdi`, `taxRegime`.

`contacts[]`: `name`, `phone`, `email?`. En PATCH, `contacts` **reemplaza** el set (`[]` borra todos). Omitir = no tocar.

Rutas dedicadas opcionales: `GET/POST /clients/:clientId/contacts`, `GET/PATCH /contacts/:id`, activate/deactivate.

Destinatarios del PDF (S9) = estos `contacts[]`.

---

## Entrega / semáforo (config, no lista)

**No** es `/alertas`. `autoSend` (S9): si es `true`, el clic «Generar PDF» también envía. Default `false`.

`requireHumanApproval` **no** abre inbox ni decide el envío. El `schedule` de delivery es crawl/recordatorio, no un job que empaca el PDF a las 07:00.

```json
{
  "emailEnabled": true,
  "whatsappEnabled": false,
  "autoSend": false,
  "schedule": { "time": "07:00", "timezone": "America/Mexico_City", "weekdays": [1, 2, 3, 4, 5] },
  "impactActions": [
    { "impact": "GREEN", "suggestedAction": "Registrar como contexto", "notifyInbox": true, "sendEmail": false, "sendWhatsapp": false, "requireHumanApproval": false },
    { "impact": "YELLOW", "suggestedAction": "Dar seguimiento", "notifyInbox": true, "sendEmail": true, "sendWhatsapp": false, "requireHumanApproval": true },
    { "impact": "ORANGE", "suggestedAction": "Elaborar nota y monitorear avance", "notifyInbox": true, "sendEmail": true, "sendWhatsapp": false, "requireHumanApproval": true },
    { "impact": "RED", "suggestedAction": "Alertar de inmediato y preparar nota ejecutiva", "notifyInbox": true, "sendEmail": true, "sendWhatsapp": true, "requireHumanApproval": true }
  ]
}
```

| Acción | Request |
|--------|---------|
| Crear | `POST /clients` opcional `delivery` (si omites, defaults) |
| Editar | `PATCH /clients/:id` con `delivery` (upsert; omitir = no tocar) |
| Leer | `GET /clients/:id` → `deliveryConfig` o `GET /clients/:id/delivery` |
| Dedicado | `PATCH /clients/:id/delivery` |

`impactActions` si se envía: **los 4 niveles**, sin duplicados. WhatsApp off en S8–S10. Verde nunca entra al PDF.

---

## Asistente de catálogo

**No** clasifica normas ni reescribe hallazgos. Eso es classify / `POST /findings/:id/rewrite` ([FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)).

Env backend: `OPENAI_API_KEY` (vacío → `503`), `OPENAI_MODEL` default `gpt-4o-mini`.

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/ai/status` | `{ configured, model }` — si `false`, deshabilitar envío |
| `POST` | `/ai/ask` | `{ "question": "…", "clientId": "opcional" }` |

`question`: 3–2000 chars. Roles: cualquier autenticado. No-ADMIN: catálogo filtrado por memberships.

Respuesta: `{ answer, model, catalog: { clientCount, profileCount, sourceCount, scopedToClientId } }`. Mostrar `answer`; `catalog` puede ir en un pie. No mostrar tokens.

`503` sin key o OpenAI caído. `403` sin acceso al `clientId`.
