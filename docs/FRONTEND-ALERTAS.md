# Frontend — Clasificación, informe y portal (`/alertas`)

**Audiencia:** backend y `norma-frontend`.  
**Hecho:** S7 — `GET /findings` en `/alertas` (nav: **Clasificación**).  
**Pendiente:** S8 editar/IA/excluir · S9 PDF+envío · S10 portal.  
Panel de rastreo: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md). Config `autoSend`: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md). Pipeline: [jobs.md](./jobs.md).

Este archivo gana si otro sitio habla de “inbox”, `/hallazgos` o envío a las 07:00.

---

## Flujo

```text
Clasificar (S7, hecho)
  → /alertas
       VCGA edita / pide más a la IA / excluye hallazgos          (S8)
  → clic «Generar PDF» (siempre un humano VCGA)                 (S9)
       si el día sigue classifying → no generar
       PDF = amarillo + naranja + rojo, no enviados (verde nunca)
  → cliente automático: ese clic también envía
     cliente normal: confirmar envío
  → correo a contacts[] del cliente
  → portal (S10): el caso es el PDF entero
       cerrar | análisis de producto | crisis → VCGA
```

El PDF no se regenera en cada tecla. Se puede regenerar mientras no esté `sent`.

| Actor | Quién | Qué |
|-------|--------|-----|
| VCGA (`ADMIN` / `ANALYST`) | Dueño de NORMA | Revisa, genera, confirma (o auto-envía) |
| Cliente (`CLIENT_USER`, piloto Arca) | Recibe el informe | Actúa sobre el **PDF entero** |

---

## Reglas fijas

1. `/alertas` es el loop. No hay `/hallazgos` ni cola por color.
2. El humano no ACK/correo por finding. Revisa lo que va al PDF y genera.
3. Candidatos: `YELLOW` \| `ORANGE` \| `RED` no incluidos en un PDF **enviado**. `GREEN` nunca.
4. Excluir un hallazgo lo saca solo de **este** PDF; puede volver.
5. Descartar el informe (antes de enviar): los hallazgos vuelven a candidatos.
6. Solo un PDF `sent` “quema” hallazgos. Un draft descartado no.
7. Misma norma, hash distinto (nuevo crawl): reabrir y el siguiente PDF dice **qué cambió**.
8. Generar PDF = clic humano. No hay job de empaque a las 07:00.
9. `autoSend`: generar = enviar. Si no: confirmar.
10. `requireHumanApproval` no manda este flujo. Solo el snapshot de `suggestedAction` al clasificar.
11. Destinatarios: `GET /clients/:id` → `contacts[]`.
12. IA de edición: solo texto del documento + perfil + prompt. No `POST /ai/ask`.
13. No generar si `GET /findings/progress` del día tiene alguna fuente `classifying`.
14. Cualquier VCGA (`ADMIN` / `ANALYST`) edita o excluye.
15. El caso del cliente es el PDF, no un hallazgo ni un tema de semanas.
16. S9 = enviar el PDF a contactos (no draft en Gmail de VCGA; no WhatsApp).

---

## Semanas

**S8** — `/alertas` deja de ser solo lectura: editar a mano, reescribir con IA, excluir de este PDF. **No** PDF.

**S9** — Generar / regenerar; `autoSend` o confirmar; descartar informe; correo; reabrir si hash cambia.

**S10** — `CLIENT_USER` ve historial de enviados; acciones sobre el PDF. Después: YouTube / X / Facebook, newsletter, WhatsApp.

| Vista | Ruta | Quién | Sprint |
|-------|------|-------|--------|
| Clasificación | `/alertas`, `/alertas/:findingId` | VCGA | 7 hecho; S8 edita |
| Generar PDF | modal / misma área | VCGA | 9 |
| `autoSend` | ficha cliente | ADMIN | 9 |
| Historial | p. ej. `/informes` | `CLIENT_USER` | 10 |

Copy: “informe”, “generar PDF”, “enviar”, “cliente automático”. Evitar “inbox”, “folio”.

---

## Lista — `GET /findings` (hecho)

Auth: `ADMIN` \| `ANALYST`. No-ADMIN: recorte por memberships.

**Array JSON.** Vacío = `[]`. **No** `{ items }`. Orden: `createdAt` desc. `limit` 1–200, default 50 (sin cursor). Piloto: `limit=200` por cliente.

Registrar `GET /findings/progress` **antes** que `GET /findings/:id` en Axios.

### Query

