# Pruebas Postman — NORMA Backend

Guía para probar todos los endpoints con Postman.

**Base URL:** `http://localhost:3000`  
**Auth:** `Authorization: Bearer <access_token>` (JWT propio del backend)

---

## 0. Setup en Postman

### Variables de colección

| Variable | Ejemplo | Uso |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | URL del API |
| `accessToken` | *(se llena al login)* | Bearer token |
| `userId` | *(de GET /auth/me)* | ID interno Prisma |
| `clientId` | *(de GET /clients)* | Cliente (seed: Arca) |
| `profileId` | `seed-arca-profile` o el que crees | Perfil regulatorio |
| `sourceId` | *(de GET /sources)* | Fuente |
| `membershipId` | *(al crear membership)* | Membership |
| `storagePath` | *(de POST /storage/upload)* | Path en el bucket |

### Header global (colección)

En **Authorization** de la colección:

- Type: `Bearer Token`
- Token: `{{accessToken}}`

O en Headers:

```http
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

Sin token: `GET /health` y `POST /auth/login`.

---

## 1. Login (auth propia)

`POST {{baseUrl}}/auth/login`

**Body (raw JSON):**

```json
{
  "email": "admin@norma.local",
  "password": "ChangeMe123!"
}
```

Usa `AUTH_SEED_EMAIL` / `AUTH_SEED_PASSWORD` de tu `.env` (valores por defecto del seed arriba).

**Respuesta:**

```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "...",
    "email": "admin@norma.local",
    "name": "Admin NORMA",
    "role": "ADMIN",
    "memberships": []
  }
}
```

Copia `accessToken` → `{{accessToken}}` y `user.id` → `{{userId}}`.

### Crear más usuarios

Solo **ADMIN** vía `POST /users` (no hay registro público). Necesitas el token del admin del login.

**Request:**

```http
POST {{baseUrl}}/users
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "email": "analista@norma.local",
  "name": "Analista Demo",
  "password": "Password123!",
  "role": "ANALYST"
}
```

`role` es opcional (default `ANALYST`): `ADMIN` | `ANALYST` | `VIEWER` | `CLIENT_USER`.  
`password` mínimo 8 caracteres.

**Response `201`/`200`:**

```json
{
  "id": "clx...",
  "email": "analista@norma.local",
  "name": "Analista Demo",
  "role": "ANALYST",
  "status": "ACTIVE",
  "memberships": [],
  "createdAt": "2026-07-28T18:00:00.000Z",
  "updatedAt": "2026-07-28T18:00:00.000Z"
}
```

Ese usuario ya puede hacer `POST /auth/login` con su email/password. Para darle acceso a un cliente: `POST /users/:id/memberships`.

---

## 2. Health

### GET `/health`

Sin auth.

```http
GET {{baseUrl}}/health
```

**Esperado:** `200` — servicio vivo.

---

## 3. Auth

### GET `/auth/me`

**Roles:** cualquier usuario autenticado activo.

```http
GET {{baseUrl}}/auth/me
Authorization: Bearer {{accessToken}}
```

**Esperado:** `200` con `id`, `email`, `role`, `memberships[]`.  
Guarda `id` → `{{userId}}`.

---

## 4. Clients

Todos requieren Bearer. Escritura solo **ADMIN**. Lectura: autenticado (CLIENT_USER solo ve sus clientes).

### GET `/clients`

Query opcionales: `status` (`ACTIVE` \| `INACTIVE`), `q` (búsqueda).

```http
GET {{baseUrl}}/clients?status=ACTIVE&q=arca
Authorization: Bearer {{accessToken}}
```

Guarda un `id` → `{{clientId}}` (seed: slug `arca-continental`).

### GET `/clients/:id`

```http
GET {{baseUrl}}/clients/{{clientId}}
Authorization: Bearer {{accessToken}}
```

Incluye `profiles` y `sources` (fuentes vinculadas).

### POST `/clients` — ADMIN

```http
POST {{baseUrl}}/clients
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Cliente Demo",
  "slug": "cliente-demo",
  "email": "contacto@demo.com",
  "phone": "+52 55 1234 5678",
  "sourceIds": ["{{sourceId}}"]
}
```

`slug`: solo `[a-z0-9-]`.  
`sourceIds` (opcional): IDs de fuentes a vincular. La respuesta incluye `sources: [...]`.

### PATCH `/clients/:id` — ADMIN

```http
PATCH {{baseUrl}}/clients/{{clientId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Cliente Demo Actualizado",
  "email": "nuevo@demo.com",
  "phone": "+52 55 9999 0000",
  "sourceIds": ["{{sourceId}}"]
}
```

No se puede cambiar `slug` por este endpoint.  
Si envías `sourceIds`, **reemplaza** el set completo de fuentes (manda `[]` para quitar todas). Si lo omites, no toca las vinculaciones.

### PATCH `/clients/:id/deactivate` — ADMIN

```http
PATCH {{baseUrl}}/clients/{{clientId}}/deactivate
Authorization: Bearer {{accessToken}}
```

### PATCH `/clients/:id/activate` — ADMIN

```http
PATCH {{baseUrl}}/clients/{{clientId}}/activate
Authorization: Bearer {{accessToken}}
```

---

## 5. Regulatory profiles

Lectura: autenticado con acceso al cliente.  
Crear/editar: **ADMIN** o **ANALYST**.  
Activate/deactivate: **ADMIN**.

### GET `/clients/:clientId/profiles`

Query: `status` opcional (`ACTIVE` \| `INACTIVE`).

```http
GET {{baseUrl}}/clients/{{clientId}}/profiles?status=ACTIVE
Authorization: Bearer {{accessToken}}
```

Guarda un `id` → `{{profileId}}` (seed: `seed-arca-profile`).

### POST `/clients/:clientId/profiles` — ADMIN | ANALYST

```http
POST {{baseUrl}}/clients/{{clientId}}/profiles
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Perfil prueba Postman",
  "description": "Perfil creado desde Postman",
  "keywords": ["etiquetado", "IEPS", "COFEPRIS"],
  "categories": ["salud", "impuestos"],
  "products": {
    "categories": ["refrescos", "aguas"]
  }
}
```

### GET `/profiles/:id`

```http
GET {{baseUrl}}/profiles/{{profileId}}
Authorization: Bearer {{accessToken}}
```

### PATCH `/profiles/:id` — ADMIN | ANALYST

```http
PATCH {{baseUrl}}/profiles/{{profileId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Perfil actualizado",
  "keywords": ["etiquetado", "PET"],
  "categories": ["envases"],
  "products": {
    "categories": ["jugos"]
  }
}
```

### PATCH `/profiles/:id/deactivate` — ADMIN

```http
PATCH {{baseUrl}}/profiles/{{profileId}}/deactivate
Authorization: Bearer {{accessToken}}
```

### PATCH `/profiles/:id/activate` — ADMIN

```http
PATCH {{baseUrl}}/profiles/{{profileId}}/activate
Authorization: Bearer {{accessToken}}
```

---

## 6. Sources

Lectura: **ADMIN** | **ANALYST** | **VIEWER**.  
Escritura: **ADMIN**.

### GET `/sources`

Query opcionales: `status`, `type`, `jurisdiction`, `clientId`, `q`.

`type` posibles:

`CONGRESS_STATE` | `CONGRESS_FEDERAL` | `DOF` | `AUTHORITY` | `MEDIA` | `TRANSCRIPT` | `MANUAL` | `API` | `FEED` | `WEBHOOK`

```http
GET {{baseUrl}}/sources?status=ACTIVE&type=DOF&q=diario
Authorization: Bearer {{accessToken}}
```

Filtrar por cliente:

```http
GET {{baseUrl}}/sources?clientId={{clientId}}
Authorization: Bearer {{accessToken}}
```

Seed: `dof`, `diputados-gaceta`, `jalisco-congreso`. Guarda un `id` → `{{sourceId}}`.  
La respuesta incluye `clients: [...]` (clientes vinculados).

### GET `/sources/:id`

```http
GET {{baseUrl}}/sources/{{sourceId}}
Authorization: Bearer {{accessToken}}
```

### POST `/sources` — ADMIN

```http
POST {{baseUrl}}/sources
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Fuente prueba Postman",
  "code": "fuente-postman",
  "type": "MEDIA",
  "url": "https://example.com/noticias",
  "section": "regulatorio",
  "jurisdiction": "federal",
  "frequency": "daily",
  "keywordsGuide": ["COFEPRIS", "NOM"],
  "config": {
    "selector": ".article"
  },
  "clientIds": ["{{clientId}}"]
}
```

`code`: kebab-case `[a-z0-9-]`. `url` con protocolo (`https://...`).  
`clientIds` (opcional): vincula la fuente a clientes **solo al crear**. Para cambiar vínculos después, usa `PATCH /clients/:id` con `sourceIds`.

