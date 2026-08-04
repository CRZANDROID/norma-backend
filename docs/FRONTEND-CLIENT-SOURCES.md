# Frontend — Clientes ↔ Fuentes (contrato listo en backend)

**Audiencia:** agente o dev del repo `norma-frontend`.  
**Backend:** ya implementado. **No hace falta esperar más API** para esta feature (salvo que la DB no tenga la migración `client_sources` aplicada).

Contexto general: [HANDOFF.md](./HANDOFF.md) · detalle API: [client-sources.md](./client-sources.md) · pruebas: [postman-pruebas.md](./postman-pruebas.md)

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
  "type": "DOF",
  "url": "https://www.dof.gob.mx/",
  "clientIds": ["clxxx_arca"]
}
```

---

## Fuera de alcance de esta UI

- Scrapers / jobs (S5)
- Storage `/storage/*` (S4 infra; otra pantalla si hace falta)
- Cambiar `slug` del cliente o `code` de fuente vía forms existentes (respetar reglas actuales del API)

---

## Definition of Done (front)

- [ ] Create client con selección de fuentes
- [ ] Edit client: agregar/quitar fuentes y persistir vía `sourceIds` (replace)
- [ ] Create source con selección de clientes (`clientIds`)
- [ ] Tipos TS alineados a respuesta API (`sources` / `clients`)
- [ ] Errores API (`400`/`403`) mostrados con el patrón `mapApiError` existente
- [ ] Probar contra Nest local (`VITE_API_URL=http://localhost:3000`, mocks off)

Cuando termines, actualiza el issue/proyecto y menciona en el PR que el contrato viene de `docs/FRONTEND-CLIENT-SOURCES.md` en `norma-backend`.