| Query | Qué |
|-------|-----|
| `clientId` | Un cliente. ANALYST sin membership → **403** |
| `sourceId` | Fuente (cuid). Si lo mandas, ignora `sourceCode` |
| `sourceCode` | `dof`, `diputados-gaceta`, … Desconocido → `[]` |
| `documentId` | Tras reclasificar |
| `impact` | `GREEN` \| `YELLOW` \| `ORANGE` \| `RED` |
| `status` | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` \| `DISMISSED`. Omitir = no filtrar. S7 crea `OPEN`. **No** son inbox: S8 usa exclude. |
| `limit` | 1–200; default 50 |

ANALYST sin `clientId`: ve todos sus clientes hasta el `limit`. Para un semáforo por cliente, manda `clientId`.

### Ítem

```json
{
  "id": "clx...",
  "title": "Etiquetado y vigilancia sanitaria",
  "impact": "ORANGE",
  "status": "OPEN",
  "suggestedAction": "Elaborar nota y monitorear avance",
  "justificationShort": "El decreto toca etiquetado de bebidas…",
  "client": { "id": "…", "name": "Arca Continental", "slug": "arca-continental" },
  "source": { "id": "…", "name": "Diario Oficial de la Federación", "code": "dof", "url": "https://www.dof.gob.mx/" },
  "document": {
    "id": "…",
    "filename": "page.html",
    "processingStatus": "CLASSIFIED",
    "url": "https://www.dof.gob.mx/nota_detalle.php?codigo=5797407"
  },
  "createdAt": "2026-09-01T18:00:00.000Z",
  "updatedAt": "2026-09-01T18:00:00.000Z"
}
```

`source`, `source.url`, `document.url` y `suggestedAction` pueden ser `null`.  
Enlace original = `document.url` (la nota/PDF). `source.url` es la portada del catálogo.  
Pintar: semáforo + título + cliente + fuente + link. `suggestedAction` es copy, no un botón de correo.  
Conteos de color: agrupar este array. El dashboard usa `GET /findings/progress`.

### Detalle — `GET /findings/:id`

Lo mismo **más** `justification`, `description` (nullable), `aiMeta` (`model`, `promptVersion`, `relevant`, `usage`). No mostrar tokens. `404` si no existe o ANALYST sin membership (no es 403).

### Reclasificar — `POST /documents/:id/classify`

Solo ADMIN. Body vacío. **201** no trae el finding. Canónicos en `READY_FOR_AI` o `CLASSIFIED`. `DEDUPED` → `400`. `503` sin Redis o sin `OPENAI_API_KEY`.

Poll: 15 s / 45 s, máx. ~8 intentos. `GET /findings?documentId=` o `GET /documents/:id` hasta `CLASSIFIED`. No pollar listas grandes.

El front debe aceptar `processingStatus: "CLASSIFIED"` en documentos (si no, desaparecen del registro).

`[]` es válido hasta que haya crawl + classify + Arca en `client_sources` + `OPENAI_API_KEY`.

---

## API prevista (S8–S10 — no existe hoy)

### S8

| Método | Ruta | Quién | Qué |
|--------|------|--------|-----|
| `PATCH` | `/findings/:id` | ADMIN / ANALYST | Edición manual (no cambia `impact` salvo que lo pidamos) |
| `POST` | `/findings/:id/exclude` | ADMIN / ANALYST | Fuera del **próximo** PDF; no es para siempre |
| `POST` | `/findings/:id/rewrite` | ADMIN / ANALYST | `{ prompt }`. OpenAI solo ve el documento. Traza en `aiMeta` |

No hay PATCH de status ACK/RESOLVE. `DISMISSED` no sustituye exclude.

### S9

| Método | Ruta | Quién | Qué |
|--------|------|--------|-----|
| `POST` | `/reports` | ADMIN / ANALYST | Genera PDF. **400/409** si el día sigue `classifying`. Y/O/R no enviados y no excluded |
| `POST` | `/reports/:id/regenerate` | ADMIN / ANALYST | Solo si no está `sent` |
| `POST` | `/reports/:id/send` | ADMIN / ANALYST | Confirmar (cliente no automático) |
| `POST` | `/reports/:id/discard` | ADMIN / ANALYST | Draft fuera; hallazgos vuelven |
| `GET` | `/reports`, `/reports/:id` | VCGA o `CLIENT_USER` (solo `sent` de su cliente) | Detalle + archivo |

`autoSend: true` → `POST /reports` deja `sent` y manda correo. Estados: `draft` → `sent` \| `discarded`.

### S10

| Método | Ruta | Quién | Qué |
|--------|------|--------|-----|
| `POST` | `/reports/:id/close` | `CLIENT_USER` | Cierra el caso |
| `POST` | `/reports/:id/product-analysis` | `CLIENT_USER` | Queda para VCGA |
| `POST` | `/reports/:id/crisis` | `CLIENT_USER` | Queda para VCGA |

---

## Qué no hacer

- No inventar `/hallazgos`. No pintar delivery como tablero.
- No ACK/RESOLVE por color. No PDF por cada edición.
- No job de envío a las 07:00. No portal en S8/S9.
- No WhatsApp, newsletter ni conectores sociales en S8–S10.
- No reutilizar `POST /ai/ask` para reescribir un hallazgo.