### PATCH `/sources/:id` — ADMIN

```http
PATCH {{baseUrl}}/sources/{{sourceId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "name": "Fuente actualizada",
  "frequency": "weekly",
  "keywordsGuide": ["etiquetado"]
}
```

No acepta `clientIds` (la gestión de vínculos es desde el cliente).
### PATCH `/sources/:id/deactivate` — ADMIN

```http
PATCH {{baseUrl}}/sources/{{sourceId}}/deactivate
Authorization: Bearer {{accessToken}}
```

### PATCH `/sources/:id/activate` — ADMIN

```http
PATCH {{baseUrl}}/sources/{{sourceId}}/activate
Authorization: Bearer {{accessToken}}
```

---

## 7. Users — solo ADMIN

### POST `/users` — ADMIN

Crea usuario con password (hash en DB). No hay `POST /auth/register`.

```http
POST {{baseUrl}}/users
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "email": "analista@norma.local",
  "name": "Analista Demo",
  "password": "Password123!",
  "role": "ANALYST"
}
```

`role` opcional (default `ANALYST`): `ADMIN` | `ANALYST` | `VIEWER` | `CLIENT_USER`.

### GET `/users`

Query: `status`, `q`.

```http
GET {{baseUrl}}/users?status=ACTIVE&q=admin
Authorization: Bearer {{accessToken}}
```

