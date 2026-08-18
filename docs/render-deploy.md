# Deploy en Render (NORMA Backend)

## Causa del OOM

**No uses** `yarn start` / `nest start` como Start Command en Render.

`nest start` **vuelve a compilar** TypeScript en runtime y en planes pequeños agota el heap
(`JavaScript heap out of memory`). Además el proceso muere antes de bindear puerto
(`No open ports detected`).

Flujo correcto: **build en el build step** → **arrancar JS compilado**.

## Comandos en el Web Service

| Campo | Valor |
|-------|--------|
| Runtime | Node |
| Build Command | `yarn install && yarn render:build` |
| Start Command | `yarn start:prod` (o `yarn start`) |
| Health Check Path | `/health` |

Si el build no genera `dist/main.js`, el deploy falla a propósito en `render:build` (check post-build).

**Importante:** el Build Command debe incluir `yarn render:build` (o al menos `yarn build`). Si solo haces `yarn` / `yarn install`, el start no encuentra `dist/main.js`.

Si prefieres npm (el repo usa `pnpm` en local; Render a menudo usa yarn/npm):

```text
Build:  npm install && npm run render:build
Start:  npm run start:prod
```

Con pnpm (recomendado si configuras Corepack):

```text
Build:  corepack enable && pnpm install --frozen-lockfile && pnpm render:build
Start:  pnpm start:prod
```

`render:build` ejecuta: `prisma generate` → `nest build` → `prisma migrate deploy`.

## Variables de entorno (Render)

Obligatorias / importantes:

- `DATABASE_URL` — pooler Supabase (IPv4 Session/Transaction según docs del repo)
- `JWT_SECRET`
- `NODE_ENV=production`
- `CORS_ORIGIN` — URL del front en Vercel (coma-separada si hay varias)
- `SENTRY_DSN` (recomendado)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` (Storage)
- `OPENAI_API_KEY` (asistente de catálogo; sin key, `POST /ai/ask` → 503)
- `REDIS_URL` (BullMQ; sin Redis, `POST /jobs/crawl` → 503)

Render inyecta `PORT` solo; no lo hardcodees.

### Redis / Key Value en Render

El Web Service **no** trae Redis. Hay que crear un servicio aparte (**New → Key Value**, compatible con Redis).

1. Misma **región** que el backend NORMA.
2. Plan Free/Starter para el piloto. Política de memoria: **noeviction** si el plan lo permite (BullMQ no debe perder jobs).
3. En la instancia → **Connect** → copiar **Internal URL** (`redis://red-…:6379`).
4. En el Web Service → Environment → `REDIS_URL=<Internal URL>`. Render reinicia solo.

No uses la URL **external** (`rediss://`) desde el Web Service. Verifica: `GET /jobs/status` → `configured: true`, `redis: up`.

Alternativa: URL de Upstash/Redis Cloud pegada en la misma variable. Sin `REDIS_URL`, la API vive; el crawl responde 503.

Detalle también en [ENTREGA-FRONT-ENV.md](./ENTREGA-FRONT-ENV.md) § Redis en Render.

Opcional si el **build** también OOM:

```text
NODE_OPTIONS=--max-old-space-size=512
```

## Verificación post-deploy

```bash
curl https://<tu-servicio>.onrender.com/health
curl https://<tu-servicio>.onrender.com/docs
```

## Local

Sigue usando:

```bash
pnpm start:dev
```

`pnpm start` / `yarn start` ahora ejecutan `node dist/main` (requiere `pnpm build` previo).
