# NORMA — Sprint 3 Backend Brief

> **Histórico.** El CRUD S3 está hecho. **No uses este archivo como contrato actual.**  
> Fuentes hoy: `jurisdiction` + `stateCode` + `schedule` — **no** `frequency` (el API responde 400).  
> Contratos vivos: [README.md](./README.md) · [postman-pruebas.md](./postman-pruebas.md) · [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md) · [HANDOFF.md](./HANDOFF.md).

**Sprint:** 3 — CRUD administrativo vertical  
**Repo:** `norma-backend` (`backend-norma`)  
**Stack:** NestJS + Express + Prisma + PostgreSQL (Supabase = DB) + JWT propio  
**Proyecto GitHub:** `NORMA — Piloto Arca` (issues S3)  
**Estado backend:** completo (issues #8, #9, #10)

---

## 1. Objetivo del sprint

Entregar un **API administrativo real** (sin mocks) para que el frontend conecte pantallas de:

1. **Clientes** + **perfiles regulatorios**
2. **Fuentes** (con activar / desactivar)
3. **Usuarios**, roles y membresías (admin básico)

**Entregable de negocio:** el piloto de Arca Continental se administra desde el panel con datos reales en PostgreSQL.

**Entregable técnico:** módulos NestJS funcionales, protegidos por auth/roles, consumibles por el frontend vía Axios + Bearer token.

---

## 2. Por qué este sprint existe (contexto)

En Sprints 1–2 se dejó:

- App NestJS viva (`/health`)
- Schema Prisma multi-tenant (clientes, memberships, perfiles, fuentes)
- Auth propia: `POST /auth/login` (bcrypt + JWT) + `GET /auth/me`

El objetivo de S3 fue dejar de tener shells vacíos y operar el catálogo admin por API.

La ingesta, IA, colas y findings **no** entran aquí; dependen de que el catálogo administrativo ya exista y esté autorizado.

---

## 3. Qué existe (referencia)

### 3.1 Auth — listo

| Pieza | Archivo | Para qué |
|-------|---------|----------|
| Login JWT | `src/modules/auth/auth.service.ts` | `POST /auth/login` → accessToken |
| Guard JWT | `src/modules/auth/jwt-auth.guard.ts` | Rechaza requests sin Bearer válido |
| Strategy | `src/modules/auth/jwt.strategy.ts` | Valida JWT y carga usuario |
| Usuario en request | `@CurrentUser()` | Inyecta `AuthUser` en controllers |
| Roles | `@Roles(...)` + `RolesGuard` | Autorización por `UserRole` |
| Perfil | `GET /auth/me` | Devuelve rol + memberships |

### 3.2 Modelo Prisma — listo

Tablas relevantes:

- `users` (incluye `password_hash`)
- `clients`
- `client_memberships`
- `regulatory_profiles`
- `sources`
- `findings` → **fuera de alcance S3** (no implementar CRUD)

Enums clave:

- `UserRole`: `ADMIN` | `ANALYST` | `VIEWER` | `CLIENT_USER`
- `EntityStatus`: `ACTIVE` | `INACTIVE`
- `SourceCategory`: `OFFICIAL` | `MEDIA` | `SOCIAL`
- `SourcePlatform`: `WEB` | `YOUTUBE` | `X` | `TIKTOK` | `FACEBOOK` | `INSTAGRAM` | `OTHER`

### 3.3 Seed — ya cargado

- Cliente: **Arca Continental** (`slug: arca-continental`)
- Perfil regulatorio piloto (bebidas / empaques)
- Fuentes: `dof`, `diputados-gaceta`, `jalisco-congreso`
- Admin seed: `AUTH_SEED_EMAIL` / `AUTH_SEED_PASSWORD`

### 3.4 Módulos S3 — implementados

```text
src/modules/clients/   → CRUD + profiles
src/modules/sources/   → CRUD + activate/deactivate
src/modules/users/     → admin users + memberships
```

---

## 4. Reglas de arquitectura (obligatorias)

1. **Auth propia en Nest** = email/password (`passwordHash`) + JWT. Supabase solo hostea Postgres.
2. **Prisma** = único acceso a datos de negocio.
3. El frontend **no** consulta tablas de negocio directo en Supabase (PostgREST).
4. Flujo canónico:

```text
Frontend
  → POST /auth/login
  → Authorization: Bearer <nest_jwt>
  → JwtAuthGuard
  → RolesGuard (si aplica)
  → Controller
  → Service
  → PrismaService
  → PostgreSQL
```

5. Soft-status con `EntityStatus` (`ACTIVE` / `INACTIVE`). **No hard-delete** en S3.
6. Controllers no usan Prisma directo; pasan por services.
7. Toda mutación administrativa usa DTOs.
8. Preferir `class-validator` + `class-transformer` en DTOs nuevos.  
   (ValidationPipe global / Swagger / exception filter formal = Sprint 4; en S3 al menos validar inputs de endpoints nuevos.)
9. Errores HTTP consistentes:

| Código | Cuándo | Por qué |
|--------|--------|---------|
| `401` | Sin token o token inválido | Distinguir “no autenticado” de “sin permiso” |
| `403` | Autenticado pero sin rol/membership | El front puede mostrar “sin acceso” sin forzar re-login |
| `404` | Recurso inexistente | Evitar filtrar datos de otros tenants con mensajes ambiguos |
| `409` | Conflicto de unicidad (`slug`, `code`, membership) | El front puede pedir otro identificador |
| `400` | Body inválido | Fallar temprano antes de tocar DB |

10. `ADMIN` es superusuario del backoffice VCGA. Usuarios no-ADMIN solo ven clientes de sus memberships activas.

---

## 5. Roles y autorización

### Matriz Sprint 3

| Acción | ADMIN | ANALYST | VIEWER | CLIENT_USER |
|--------|:-----:|:-------:|:------:|:-----------:|
| CRUD clientes (crear/editar/activar) | ✅ | ❌ | ❌ | ❌ |
| Lectura clientes | ✅ | ✅* | ✅* | ✅* |
| CRUD / update perfiles | ✅ | ✅* | ❌ | ❌ |
| Lectura perfiles | ✅ | ✅* | ✅* | ✅* |
| CRUD fuentes + activate/deactivate | ✅ | ❌ | ❌ | ❌ |
| Lectura fuentes | ✅ | ✅ | ✅ | ❌ |
| Admin usuarios / roles / memberships | ✅ | ❌ | ❌ | ❌ |

\* Solo sobre clientes donde exista `ClientMembership` con `status = ACTIVE`.

`RolesGuard` deja pasar a cualquier `ADMIN` aunque el endpoint pida otro rol. Usarlo en controllers con `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`.

### Tipo `AuthUser`

```ts
type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  memberships: Array<{
    clientId: string;
    clientName: string;
    clientSlug: string;
    role: UserRole;
  }>;
};
```

---

## 6. Estructura de archivos sugerida

```text
src/modules/clients/
  clients.module.ts
  clients.controller.ts
  clients.service.ts
  profiles.controller.ts       # opcional (o anidar en clients.controller)
  profiles.service.ts          # opcional
  dto/
    create-client.dto.ts
    update-client.dto.ts
    create-regulatory-profile.dto.ts
    update-regulatory-profile.dto.ts

src/modules/sources/
  sources.module.ts
  sources.controller.ts
  sources.service.ts
  dto/
    create-source.dto.ts
    update-source.dto.ts

src/modules/users/
  users.module.ts
  users.controller.ts
  users.service.ts
  dto/
    update-user-role.dto.ts
    create-membership.dto.ts
    update-membership.dto.ts
```

---

## 7. Contrato de endpoints (detalle + por qué)

**Convenciones globales**

- Sin prefix `/api` (hoy las rutas viven en la raíz: `/auth/me`, `/health`).
- Header: `Authorization: Bearer <nest_jwt>` (obtenido con `POST /auth/login`)
- IDs: strings `cuid`
- Fechas: ISO-8601
- Soft deactivate/activate en rutas dedicadas (más claras para el front que un PATCH genérico de `status`, aunque internamente actualicen el mismo campo)

---

### 7.1 Auth (referencia)

#### `POST /auth/login`

| | |
|--|--|
| **Auth** | No |
| **Body** | `{ "email": "...", "password": "..." }` |
| **Response** | `200` → `{ accessToken, user }` |

#### `GET /auth/me`

| | |
|--|--|
| **Auth** | Bearer (`JwtAuthGuard`) |
| **Roles** | Cualquiera autenticado |
| **Response** | `200` → `AuthUser` |

**Por qué existe:** el frontend necesita saber quién es el usuario **en el modelo NORMA** (rol global + memberships).

**Response ejemplo:**

```json
{
  "id": "clx...",
  "email": "admin@norma.local",
  "name": "Admin NORMA",
  "role": "ADMIN",
  "memberships": [
    {
      "clientId": "clx...",
      "clientName": "Arca Continental",
      "clientSlug": "arca-continental",
      "role": "ANALYST"
    }
  ]
}
```

---

### 7.2 Clients

El cliente (ej. Arca Continental) es la unidad de multi-tenancy. Casi todo lo regulatorio cuelga de un `clientId`.

---

#### `GET /clients`

| | |
|--|--|
| **Guards** | `JwtAuthGuard` |
| **Roles** | Autenticado; filtrar por membership si no es `ADMIN` |
| **Query** | `status?: ACTIVE \| INACTIVE`, `q?: string` (name/slug) |
| **Response** | `200` → `Client[]` |

**Por qué:** la pantalla **Clientes** necesita el listado real. El filtro por `status` permite ver solo activos en operación diaria y revisar inactivos en auditoría. `q` evita listados inútiles cuando crezca el catálogo. El filtro por membership evita fugas de datos entre clientes (un `CLIENT_USER` de Arca no debe ver otros clientes).

**Response item:**

```json
{
  "id": "clx...",
  "name": "Arca Continental",
  "slug": "arca-continental",
  "email": "asuntos.regulatorios@arca.com",
  "phone": null,
  "status": "ACTIVE",
  "createdAt": "2026-07-18T00:00:00.000Z",
  "updatedAt": "2026-07-18T00:00:00.000Z"
}
```

---

#### `GET /clients/:id`

| | |
|--|--|
| **Guards** | `JwtAuthGuard` |
| **AuthZ** | `ADMIN` o membership activa en ese `id` |
| **Response** | `200` → `Client` + `profiles[]` |
| **Errors** | `403`, `404` |

**Por qué:** la vista detalle / edición necesita el cliente y sus perfiles en una sola carga. Incluir `profiles` evita un waterfall innecesario en el front y refleja que el perfil regulatorio **pertenece** al cliente.

---

#### `POST /clients`

| | |
|--|--|
| **Guards** | `JwtAuthGuard`, `RolesGuard` |
| **Roles** | `@Roles(ADMIN)` |
| **Response** | `201` → `Client` |
| **Errors** | `400`, `403`, `409` (slug duplicado) |

**Body:**

```json
{
  "name": "Arca Continental",
  "slug": "arca-continental",
  "email": "ops@arca.com",
  "phone": "+52..."
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | sí | min 2 |
| `slug` | string | sí | único, kebab-case `[a-z0-9-]+` |
| `email` | string | no | email |
| `phone` | string | no | — |

**Por qué:** el piloto empieza con Arca, pero el producto es multi-cliente. Crear clientes por API (no solo seed) es el camino correcto para onboarding futuro. Solo `ADMIN` puede crearlos porque dar de alta un tenant es una decisión de negocio sensible. `slug` estable permite URLs, seeds y referencias humanas sin depender del `cuid`.

---

#### `PATCH /clients/:id`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | Parcial: `name?`, `email?`, `phone?` (y `slug?` solo si se valida unicidad) |
| **Response** | `200` → `Client` |
| **Errors** | `400`, `403`, `404`, `409` |

**Por qué:** correos, teléfonos y razón social cambian. Separar update de activate/deactivate evita desactivar un cliente “por accidente” al editar un email. Recomendación S3: **no permitir cambiar `slug`** una vez creado (rompe referencias); si se permite, exigir unicidad.

---

#### `PATCH /clients/:id/deactivate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | vacío |
| **Efecto** | `status = INACTIVE` |
| **Response** | `200` → `Client` |

**Por qué:** un cliente puede dejar de operar en NORMA sin borrar histórico (memberships, perfiles, findings futuros). Soft-deactivate mantiene integridad referencial y auditoría. Endpoint dedicado = intención explícita en logs y en UI (“Desactivar”).

---

#### `PATCH /clients/:id/activate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Efecto** | `status = ACTIVE` |
| **Response** | `200` → `Client` |

**Por qué:** simétrico a deactivate. Reactivar un cliente del piloto o de pruebas sin recrear el registro ni perder perfiles.

---

### 7.3 Regulatory profiles

El perfil regulatorio define **qué le importa al cliente** (keywords, categorías, portafolio). Más adelante (Sprint 7) la relevancia/semaforización lo usará; en S3 solo se administra.

---

#### `GET /clients/:clientId/profiles`

| | |
|--|--|
| **Auth** | Bearer + acceso al cliente |
| **Query** | `status?: ACTIVE \| INACTIVE` |
| **Response** | `200` → `RegulatoryProfile[]` |

**Por qué:** listar perfiles de un cliente sin traer todo el grafo. Útil cuando la UI de perfiles es una pestaña o sub-ruta (`/clientes/:id/perfiles`).

---

#### `POST /clients/:clientId/profiles`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN, ANALYST)` |
| **Response** | `201` → `RegulatoryProfile` |
| **Errors** | `400`, `403`, `404` (cliente) |

**Body:**

```json
{
  "name": "Perfil bebidas y empaques",
  "description": "Perfil piloto",
  "keywords": ["bebidas azucaradas", "etiquetado"],
  "categories": ["salud", "impuestos"],
  "products": {
    "categories": ["refrescos", "aguas"]
  }
}
```

| Campo | Tipo | Requerido | Default |
|-------|------|-----------|---------|
| `name` | string | sí | — |
| `description` | string | no | — |
| `keywords` | string[] | no | `[]` |
| `categories` | string[] | no | `[]` |
| `products` | object/JSON | no | `null` |

**Por qué:** un cliente puede tener más de un perfil (líneas de negocio, países, marcas). `ANALYST` puede crear/ajustar perfiles porque es trabajo operativo diario de VCGA; crear el **cliente** sigue siendo solo `ADMIN`. `keywords` / `categories` / `products` son la materia prima del motor de relevancia futuro: hay que poder editarlos ya.

---

#### `GET /profiles/:id`

| | |
|--|--|
| **Auth** | Bearer + acceso al cliente dueño |
| **Response** | `200` → `RegulatoryProfile` |
| **Errors** | `403`, `404` |

**Por qué:** carga directa para formularios de edición por id (deep link), sin depender siempre de `/clients/:id`.

---

#### `PATCH /profiles/:id`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN, ANALYST)` |
| **Body** | Parcial (mismos campos que create) |
| **Response** | `200` → `RegulatoryProfile` |

**Por qué:** el perfil del piloto se va a refinar con feedback de Arca. Actualizar keywords sin recrear el registro preserva el `id` que más adelante enlazarán hallazgos y evaluaciones.

---

#### `PATCH /profiles/:id/deactivate` / `PATCH /profiles/:id/activate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Efecto** | `status = INACTIVE` / `ACTIVE` |
| **Response** | `200` → `RegulatoryProfile` |

**Por qué:** retirar un perfil obsoleto del pipeline futuro sin borrar la definición histórica. Solo `ADMIN` desactiva para evitar que un analista apague accidentalmente el perfil del piloto.

---

### 7.4 Sources

Las fuentes son el catálogo de orígenes de información (oficiales, medios, redes). En S3 se **administran**; los conectores/scrapers llegan en Sprint 5.

Handoff front (breaking): [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md).

---

#### `GET /sources`

| | |
|--|--|
| **Auth** | Bearer |
| **Roles lectura** | `ADMIN`, `ANALYST`, `VIEWER` |
| **Query** | `status?`, `category?`, `platform?`, `clientId?`, `q?` |
| **Response** | `200` → `Source[]` |

**Item ejemplo:**

```json
{
  "id": "clx...",
  "name": "Diario Oficial de la Federación",
  "code": "dof",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.dof.gob.mx/",
  "frequency": "daily",
  "sections": [["Comunicados", "Normatividad"], ["Avisos"]],
  "keywordsGuide": ["COFEPRIS", "NOM"],
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "...",
  "clients": []
}
```

---

#### `GET /sources/:id`

| | |
|--|--|
| **Auth** | Bearer (lectura) |
| **Response** | `200` → `Source` |
| **Errors** | `404` |

---

#### `POST /sources`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Response** | `201` → `Source` |
| **Errors** | `400`, `403`, `409` (`code` duplicado) |

**Body:**

```json
{
  "name": "Diario Oficial de la Federación",
  "code": "dof",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.dof.gob.mx/",
  "frequency": "daily",
  "sections": [["Comunicados", "Normatividad", "Alertas sanitarias"]],
  "keywordsGuide": ["COFEPRIS", "etiquetado"],
  "clientIds": []
}
```

| Campo | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| `name` | string | sí | |
| `code` | string | sí | único, kebab-case |
| `category` | `SourceCategory` | sí | |
| `platform` | `SourcePlatform` | sí | |
| `url` | string | no | con protocolo |
| `frequency` | string | no | ej. `daily` |
| `sections` | `string[][]` | no | paths de secciones a revisar |
| `keywordsGuide` | string[] | no | guía humana / futura IA |
| `clientIds` | string[] | no | solo en create |

**Eliminados:** `type`, `section`, `jurisdiction`, `config`.

**Por qué:** el admin debe poder catalogar orígenes por categoría/plataforma y declarar secciones jerárquicas sin migraciones de schema por cada sitio.

---

#### `PATCH /sources/:id`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | Parcial (no `code`, no `clientIds`). `url: null` limpia la URL |
| **Response** | `200` → `Source` |

**Por qué:** URLs, frecuencias, secciones y keywords guide cambian con la operación.

---

#### `PATCH /sources/:id/deactivate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Efecto** | `status = INACTIVE` |
| **Response** | `200` → `Source` |

**Por qué:** apagar una fuente rota o en mantenimiento **sin borrarla**. En Sprint 5 el scheduler debe ignorar `INACTIVE`. Endpoint dedicado = acción clara en UI (“Pausar fuente”) y en auditoría.

---

#### `PATCH /sources/:id/activate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Efecto** | `status = ACTIVE` |
| **Response** | `200` → `Source` |

**Por qué:** reanudar monitoreo cuando la fuente vuelva a estar disponible, conservando historial e `id`/`code`.

---

### 7.5 Users y memberships (admin)

NORMA distingue:

- **Identidad** → email + `passwordHash` (Nest JWT)
- **Perfil de negocio** → tabla `users` (rol global)
- **Acceso a un cliente** → `client_memberships` (rol por cliente)

---

#### `GET /users`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Query** | `status?`, `q?` (email/name) |
| **Response** | `200` → usuarios con memberships |

**Por qué:** sin listado admin no se puede operar el piloto (quién es ADMIN, quién está ligado a Arca). Incluir memberships evita N+1 de requests en la pantalla de usuarios.

**Ejemplo:**

```json
[
  {
    "id": "clx...",
    "email": "admin@norma.local",
    "name": "Admin NORMA",
    "role": "ADMIN",
    "status": "ACTIVE",
    "memberships": [
      {
        "id": "clx...",
        "clientId": "clx...",
        "clientName": "Arca Continental",
        "clientSlug": "arca-continental",
        "role": "ANALYST",
        "status": "ACTIVE"
      }
    ],
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

---

#### `GET /users/:id`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Response** | `200` → mismo shape |
| **Errors** | `403`, `404` |

**Por qué:** ficha de usuario para editar rol/memberships sin cargar el listado completo.

---

#### `PATCH /users/:id/role`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | `{ "role": "ANALYST" }` |
| **Response** | `200` → user |
| **Errors** | `400`, `403`, `404` |

**Por qué:** el alta vía `POST /users` crea usuarios con rol default (`ANALYST` salvo que se indique otro). Hay que poder promover a `ADMIN` o bajar a `VIEWER` desde el producto, no solo con SQL. El rol **global** gobierna el backoffice; el rol de membership gobierna el acceso por cliente.

---

#### `PATCH /users/:id/deactivate` / `PATCH /users/:id/activate`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Efecto** | `users.status = INACTIVE` / `ACTIVE` |
| **Response** | `200` → user |

**Por qué:** cortar acceso de negocio sin borrar el registro. El login y los guards rechazan usuarios `INACTIVE`. Mejor que borrar: se puede reactivar y se conserva auditoría.

---

#### `POST /users/:id/memberships`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | `{ "clientId": "...", "role": "ANALYST" }` |
| **Response** | `201` → membership |
| **Errors** | `403`, `404`, `409` (ya existe el par user+client) |

**Por qué:** multi-tenancy real. Un analista VCGA puede atender varios clientes; un `CLIENT_USER` solo Arca. La membership es la fuente de verdad del “qué puedo ver”, no el rol global solo.

Constraint Prisma: `@@unique([userId, clientId])`.

---

#### `PATCH /memberships/:id`

| | |
|--|--|
| **Roles** | `@Roles(ADMIN)` |
| **Body** | `{ "role"?: UserRole, "status"?: EntityStatus }` |
| **Response** | `200` → membership |

**Por qué:** cambiar el rol dentro de un cliente o desactivar el acceso a un cliente sin tocar el rol global ni otras memberships.

---

### Política de alta de usuarios en S3

| En alcance | Fuera de alcance (follow-up) |
|------------|------------------------------|
| `POST /users` (ADMIN crea email/password) | Invites por correo / magic links |
| Asignar role global | SSO / IdP externo |
| Crear/editar memberships | Registro público self-service |

**Por qué este corte:** Nest es dueño de la identidad de negocio. El alta la hace un ADMIN.

---

## 8. Resumen rápido de rutas

| Método | Ruta | Roles | Propósito corto |
|--------|------|-------|-----------------|
| `POST` | `/auth/login` | público | Emite JWT |
| `GET` | `/auth/me` | auth | Perfil NORMA |
| `POST` | `/users` | ADMIN | Crear usuario |
| `GET` | `/clients` | auth + filtro | Listar clientes |
| `GET` | `/clients/:id` | auth + acceso | Detalle + perfiles |
| `POST` | `/clients` | ADMIN | Crear cliente |
| `PATCH` | `/clients/:id` | ADMIN | Editar cliente |
| `PATCH` | `/clients/:id/deactivate` | ADMIN | Soft-off cliente |
| `PATCH` | `/clients/:id/activate` | ADMIN | Soft-on cliente |
| `GET` | `/clients/:clientId/profiles` | auth + acceso | Listar perfiles |
| `POST` | `/clients/:clientId/profiles` | ADMIN, ANALYST | Crear perfil |
| `GET` | `/profiles/:id` | auth + acceso | Detalle perfil |
| `PATCH` | `/profiles/:id` | ADMIN, ANALYST | Editar perfil |
| `PATCH` | `/profiles/:id/deactivate` | ADMIN | Soft-off perfil |
| `PATCH` | `/profiles/:id/activate` | ADMIN | Soft-on perfil |
| `GET` | `/sources` | auth (lectura) | Listar fuentes |
| `GET` | `/sources/:id` | auth | Detalle fuente |
| `POST` | `/sources` | ADMIN | Crear fuente |
| `PATCH` | `/sources/:id` | ADMIN | Editar fuente |
| `PATCH` | `/sources/:id/deactivate` | ADMIN | Pausar fuente |
| `PATCH` | `/sources/:id/activate` | ADMIN | Reanudar fuente |
| `GET` | `/users` | ADMIN | Listar usuarios |
| `GET` | `/users/:id` | ADMIN | Detalle usuario |
| `PATCH` | `/users/:id/role` | ADMIN | Cambiar rol global |
| `PATCH` | `/users/:id/deactivate` | ADMIN | Soft-off usuario |
| `PATCH` | `/users/:id/activate` | ADMIN | Soft-on usuario |
| `POST` | `/users/:id/memberships` | ADMIN | Ligar a cliente |
| `PATCH` | `/memberships/:id` | ADMIN | Editar membership |

---

## 9. Criterios de aceptación (issues del backlog)

### S3: CRUD Clients + regulatory profiles API (P0, est. 5)

- [x] Create / read / update / deactivate clients
- [x] Profiles linked to clients
- [x] AuthZ enforced (no-ADMIN → `403` en mutaciones de cliente)

### S3: CRUD Sources + activate/deactivate (P0, est. 5)

- [x] CRUD works
- [x] Activate / deactivate endpoints
- [x] Seed pilot sources visibles: `dof`, `diputados-gaceta`, `jalisco-congreso`

### S3: Basic user admin and role assignment (P1, est. 5)

- [x] Admin can list users
- [x] Role assignment persists
- [x] Non-admin cannot manage users (`403`)

---

## 10. Qué NO implementar en Sprint 3

| Fuera | Por qué se aplaza |
|-------|-------------------|
| Redis / BullMQ / workers | No hay jobs de ingesta aún (Sprint 5) |
| Scrapers / conectores | Dependen del catálogo estable de sources |
| OpenAI / agentes | Necesitan documentos normalizados (Sprint 6–7) |
| CRUD `findings` / inbox / semáforo | Sprint 7–8 |
| Swagger completo, Sentry, Storage | Sprint 4 (estabilización) |
| Hard-delete | Rompe auditoría y FKs futuras |
| PostgREST desde el front a tablas negocio | Salta authZ de Nest y duplica reglas |

---

## 11. Orden de implementación recomendado

1. **Clients** list/get/create/patch/activate/deactivate  
2. **Profiles** anidados + get/patch/activate/deactivate  
3. **Sources** CRUD + activate/deactivate  
4. **Users** list + role + memberships + activate/deactivate  
5. Pruebas manuales (Postman / Insomnia):  
   - token ADMIN → happy path  
   - token ANALYST → lectura OK; users admin → `403`  
   - sin token → `401`  
6. Actualizar README del backend con la tabla de rutas  

---

## 12. Cómo probar en local

```bash
pnpm install
pnpm prisma:deploy   # o prisma:migrate
pnpm prisma:seed
pnpm start:dev

curl http://localhost:3000/health

curl -X POST http://localhost:3000/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@norma.local\",\"password\":\"ChangeMe123!\"}"
```

Usa `AUTH_SEED_EMAIL` / `AUTH_SEED_PASSWORD` del `.env`. Guía completa: [postman-pruebas.md](./postman-pruebas.md).

---

## 13. Definition of Done

- [x] `ClientsModule` y `SourcesModule` dejan de ser shells vacíos
- [x] Endpoints de esta especificación responden según el contrato
- [x] Mutaciones protegidas con Bearer + roles
- [x] Arca + 3 fuentes seed gestionables por API
- [x] ADMIN gestiona users/roles/memberships; no-ADMIN recibe `403`
- [x] Contratos documentados para que el frontend conecte sin mocks
- [x] Auth propia con `passwordHash` + JWT (sin Supabase Auth)
- [x] Controllers no hablan con Prisma sin pasar por services

---

## 14. Decisiones si hay duda

Ante ambigüedad, preferir en este orden:

1. Soft-status sobre delete  
2. ADMIN-only en mutaciones de catálogo (clientes/fuentes/users)  
3. Filtrado por membership para no-ADMIN  
4. Contratos JSON explícitos y estables  
5. No inventar features de Sprint 4+ “porque ya estamos ahí”

---

## 15. Referencias en el repo

| Recurso | Ruta |
|---------|------|
| Schema | `prisma/schema.prisma` |
| Seed | `prisma/seed.ts` |
| Auth module | `src/modules/auth/` |
| Clients | `src/modules/clients/` |
| Sources | `src/modules/sources/` |
| Users | `src/modules/users/` |
| Pruebas Postman | `docs/postman-pruebas.md` |
| Issues seed script | `scripts/seed-github-project.ps1` (bloque Sprint 3) |

**Issues GitHub (backend — cerrados):**

- `S3: CRUD Clients + regulatory profiles API` (#8)
- `S3: CRUD Sources + activate/deactivate` (#9)
- `S3: Basic user admin and role assignment` (#10)

**Issue frontend (pendiente del sprint):**

- `S3: Admin screens connected to real API`
`)