### GET `/users/:id`

```http
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{accessToken}}
```

### PATCH `/users/:id/role` — ADMIN

```http
PATCH {{baseUrl}}/users/{{userId}}/role
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "role": "ANALYST"
}
```

Roles: `ADMIN` | `ANALYST` | `VIEWER` | `CLIENT_USER`.

### PATCH `/users/:id/deactivate` — ADMIN

```http
PATCH {{baseUrl}}/users/{{userId}}/deactivate
Authorization: Bearer {{accessToken}}
```

Cuidado: no desactives tu propio usuario de prueba sin otro admin.

### PATCH `/users/:id/activate` — ADMIN

```http
PATCH {{baseUrl}}/users/{{userId}}/activate
Authorization: Bearer {{accessToken}}
```

### POST `/users/:id/memberships` — ADMIN

Asocia un usuario a un cliente.

```http
POST {{baseUrl}}/users/{{userId}}/memberships
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "clientId": "{{clientId}}",
  "role": "ANALYST"
}
```

Guarda el `id` del membership → `{{membershipId}}`.

---

## 8. Memberships — solo ADMIN

### PATCH `/memberships/:id`

```http
PATCH {{baseUrl}}/memberships/{{membershipId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "role": "VIEWER",
  "status": "ACTIVE"
}
```

Campos opcionales: `role`, `status` (`ACTIVE` \| `INACTIVE`).

---

## 9. Orden sugerido de prueba

