# Frontend — Clientes ↔ Fuentes (contrato listo en backend)

**Audiencia:** agente o dev del repo `norma-frontend`.  
**Backend:** ya implementado. **No hace falta esperar más API** para esta feature (salvo que la DB no tenga la migración `client_sources` aplicada).

Foco de hoy (front): **vincular clientes ↔ fuentes** y, con Redis en el backend, **disparar crawl** sobre esas fuentes. El front **no** lleva `REDIS_URL`: Nest es el único que habla con Redis.

Contexto general: [HANDOFF.md](./HANDOFF.md) · shape de fuente (estado + disparador): [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) · detalle API: [client-sources.md](./client-sources.md) · crawl: [jobs-crawl.md](./jobs-crawl.md) · env: [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) · pruebas: [postman-pruebas.md](./postman-pruebas.md)

---

## Por qué

Cada **cliente** (ej. Arca) debe tener un **catálogo de fuentes** donde buscar regulaciones. Eso alimentará la ingesta (Sprint 5+). Hoy sources y clients existen por separado en la UI; hay que **vincularlos**.

---

## Auth (recordatorio)

- Login: `POST /auth/login` → guardar `accessToken`
- Todas las rutas abajo: `Authorization: Bearer <accessToken>`
- Solo **ADMIN** crea/edita clientes y fuentes

---

## Contrato que debe consumir el front

### Al crear / editar **cliente**

| Acción | Request |
|--------|---------|
| Crear | `POST /clients` body incluye opcional `sourceIds: string[]` |
| Editar vínculos | `PATCH /clients/:id` con `sourceIds: string[]` |

Reglas importantes:

- Si **envías** `sourceIds` en PATCH → **reemplaza el set completo** (no es merge).
- `sourceIds: []` → quita todas las fuentes del cliente.
- Si **omites** `sourceIds` → no toca las vinculaciones (solo name/email/phone).
- Respuestas de list/get/create/update incluyen `sources: Source[]`.
- IDs inválidos → `400` (`Source(s) not found: ...`).
- Campos extra en JSON → `400` (`forbidNonWhitelisted`).

### Al crear **fuente**

| Acción | Request |
|--------|---------|
| Crear | `POST /sources` body incluye opcional `clientIds: string[]` |

- Solo al **crear**. `PATCH /sources/:id` **no** acepta `clientIds` (si lo mandas → 400).
- Para cambiar vínculos después de creada la fuente: editar cada cliente con `sourceIds`, o recrear estrategia vía clientes.
- Respuestas list/get incluyen `clients: Client[]`.
- Filtro útil: `GET /sources?clientId=<id>`.

### Lectura para poblar selects

```http
GET /sources?status=ACTIVE
Authorization: Bearer ...
```

```http
GET /clients?status=ACTIVE
Authorization: Bearer ...
```

(Usar catálogo activo para multi-select en formularios.)

---

## Qué cambiar en `norma-frontend` (checklist)

Archivos típicos hoy (pueden variar):

- `src/features/clients/types/client.ts` — añadir `sources?` al detalle; `sourceIds?` en Create/Update inputs
- `src/features/sources/types/source.ts` — añadir `clients?`; `clientIds?` en CreateSourceInput
- `src/features/clients/api/clients-api.ts` — pasar `sourceIds` en create/update
- `src/features/sources/api/sources-api.ts` — pasar `clientIds` en create
- `ClientForms.tsx` — multi-select de fuentes en create **y** edit (estado local de IDs; al guardar mandar `sourceIds` completo)
- `SourceForms.tsx` — multi-select de clientes **solo en create**
- Detalle cliente: mostrar chips/lista de `client.sources`
- Detalle fuente: mostrar chips/lista de `source.clients` (solo lectura o CTA “editar desde cliente”)

UX sugerida:

1. Crear cliente → checklist/multi-select de fuentes ACTIVE → `POST` con `sourceIds`.
2. Editar cliente → mismo control precargado con `client.sources.map(s => s.id)` → al guardar `PATCH` con el array resultante.
3. Crear fuente → multi-select de clientes → `POST` con `clientIds`.
4. No añadir `clientIds` al form de edición de fuente (el API lo rechaza).

