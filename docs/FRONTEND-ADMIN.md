# Frontend — Admin (fuentes, cliente, catálogo)

**Audiencia:** `norma-frontend`. Pantallas **ya implementadas** en API.  
HTTP vivo: Swagger `http://localhost:3000/docs`.  
Auth: `Authorization: Bearer <accessToken>` de `POST /auth/login`. **ADMIN** y **ANALYST** escriben clientes, perfiles, contactos, delivery y fuentes. El catálogo de fuentes es global (no se filtra por dueño). Un ANALYST solo lista y edita sus clientes (`ClientMembership`; al crear uno, queda como miembro). Usuarios: solo ADMIN.

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

Crawl (`ADMIN` \| `ANALYST`; Redis en Nest, no en el front):

| Método | Ruta | Body |
|--------|------|------|
| `GET` | `/jobs/status` | — |
| `POST` | `/jobs/crawl` | `{ "sourceCode": "dof" }` o `{ "sourceId": "..." }` |
| `POST` | `/jobs/crawl/all` | — |

`configured: false` → banner; no pintar HTML crudo aquí. HUD de rastreo: `POST /jobs/crawl/all` / `extract/all` / `classify/all` (detalle [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md)). `POST /jobs/crawl/all` **no** recrawlea fuentes que hoy ya tengan crawl SUCCESS. `queues.*.waiting` alto es el pico encolado **solo de las que faltaban**. `worker: true` = hay consumidor BullMQ. Detalle: [jobs.md](./jobs.md).

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

NORMA en el chat flotante del backoffice. **No** clasifica normas ni reescribe hallazgos. Eso es classify / `POST /findings/:id/rewrite` ([FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)). **No** crea clientes, **no** guarda el formulario y **no** lanza rastreo.

Env: `OPENAI_API_KEY` (vacío → `503`), `OPENAI_MODEL` default `gpt-4o-mini`. `WEB_SEARCH_ENABLED=off` apaga la búsqueda pública del borrador de perfil (sin resultados, o apagada, `draft` es null).

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/ai/status` | `{ configured, model }` — si `false`, deshabilitar envío |
| `POST` | `/ai/ask` | Ver cuerpo. También responde en `/catalog-ai/ask` |

```json
{
  "question": "¿Qué fuentes tiene Arca vinculadas?",
  "clientId": null,
  "draftTarget": null,
  "profileSeed": null,
  "sourceUrl": null,
  "messages": [
    { "role": "user", "content": "¿Qué clientes tengo activos?" },
    { "role": "assistant", "content": "En tus registros consta Arca Continental, activo." }
  ]
}
```

`question`: 3–2000, la burbuja nueva, sin el catálogo. `clientId` opcional; el flotante no lo manda. `messages`: hasta 15 burbujas ya mostradas (`user` o `assistant`, texto ≤ 2000). Si llegan más, se usan las 15 últimas. Un rol distinto o un texto que no es string → `400`.

`draftTarget`: `"profile"`, `"source"` o ausente. El front lo manda solo si ese formulario está abierto y el rol puede editar (`ADMIN` o `ANALYST`). `profileSeed` (`companyName` obligatorio, `description` opcional) solo con `"profile"`; sin `companyName` → `400`. `sourceUrl` http(s) solo con `"source"`. Sin URL no hay descarga y `draft` es null.

El catálogo viaja una vez por llamada. Clientes: solo los de la persona (`ADMIN` ve todos). Fuentes: el catálogo global, como `/fuentes`, sin nombrar clientes ajenos. El perfil activo incluye `descripcion`. Tope: 50 clientes y 90 fuentes.

Perfil: antes de la completación se busca `companyName` en la web pública. Keywords, categorías y productos salen de esos resultados. El nombre queda en el que escribió la persona. Sin resultados, o con la búsqueda apagada, `draft` es null y no se rellena de memoria.

Fuente nueva: un solo `fetchPage` de `sourceUrl` (timeout 25 s, tope de bytes del crawl). No sigue enlaces ni encola rastreo. `keywordsGuide` y `searchFocus` salen de ese HTML, en materia sanitaria. PDF, timeout o página ilegible → `draft` null.

Respuesta: `{ answer, model, catalog: { clientCount, profileCount, sourceCount, scopedToClientId }, draft }`. Mostrar `answer`. El pie lee `clientCount`, `profileCount` y `sourceCount`. `draft` no se pinta; el front lo escribe en el formulario abierto. Sin `draftTarget`, `draft` es null. Guardar sigue siendo Crear perfil, Guardar cambios o el alta de la fuente.

`401` sin token. `400` body inválido. `403` `clientId` ajeno. `503` sin key o con OpenAI caído. `500` si el modelo no deja una respuesta usable.
