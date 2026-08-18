# Entrega — qué hicimos, qué cambia el front, qué va en `.env`

**Audiencia:** backend local + agente/dev de `norma-frontend`.  
**Fecha:** 2026-08-18.  
**Repo de API:** `norma-backend` (este). El front es **otro** repositorio.

Auth en todas las rutas de negocio: `Authorization: Bearer <accessToken>` de `POST /auth/login`.  
El front **no** lee Postgres ni Redis ni OpenAI directo: solo llama a Nest.

Contratos detallados (si hace falta el shape completo):

- Fuentes (estado + disparador): [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md)
- Cliente ↔ fuentes: [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md)
- Fiscales / contactos: [FRONTEND-CLIENT-FISCAL-CONTACTS.md](./FRONTEND-CLIENT-FISCAL-CONTACTS.md)
- Entrega / semáforo: [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md)
- Asistente de catálogo: [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md)
- Crawl: [jobs-crawl.md](./jobs-crawl.md)

---

## 1. Qué hicimos en backend (3 bloques)

### Bloque 0 — Modelo (ya en API)

- Fuentes: `jurisdiction` (`FEDERAL` | `STATE`) + `stateCode` (ISO 3166-2:MX). FEDERAL ⇒ `stateCode` null.
- Disparador de rastreo: `schedule: { time, timezone, weekdays }` (1=lunes … 7=domingo). **Se eliminó `frequency`** (mandarlo → 400).
- Catálogo seed: 32 congresos (solo **Jalisco** `ACTIVE` para crawl piloto) + federales `dof` y `diputados-gaceta`. INACTIVE: Senado, mañanera, COFEPRIS, PROFECO.
- Campos de matriz: `searchFocus` (`string[]`, igual que `keywordsGuide`; `[]` vacío válido), `notes`.
- Entrega 1:1 por cliente: canales email/WhatsApp (WhatsApp **no envía**), horario de entrega, 4 acciones de semáforo (`suggestedAction`).
- Rutas: `GET/PATCH /clients/:id/delivery`. `delivery` también anidado en create/PATCH de cliente.

### Bloque 1 — Asistente de catálogo (ya en API)

- `GET /ai/status` → `{ configured, model }` (no llama al modelo).
- `POST /ai/ask` → pregunta sobre clientes/perfiles/fuentes **ya guardados**. **No clasifica normas** (eso es Sprint 7).
- Sin `OPENAI_API_KEY` → `503`. No-ADMIN: el contexto se filtra por memberships.

### Bloque 2 — Crawl Sprint 5 (recién en API)

- Redis + BullMQ, cola `source.crawl`, worker en el mismo proceso Nest.
- Scheduler: fuentes `ACTIVE` según `schedule` (hora + días + zona). `INACTIVE` se ignora.
- Conectores piloto: `dof`, `diputados-gaceta`, `jalisco-congreso` (guardan HTML/PDF **crudo**).
- Tabla `job_runs`. Sin `REDIS_URL` → `POST /jobs/crawl` 503.
- **No** extract/normalize (S6), **no** findings, **no** email.

Migraciones a aplicar si el entorno aún no las tiene:

```bash
pnpm prisma:deploy && pnpm prisma:seed
```

Incluye: `source_state_schedule_delivery`, `matrix_source_notes_semaphore`, `job_runs`, `search_focus_array`.

---

## 2. Qué debe modificar el frontend

Prioridad: **wire lo que ya existe en API**. No inventar PostgREST ni pantallas de clasificación/inbox.

### 2.1 Breaking — fuentes

| Quitar | Poner |
|--------|--------|
| `frequency` | `schedule: { time, timezone, weekdays }` |
| jurisdicción string libre | `jurisdiction` + `stateCode` |

- Types/forms de fuente: `jurisdiction`, `stateCode`, `schedule`, `searchFocus` (`string[]`), `keywordsGuide` (`string[]`), `notes`. No mandar `searchFocus` como string ni `null`; vacío = `[]`.
- Lista: filtros `?jurisdiction=` y `?stateCode=`. Operación diaria: `?status=ACTIVE` (no pintar 31 congresos INACTIVE como “monitoreando”).
- UI: Federal vs Estatal; si estatal, selector de las 32 entidades (mostrar nombre, mandar código `JAL`, `CMX`, …).
- Disparador: hora + checkboxes de días, no combo “daily/weekly”.
- Copy: “fuente”, “entidad federativa”, “horario de rastreo”. Evitar “tenant”.