---

## Ejemplos mínimos

**Crear cliente con fuentes**

```json
POST /clients
{
  "name": "Cliente Demo",
  "slug": "cliente-demo",
  "sourceIds": ["clxxx_dof", "clxxx_diputados"]
}
```

**Editar solo vínculos**

```json
PATCH /clients/:id
{
  "sourceIds": ["clxxx_dof"]
}
```

**Crear fuente ya vinculada**

```json
POST /sources
{
  "name": "DOF mirror",
  "code": "dof-mirror",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.dof.gob.mx/",
  "jurisdiction": "FEDERAL",
  "clientIds": ["clxxx_arca"]
}
```

No mandar `type` ni `frequency` (el API responde `400`). Shape completo: [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md).

---

## Redis en el backend (para probar crawl)

El vínculo cliente↔fuente alimenta el rastreo. Para **probar** `POST /jobs/crawl` hace falta Redis en **Nest**, no en el browser.

| Dónde | Variable | Valor local |
|-------|----------|-------------|
| `norma-backend/.env` | `REDIS_URL` | `redis://127.0.0.1:6379` |
| `norma-frontend/.env` | — | **no** copies `REDIS_URL` |

No hay usuario ni password en local. `127.0.0.1:6379` es el puerto por defecto de Redis.

Arrancar Redis (una terminal aparte, **antes** de Nest):

```bash
redis-server --bind 127.0.0.1 --port 6379
```

(Si tienes Docker: `docker run --rm -p 6379:6379 redis:7-alpine`.)

Luego reinicia `pnpm start:dev`. Comprueba con JWT:

```http
GET /jobs/status
Authorization: Bearer ...
```

Esperado: `"configured": true`, `"redis": "up"`. Si falta `REDIS_URL` o Redis está apagado → `configured: false` y `POST /jobs/crawl` → `503`.

### Contrato crawl (solo ADMIN; demo de fuentes ACTIVE)

| Método | Ruta | Body |
|--------|------|------|
| `GET` | `/jobs/status` | — |
| `POST` | `/jobs/crawl` | `{ "sourceCode": "dof" }` o `{ "sourceId": "..." }` |
| `POST` | `/jobs/crawl/all` | — |
| `GET` | `/jobs/runs?sourceCode=dof&limit=20` | — |

UI sugerida (detalle fuente o pantalla de operación): banner si `configured: false`; botón **Rastrear ahora** en fuentes `ACTIVE` → `POST /jobs/crawl`. No pintar el HTML crudo (eso es S6).

Detalle: [jobs-crawl.md](./jobs-crawl.md) · entrega: [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) §2.5.

---

## Fuera de alcance de esta UI

- Extraer / normalizar documentos (Sprint 6) y clasificación / inbox (Sprint 7–8)
- Storage `/storage/*` (S4 infra; otra pantalla si hace falta)
- Enviar correo o WhatsApp
- Poner `REDIS_URL` / `OPENAI_API_KEY` / `DATABASE_URL` en el `.env` del front
- Cambiar `slug` del cliente o `code` de fuente vía forms existentes (respetar reglas actuales del API)

---

## Definition of Done (front)

- [ ] Create client con selección de fuentes
- [ ] Edit client: agregar/quitar fuentes y persistir vía `sourceIds` (replace)
- [ ] Create source con selección de clientes (`clientIds`)
- [ ] Tipos TS alineados a respuesta API (`sources` / `clients`; fuente con `jurisdiction` + `schedule`, no `frequency`/`type`)
- [ ] Errores API (`400`/`403`/`503`) mostrados con el patrón `mapApiError` existente
- [ ] Probar contra Nest local (`VITE_API_URL=http://localhost:3000`, mocks off)
- [ ] Con Redis up en backend: `GET /jobs/status` → configured; botón rastrear → `POST /jobs/crawl`

Cuando termines, actualiza el issue/proyecto y menciona en el PR que el contrato viene de `docs/FRONTEND-CLIENT-SOURCES.md` en `norma-backend`.