1. `GET /health`
2. `POST /auth/login` (admin seed) → guardar `accessToken`
3. `GET /auth/me` → guardar `userId`
4. `GET /clients` → `clientId`
5. `GET /clients/:id`
6. `GET /clients/:clientId/profiles` → `profileId`
7. `GET /sources` → `sourceId`
8. CRUD admin: crear cliente / fuente / perfil → patch → deactivate → activate
9. `GET /users` → membership create → `PATCH /memberships/:id`
10. Probar un endpoint ADMIN con rol ANALYST → debe fallar `403`
11. Storage (si hay `SUPABASE_*`): `POST /storage/upload` → `GET /storage/signed-url` → `GET /storage/download`

---

## 10. Errores comunes

| Código | Causa típica |
|---|---|
| `401` | Falta Bearer, token expirado o usuario `INACTIVE` |
| `403` | Rol insuficiente (ej. ANALYST en ruta ADMIN) |
| `400` | Body inválido (`forbidNonWhitelisted`: no mandes campos extra) |
| `404` | ID inexistente o sin acceso al recurso |
| `503` | Storage sin `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |

Token expirado: vuelve a hacer el login de la sección 1.

---

## 11. Storage (Supabase)

Requiere variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y bucket `documents` (ver `docs/sentry-storage.md`).

### Subir archivo

`POST {{baseUrl}}/storage/upload?folder=pilot&clientId={{clientId}}`

- Authorization: Bearer `{{accessToken}}`
- Body: **form-data**
  - Key: `file` (tipo File) → elige un PDF/PNG pequeño

**Respuesta:** guarda `path` → variable `storagePath`.

### URL firmada

`GET {{baseUrl}}/storage/signed-url?path={{storagePath}}&expiresIn=3600`

### Descargar

`GET {{baseUrl}}/storage/download?path={{storagePath}}`

En Postman: Send and Download si quieres guardar el binario.

---

## 12. Resumen de endpoints

| Método | Ruta | Auth | Roles |
|---|---|---|---|
| GET | `/health` | No | — |
| POST | `/auth/login` | No | — |
| GET | `/auth/me` | Sí | autenticado |
| POST | `/users` | Sí | ADMIN |
| GET | `/clients` | Sí | autenticado* |
| GET | `/clients/:id` | Sí | autenticado* |
| POST | `/clients` | Sí | ADMIN |
| PATCH | `/clients/:id` | Sí | ADMIN |
| PATCH | `/clients/:id/deactivate` | Sí | ADMIN |
| PATCH | `/clients/:id/activate` | Sí | ADMIN |
| GET | `/clients/:clientId/profiles` | Sí | autenticado* |
| POST | `/clients/:clientId/profiles` | Sí | ADMIN, ANALYST |
| GET | `/profiles/:id` | Sí | autenticado* |
| PATCH | `/profiles/:id` | Sí | ADMIN, ANALYST |
| PATCH | `/profiles/:id/deactivate` | Sí | ADMIN |
| PATCH | `/profiles/:id/activate` | Sí | ADMIN |
| GET | `/sources` | Sí | ADMIN, ANALYST, VIEWER |
| GET | `/sources/:id` | Sí | ADMIN, ANALYST, VIEWER |
| POST | `/sources` | Sí | ADMIN |
| PATCH | `/sources/:id` | Sí | ADMIN |
| PATCH | `/sources/:id/deactivate` | Sí | ADMIN |
| PATCH | `/sources/:id/activate` | Sí | ADMIN |
| GET | `/users` | Sí | ADMIN |
| GET | `/users/:id` | Sí | ADMIN |
| PATCH | `/users/:id/role` | Sí | ADMIN |
| PATCH | `/users/:id/deactivate` | Sí | ADMIN |
| PATCH | `/users/:id/activate` | Sí | ADMIN |
| POST | `/users/:id/memberships` | Sí | ADMIN |
| PATCH | `/memberships/:id` | Sí | ADMIN |
| POST | `/storage/upload` | Sí | ADMIN, ANALYST |
| GET | `/storage/download` | Sí | ADMIN, ANALYST, VIEWER |
| GET | `/storage/signed-url` | Sí | ADMIN, ANALYST, VIEWER |

\*CLIENT_USER solo ve clientes/perfiles de sus memberships activos.