Detalle y ejemplos: [FRONTEND-SOURCES-V2.md](./FRONTEND-SOURCES-V2.md).

### 2.2 Cliente ↔ fuentes (si aún no está)

- Create/edit **cliente**: multi-select `sourceIds` (PATCH **reemplaza** el set; omitir = no tocar).
- Create **fuente**: opcional `clientIds` (solo al crear; PATCH de fuente no lo acepta).
- Detalle cliente: chips de `client.sources`. Detalle fuente: `source.clients`.

Detalle: [FRONTEND-CLIENT-SOURCES.md](./FRONTEND-CLIENT-SOURCES.md).

### 2.3 Entrega / semáforo (config, no inbox)

Pantalla en ficha cliente:

1. Canales: correo on por defecto; WhatsApp off + leyenda “próximamente”.
2. Horario de entrega: hora + días + zona.
3. Tabla de 4 filas Verde / Amarillo / Naranja / Rojo con `suggestedAction` y toggles (inbox, correo, WhatsApp, requiere humano).

Leer: `GET /clients/:id` → `deliveryConfig` o `GET /clients/:id/delivery`.  
Escribir: `PATCH /clients/:id/delivery` (solo ADMIN).

**No** es el tablero de hallazgos. El envío real no existe aún.

Detalle: [FRONTEND-CLIENT-DELIVERY.md](./FRONTEND-CLIENT-DELIVERY.md).

### 2.4 Asistente de catálogo (nuevo)

