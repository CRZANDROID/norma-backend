# Worker en VPS (Hetzner)

La API HTTP se queda en **Render**. El crawl/extract/classify corre en un VPS **Hetzner** (2 vCPU / 4 GB, ~€4–6/mes) para no pagar el Pro de Render ($85).

**Redis no se mueve.** Sigue el Key Value de Render. El Web Service usa la URL **interna**; el VPS usa la URL **externa** (`rediss://`) con la IP del servidor en el allowlist.

Local no cambia: [docker.md](./docker.md).

## Por qué este box

Render Standard (1 CPU / 2 GB) ya se quedó corto con PDFs + crawl. Fly a 2 GB repetiría el techo. Hetzner CX23 (EU) o CPX equivalente **4 GB** da el RAM del Pro a precio de VPS.

Si Render está en Oregon, preferí **Ashburn** (CPX ~4 GB) para bajar latencia a Redis. CX23 en Falkenstein también sirve: el lock de BullMQ es 15 s.

## Alta del servidor (tú, en el dashboard)

1. [console.hetzner.cloud](https://console.hetzner.cloud) → New project `norma` → **Add server**.
2. Location: Ashburn si existe el plan de 4 GB; si no, Falkenstein.
3. Image: **Ubuntu 24.04**.
4. Type: **CX23** (2 vCPU / 4 GB) o CPX de 4 GB en US.
5. Networking: IPv4 pública (hace falta para Redis externo y `git clone`).
6. SSH key tuya. Sin password de root.
7. Create → copia la **IPv4**.

Firewall de Hetzner (el servidor):

| Puerto | Origen | Para |
|--------|--------|------|
| 22 | tu IP | SSH |
| 80/443 | — | no; este box no es la API |
| 6379 | — | no; Redis está en Render |

## Redis de Render (allowlist)

1. Dashboard Render → **Key Value**.
2. **Connect** → enable **external connections**.
3. Allowlist: IPv4 del VPS `/32`.
4. Copia **External Redis URL** (`rediss://default:…@….render.com:6379`).
5. Worker de Render: **sigue en Suspend**. `JOBS_SCHEDULER=false` en Web y en el worker viejo.

No uses la URL interna `redis://red-…:6379` en Hetzner: no sale de la red de Render.

## En el VPS

SSH:

```bash
ssh root@TU_IPV4
```

Docker:

```bash
apt-get update && apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
```

Repo (misma rama que el Web Service, normalmente `main`):

```bash
git clone https://github.com/TU_ORG/norma-backend.git /opt/norma-backend
cd /opt/norma-backend
```

`.env` en `/opt/norma-backend/.env` (no lo subas). Copia las mismas variables de **producción** del Web Service, con estos cambios:

```text
NODE_ENV=production
JOBS_WORKER=true
JOBS_SCHEDULER=false
SKIP_PRISMA_MIGRATE=true
REDIS_URL=rediss://default:…@….render.com:6379
DATABASE_CONNECTION_LIMIT=2
CRAWL_CONCURRENCY=1
```

`REDIS_URL` = External URL. `DATABASE_URL` / `OPENAI_*` / `SUPABASE_*` / `JWT_SECRET` = los de Render. Scheduler off hasta que el crawl 2026 esté bien; entonces `JOBS_SCHEDULER=true` **solo aquí**, no en Render.

Arranque:

```bash
cd /opt/norma-backend
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml logs -f worker
```

## Comprobar

Desde el front o:

```bash
curl -s https://TU-API.onrender.com/jobs/status
```

Esperado: `redis: "up"`, `worker: true`, `consumers["source.crawl"]` ≥ 1, `scheduler: false` en el JSON del **Web Service** (`scheduler` es el del proceso HTTP; el cron vive en el VPS).

El HUD **Rastrear** encola en Redis de Render; el contenedor de Hetzner consume. Si `worker: false`, el VPS no llegó a Redis (allowlist, URL interna por error, o contenedor caído).

## Actualizar código

```bash
cd /opt/norma-backend
git pull
docker compose -f docker-compose.worker.yml up -d --build
```

Mismo commit que el Web Service de Render. Un worker viejo + API nueva rompe el HUD.

## Parar

```bash
docker compose -f docker-compose.worker.yml stop
```

No levantes el Background Worker de Render a la vez: dos consumidores pisan locks y RAM.

## Qué no hacer

- No abrir Redis en el VPS.
- No poner `JOBS_WORKER=true` otra vez en el Web Service.
- No pagar el Pro de Render “por si acaso”.
- No encender el scheduler (`JOBS_SCHEDULER=true`) hasta el recorte de `gob.mx` / año en el HTML.
