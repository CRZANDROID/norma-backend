# Frontend — Clasificación, informe y portal (`/alertas`)

**Audiencia:** backend y `norma-frontend`.  
**Hecho:** S7 — `GET /findings` en `/alertas` (nav: **Clasificación**). S8 — editar / IA / excluir.  
**Pendiente:** S9 envío/`autoSend` · S10 portal `CLIENT_USER`. PDF draft: generar en `/alertas`; ver / descargar / regenerar en `/informes`.  
Pastillas de lote en Clasificación: Incluidos / Excluidos / Enviados.  
Panel de rastreo: [FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md). Config `autoSend`: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md). Pipeline: [jobs.md](./jobs.md).

Este archivo gana si otro sitio habla de “inbox”, `/hallazgos` o envío a las 07:00.

---

## Flujo

```text
Clasificar (S7, hecho)
  → /alertas
       VCGA edita / pide más a la IA / excluye hallazgos          (S8, hecho)
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

**S8** — `/alertas` deja de ser solo lectura: editar a mano, reescribir con IA, excluir de este PDF. **Hecho (API).** **No** PDF.

**S9** — Generar / regenerar; `autoSend` o confirmar; descartar informe; correo; reabrir si hash cambia.

**S10** — `CLIENT_USER` ve historial de enviados; acciones sobre el PDF. Después: YouTube / X / Facebook, newsletter, WhatsApp.

| Vista | Ruta | Quién | Sprint |
|-------|------|-------|--------|
| Clasificación | `/alertas`, `/alertas/:findingId` | VCGA | 7 lista; S8 edita; lote Incluidos/Excluidos/Enviados |
| Generar PDF | `/alertas` (botón) | VCGA | 9 |
| Informes VCGA | `/informes`, `/informes/:reportId` | VCGA | 9 — borradores / enviados |
| `autoSend` | ficha cliente | ADMIN | 9 |
| Historial cliente | `/informes` (solo enviados) | `CLIENT_USER` | 10 |

Copy: “informe”, “generar PDF”, “enviar”, “cliente automático”. Evitar “inbox”, “folio”.

---

## Lista — `GET /findings` (hecho)

Auth: `ADMIN` \| `ANALYST`. No-ADMIN: recorte por memberships.

**Ruptura:** ya no es un array en la raíz. Es `{ dateFrom, dateTo, page, limit, total, totalPages, counts, items }`. Vacío = `items: []`, `total: 0`. Orden: `createdAt` desc, luego `id` desc.

Una sola lista paginada. **No** hay “ver historial”.

- Sin `dateFrom`/`dateTo` → **toda** la lista, más nuevos primero.
- `dateFrom` / `dateTo` (`YYYY-MM-DD`, inclusive, `America/Mexico_City`) → rango. Se puede mandar solo uno.
- `page` (default 1) + `limit` (default 50, máx. 200; el front elige el tamaño).
- `total` / `totalPages` = la lista **ya filtrada** (incluye `impact` / `excluded` / `lote` si los mandaste).
- `counts` de color = pastillas Todos / Crítico / Alto / Medio / Informativo. **No** se recortan por `impact`, `excluded` ni `lote`.
- `counts.included` / `excluded` / `sent` = pastillas de lote. Tampoco las recorta el semáforo.
- Scroll infinito: el front pide `page=2`, `page=3`… y concatena `items`. El back no tiene `limit=all`.
- Páginas numeradas: mismo contrato; usa `totalPages` para saltar.

Registrar `GET /findings/progress` **antes** que `GET /findings/:id` en Axios.

### Query

| Query | Qué |
|-------|-----|
| `clientId` | Un cliente. ANALYST sin membership → **403**. Mandarlo en `/alertas` |
| `sourceId` | Fuente (cuid). Si lo mandas, ignora `sourceCode` |
| `sourceCode` | `dof`, `diputados-gaceta`, … Desconocido → `items: []` |
| `documentId` | Tras reclasificar |
| `impact` | Filtra **items** (`GREEN` \| `YELLOW` \| `ORANGE` \| `RED`). No cambia `counts` |
| `excluded` | `true` / `false` — fuera o dentro del próximo informe. Compatibilidad. Si mandas `lote`, no lo uses (**400**) |
| `lote` | `incluidos` \| `excluidos` \| `enviados`. Cubeta del próximo PDF. `incluidos` = mismos candidatos que `POST /reports` |
| `status` | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` \| `DISMISSED`. Omitir = no filtrar |
| `dateFrom` | Inicio de rango `YYYY-MM-DD`. Omitir = sin piso |
| `dateTo` | Fin de rango `YYYY-MM-DD` (inclusive). Omitir = sin techo |
| `page` | Página 1-based. Default 1 |
| `limit` | Tamaño de página 1–200; default 50 |

`dateFrom` > `dateTo` → **400**.

### Respuesta