Caja de pregunta en backoffice (no un agente autónomo).

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/ai/status` | Si `configured: false`, deshabilitar envío |
| `POST` | `/ai/ask` | `{ "question": "...", "clientId": "opcional" }` |

Mostrar `answer`. Pie opcional con `catalog` (“Basado en N clientes, N fuentes”).  
Copy: “consultar el catálogo”, no “prompt” / “LLM”.  
`503` = OpenAI no configurado en el backend.

Detalle: [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md).

### 2.5 Jobs / crawl (nuevo, solo ADMIN)

Pantalla de operación (no hace falta para el piloto de consultor, sí para demo VCGA).

| Método | Ruta | Roles | Uso |
|--------|------|-------|-----|
| `GET` | `/jobs/status` | autenticado | `{ configured, redis, worker, scheduler, storage, connectors }` |
| `GET` | `/jobs/runs?sourceCode=dof&limit=20` | ADMIN, ANALYST | Historial `job_runs` |
| `POST` | `/jobs/crawl` | ADMIN | `{ "sourceCode": "dof" }` o `{ "sourceId": "..." }` |
| `POST` | `/jobs/crawl/all` | ADMIN | Encola todas las ACTIVE |

UI sugerida:

1. Banner si `configured: false`: “Redis no configurado; el rastreo automático está apagado”.
2. Botón “Rastrear ahora” por fuente ACTIVE (solo ADMIN) → `POST /jobs/crawl`.
3. Tabla de corridas: `sourceCode`, `status` (`QUEUED` \| `RUNNING` \| `SUCCESS` \| `FAILED` \| `SKIPPED`), `message`, fechas.
4. No mostrar el HTML crudo en el front (S6). `503` = falta Redis en el server.

Respuesta típica de encolar:

```json
{
  "enqueued": true,
  "skipped": false,
  "idempotencyKey": "dof:2026-08-18:admin",
  "jobRunId": "clx...",
  "sourceId": "...",
  "sourceCode": "dof"
}
```

Si ya corrió ese día: `enqueued: false`, `skipped: true`, `reason: "already-completed"` (o `already-in-flight`).

### 2.6 Errores que el front debe tratar igual

| Código | Significado |
|--------|-------------|
| `401` | Sin Bearer / token vencido → re-login |
| `403` | Rol insuficiente (ej. ANALYST en `POST /jobs/crawl`) |
| `400` | Body inválido o campo eliminado (`frequency`) |
| `404` | ID/código inexistente |
| `503` | Falta infra en el **backend**: Storage, OpenAI o Redis |

### 2.7 Qué el front NO debe hacer todavía

- Clasificar normas / semáforo de hallazgos (S7).
- Inbox de findings.
- Extraer texto de documentos (S6).
- Enviar correo o WhatsApp.
- Conectar a Redis, OpenAI o Supabase desde el browser.

---

## 3. Variables de entorno

Hay **dos** `.env`: el de este repo (Nest) y el del front.  
El front **no** lleva `REDIS_URL`, `OPENAI_API_KEY`, `DATABASE_URL` ni service_role de Supabase.

Plantilla backend: [`.env.example`](../.env.example) (copiar a `.env`, nunca commitear `.env`).

### 3.1 Backend (`norma-backend/.env`)

| Variable | ¿Obligatoria? | De dónde se obtiene |
|----------|---------------|---------------------|
| `DATABASE_URL` | Sí (API + migraciones) | **Supabase** → Project Settings → **Database** → Connect → URI. Si `db.*` falla (IPv6), usa **Session pooler** (puerto `5432`) o Transaction (`6543`) IPv4. Sustituye `[PROJECT-REF]` y la contraseña. Caracteres especiales en el password: URL-encode (`@` → `%40`, `%` → `%25`). |
| `JWT_SECRET` | Sí | **Lo inventas tú**: string largo aleatorio (no está en ningún dashboard). En prod, otro valor distinto al de local. |
| `JWT_EXPIRES_IN` | No | Default `8h`. Formato que acepte Nest JWT (`8h`, `1d`). |
| `AUTH_SEED_EMAIL` / `AUTH_SEED_PASSWORD` | Para seed | **Tuyos**. Default `admin@norma.local` / `ChangeMe123!`. Sirven para el usuario ADMIN que crea `pnpm prisma:seed`. |
| `PORT` | No | Default `3000`. En Render lo inyecta la plataforma. |
| `NODE_ENV` | No | `development` en local; `production` en deploy. |
| `CORS_ORIGIN` | Sí si el front no es `localhost:5173` | **URL del front**: local `http://localhost:5173`; en Vercel la URL del sitio. Varias: separadas por coma. Debe coincidir con el origen del browser. |
| `REDIS_URL` | Para crawl | **No sale de este repo.** Local: ver *Redis en local*. **Render:** **New → Key Value**, Internal URL → env del Web Service (ver *Redis en Render*). Sin esta variable, la API arranca y `POST /jobs/crawl` → 503. |
| `OPENAI_API_KEY` | Para `/ai/ask` | **[platform.openai.com](https://platform.openai.com)** → API keys → Create. Empieza por `sk-`. Sin key, `/ai/ask` → 503. **No** la pongas en el front. |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. Cámbiala solo si el proyecto usa otro modelo. |
| `SUPABASE_URL` | Para Storage (upload admin + crawl a bucket) | Supabase → Project Settings → **API** → Project URL (`https://xxxx.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Para Storage | Mismo sitio → **service_role** (secret). **Nunca** en el front; bypassa RLS. |
| `SUPABASE_STORAGE_BUCKET` | No | Default `documents`. El bucket debe existir en Storage. |
| `SENTRY_DSN` | No | [sentry.io](https://sentry.io) → proyecto → Settings → Client Keys (DSN). Vacío = Sentry off. |
| `JOBS_WORKER` | No | `false` para no arrancar el worker (raro en local). |
| `JOBS_SCHEDULER` | No | `false` para apagar el cron cada minuto. |
| `JOBS_CONCURRENCY` | No | Default `2`. |

#### Redis en local (paso a paso)

No hay usuario/password en local: la URL es el puerto por defecto.

1. Arrancar Redis **antes** de Nest (elige una):
   - **Windows (sin Docker):** `redis-server --bind 127.0.0.1 --port 6379` (paquete `redis-windows` / `winget install taizod1024.redis-windows-fork`).
   - **Docker:** `docker run --rm -p 6379:6379 redis:7-alpine`.
2. En `norma-backend/.env`:
   ```env
   REDIS_URL=redis://127.0.0.1:6379
   ```
3. Reiniciar `pnpm start:dev` (Nest no recarga `.env` en caliente).
4. `GET /jobs/status` debe mostrar `"configured": true` y `"redis": "up"`.

`127.0.0.1:6379` es el **puerto por defecto** de Redis, no un secreto de NORMA.

Docker **no** es del repo: es solo un atajo local. En Render **no** se usa Docker para Redis.

#### Redis en Render (paso a paso)

El backend en Render no incluye Redis. Es **otro servicio** de la misma cuenta. Render lo llama **Key Value** (compatible con Redis). Docs: [Key Value](https://render.com/docs/key-value).

1. En [dashboard.render.com](https://dashboard.render.com): **New → Key Value**.
2. Misma **región** que el Web Service de NORMA (si no, la URL interna no conecta).
3. Plan: Free o Starter alcanza para el piloto. Si puedes elegir política de memoria, usa **noeviction** (si Redis borra keys, se pierden jobs de BullMQ).
4. Crea la instancia.
5. Abre el Key Value → **Connect** (arriba a la derecha) → copia la **Internal URL**.  
   Ejemplo: `redis://red-xxxxxxxxxxxxxxxxxxxx:6379`
6. En el **Web Service** de NORMA → **Environment** → añade:
   ```text
   REDIS_URL=<pega la Internal URL>
   ```
7. Guarda. Render **reinicia** el servicio.

Comprueba con JWT: `GET https://<tu-servicio>.onrender.com/jobs/status`  
Esperado: `"configured": true` y `"redis": "up"`.

Usa la URL **interna**, no la external (`rediss://…`). La interna es para servicios de Render en la misma región.

Si no quieres Key Value de Render: crea Redis en [Upstash](https://upstash.com) u otro proveedor, copia su URL y pégala igual como `REDIS_URL` en el Web Service.

Sin `REDIS_URL` el sitio en Render sigue vivo; solo el crawl (`POST /jobs/crawl` y el scheduler) responde **503**.

#### OpenAI (paso a paso)

1. Cuenta en OpenAI Platform (hace falta método de pago / créditos).
2. API keys → Create secret key.
3. Pegar en `.env`:
   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```
4. `GET /ai/status` → `"configured": true`.

#### Checklist mínimo para que el front pueda trabajar

```env
DATABASE_URL=postgresql://...
JWT_SECRET=un-secreto-largo
CORS_ORIGIN=http://localhost:5173
AUTH_SEED_EMAIL=admin@norma.local
AUTH_SEED_PASSWORD=ChangeMe123!
```

Opcional según demo:

```env
OPENAI_API_KEY=sk-...          # caja /ai/ask
REDIS_URL=redis://127.0.0.1:6379   # botón rastrear / scheduler
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # archivos; si falta, crawl guarda en data/crawl/
```

Luego:

```bash
pnpm prisma:deploy && pnpm prisma:seed
pnpm start:dev
```

Login: email/password del seed.

### 3.2 Frontend (`norma-frontend/.env`)

Solo lo que el **browser** necesita para hablar con Nest. Nombres típicos (ajusta al que ya use el repo):

| Variable (ejemplo) | Valor local | De dónde |
|--------------------|-------------|----------|
| URL de la API | `http://localhost:3000` | Este backend. En prod: URL de Render (`https://….onrender.com`). |
| Origen del front | `http://localhost:5173` | Vite default. Debe estar en `CORS_ORIGIN` del backend. |

**No** copies al front: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `REDIS_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 4. Cómo probar el cableado

Swagger: `http://localhost:3000/docs` (Authorize con el JWT).

1. `POST /auth/login` → token.
2. `GET /sources?status=ACTIVE` → `dof`, `diputados-gaceta`, `jalisco-congreso` + `schedule`.
3. `GET /clients` → Arca con `sources` y `deliveryConfig`.
4. `GET /ai/status` → si configured, `POST /ai/ask`.
5. `GET /jobs/status` → si configured, `POST /jobs/crawl` `{ "sourceCode": "dof" }` y `GET /jobs/runs`.

Postman: [postman-pruebas.md](./postman-pruebas.md).

---

## 5. Fuera de esta entrega

Sprint 6 (extract/normalize), Sprint 7 (clasificación), Sprint 8 (inbox + email). El front no debe diseñar esas pantallas como si la API ya existiera.