```json
{
  "dateFrom": null,
  "dateTo": null,
  "page": 1,
  "limit": 50,
  "total": 80,
  "totalPages": 2,
  "counts": {
    "total": 80,
    "red": 0,
    "orange": 0,
    "yellow": 0,
    "green": 80,
    "included": 0,
    "excluded": 0,
    "sent": 0
  },
  "items": [
    {
      "id": "clx...",
      "title": "Sin relevancia operativa",
      "impact": "GREEN",
      "status": "OPEN",
      "suggestedAction": "Registrar como contexto",
      "excludedFromNextReport": false,
      "justificationShort": "…",
      "client": { "id": "…", "name": "Arca Continental", "slug": "arca-continental" },
      "source": { "id": "…", "name": "Diario Oficial de la Federación", "code": "dof", "url": "https://www.dof.gob.mx/" },
      "document": {
        "id": "…",
        "filename": "page.html",
        "processingStatus": "CLASSIFIED",
        "url": "https://www.dof.gob.mx/nota_detalle.php?codigo=5797407"
      },
      "createdAt": "2026-09-07T18:00:00.000Z",
      "updatedAt": "2026-09-07T18:00:00.000Z"
    }
  ]
}
```

Pastillas: Todos = `counts.total`, Crítico = `red`, Alto = `orange`, Medio = `yellow`, Informativo = `green`. Lote: Incluidos = `included`, Excluidos = `excluded`, Enviados = `sent`. Default de la lista: Todos (sin `lote`).

`source`, `source.url`, `document.url` y `suggestedAction` pueden ser `null`. Enlace original = `document.url`.

### Detalle — `GET /findings/:id`

Lo mismo **más** `justification` (briefing en Markdown: acto, cifras, listas, plazo si consta; `promptVersion` `classify-v2`), `description` (nullable; recorte ~2000), `aiMeta` (`model`, `promptVersion`, `relevant`, `usage`, y si hubo reescritura `lastRewrite`). No mostrar tokens. La lista solo trae `justificationShort` (~240 caracteres): el detalle largo va aquí. `404` si no existe o ANALYST sin membership (no es 403).

### Reclasificar — `POST /documents/:id/classify`

Solo ADMIN. Body vacío. **201** no trae el finding. Canónicos en `READY_FOR_AI` o `CLASSIFIED`. `DEDUPED` → `400`. `503` sin Redis o sin `OPENAI_API_KEY`.

Lote de una fuente (rastreo ya hecho, cliente ligado después): `POST /jobs/classify` `{ sourceId }`. **400** sin clientes. Poll igual que abajo.

Poll: 15 s / 45 s, máx. ~8 intentos. `GET /findings?documentId=` (lee `items`) o `GET /documents/:id` hasta `CLASSIFIED`. No pollar listas grandes.

El front debe aceptar `processingStatus: "CLASSIFIED"` en documentos (si no, desaparecen del registro).

`items: []` es válido hasta que haya crawl + classify + Arca en `client_sources` + `OPENAI_API_KEY`.

---

## Loop VCGA — S8 (hecho)

Auth: `ADMIN` \| `ANALYST`. ANALYST sin membership del cliente del hallazgo → **404** (no 403). Respuesta = el **detalle**.

| Método | Ruta | Qué |
|--------|------|-----|
| `PATCH` | `/findings/:id` | `{ title? , justification? , impact? }` (al menos uno). **No** cambia `status`. Title máx. 160. `impact` = semáforo a mano. |
| `POST` | `/findings/:id/exclude` | `excludedFromNextReport: true`. Solo `YELLOW` \| `ORANGE` \| `RED`. `GREEN` → **400**. Idempotente. **200**. |
| `POST` | `/findings/:id/include` | Vuelve a entrar al próximo informe (`false`). **200**. |
| `POST` | `/findings/:id/rewrite` | `{ prompt }` (1–2000). Plantilla classify-v2 + tu indicación. Si pides “además”, conserva; si sobreescribes, igual debe traer fecha/acto. **No** `POST /ai/ask`. No cambia `impact`. Devuelve `rewriteNote` + `aiMeta.lastRewrite` (`rewrite-v6`). **200**. **422** si el pedido no se sostiene con el documento. `503` sin `OPENAI_API_KEY`. |

No hay PATCH de status ACK/RESOLVE. `DISMISSED` no sustituye exclude.

`exclude` saca el hallazgo **solo del próximo PDF** (S9). Hasta entonces el flag vive en el finding. S9, al descartar el draft, limpia el flag.

### Semáforo a mano

`PATCH { "impact": "RED" }` con `GREEN` \| `YELLOW` \| `ORANGE` \| `RED`. Otro valor → **400**. Solo el `PATCH` mueve el semáforo: `rewrite` nunca reclasifica.

Al pasar a `GREEN` el back limpia `excludedFromNextReport` (los informativos no entran al informe, así que excluirlos no significa nada). Refresca la pastilla del hallazgo con la respuesta, no con lo que mandaste.

### Rewrite: aviso de lo que no se pudo

**200 con cambio parcial** → el detalle más `rewriteNote`: `string` (≤240) o `null`. Es lo que la IA **no** pudo aplicar y por qué — dato ausente del documento, referencia que no ubicó, o un cambio de semáforo que no le toca. Muéstralo como aviso/toast; **no** va dentro del briefing porque el PDF de S9 imprime `justification`.

**422 pedido no aplicable** → cuando la IA reporta que la indicación no se sostiene con el documento (`applied: "none"`) o devuelve el briefing idéntico. No se guarda nada y el error trae el limitante real en `message`:

```json
{
  "statusCode": 422,
  "message": "No se aplicó el cambio: El documento no publica la fecha de entrada en vigor.",
  "error": "Unprocessable Entity"
}
```

Pinta ese `message` tal cual: ya viene redactado para VCGA. Si el modelo no explicó el motivo, el back manda “…no explicó por qué. Sé más específico…”. El hallazgo queda intacto (`updatedAt` no se mueve), así que no recargues la lista: solo muestra el aviso y deja el prompt escrito para que lo corrija.

El 422 cubre el caso de pedir un dato que la gaceta no publica (autor por guía, fecha de vigencia que el acto no fija, contenido de un anexo solo enlazado). El prompt le prohíbe rellenarlo con “lo más cercano” —la dependencia que publica no es el autor— y le da `applied: "none"` como salida legítima en vez de aproximar.

**Límite conocido:** el 422 solo salta cuando el modelo reconoce el hueco. Si el pedido *parece* cumplible con lo que hay (pedir el autor de cada guía cuando el documento solo nombra a la dependencia), puede rellenar con ese dato y reportar éxito. El rewrite es asistente de redacción, no fuente de verdad: la UI debe dejar claro que VCGA revisa el resultado antes de que entre al informe, y corrige con `PATCH`. Ayuda mucho que el prompt diga la restricción en voz alta (“COFEPRIS no es el autor”).

El borrador que edita la IA es **el vigente**, incluido lo que VCGA escribió a mano en el `PATCH`. Referencias vagas (“lo último”, “ese párrafo”) se resuelven contra ese texto; si no las ubica, no inventa: 422 diciendo qué no ubicó.

---

## API S9–S10

### S9 — D3–D4 hecho (PDF + lote + `/informes`)

| Método | Ruta | Quién | Qué |
|--------|------|--------|-----|
| `POST` | `/reports` | ADMIN / ANALYST | Crea `draft` y genera el PDF. Body: `{ clientId, dateFrom?, dateTo? }`. **409** si el día (`dateTo` o hoy) sigue `classifying`. **400** si no hay candidatos. Y/O/R no enviados y no excluded. `fileUrl` = `/reports/:id/file` |
| `POST` | `/reports/:id/regenerate` | ADMIN / ANALYST | Reescribe el lote y el PDF. Solo `draft`. **409** si `sent`/`discarded` o classifying |
| `GET` | `/reports` | ADMIN / ANALYST | Lista. Query: `clientId`, `status` (`draft` \| `sent` \| `discarded`), `page`, `limit` |
| `GET` | `/reports/:id` | ADMIN / ANALYST | Detalle + `findings[]`. ANALYST sin membership → **404** |
| `GET` | `/reports/:id/file` | ADMIN / ANALYST | PDF. `inline` (ver). `?download=1` → `attachment`. Auth Bearer |

UI `/alertas`: **Generar PDF** (cliente obligatorio) + pastillas de lote. Tras generar, toast con enlace a `/informes/:id`. Copy: informe, no inbox.

UI `/informes`: lista VCGA (Borradores / Enviados). Ver / Descargar; **Regenerar** solo en `draft`. El archivo se pide con Bearer y se abre como blob.

`clientId` es obligatorio al generar: un informe no mezcla tenants. Esta semana **no** manda correo.

El PDF: briefing sin portada. Franja NORMA + documento de trabajo; cliente, razón social, periodo y contadores Crítico / Alto / Medio en la primera página. Hallazgos en ficha (acción sugerida, justificación, «Ver documento»). Pie: no enviado. Verde no entra.

`lote=incluidos` es el mismo criterio que `POST /reports`. Enviados = hallazgo en un `ReportFinding` de un informe `sent`. Excluidos = flag y todavía no quemados.

### S9 — pendiente

| Método | Ruta | Quién | Qué |
|--------|------|--------|-----|
| `POST` | `/reports/:id/send` | ADMIN / ANALYST | Confirmar (cliente no automático) |
| `POST` | `/reports/:id/discard` | ADMIN / ANALYST | Draft fuera; hallazgos vuelven |

`autoSend: true` → `POST /reports` deja `sent` y manda correo (**no esta semana**). Estados: `draft` → `sent` \| `discarded`.

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
