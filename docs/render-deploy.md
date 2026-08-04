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

Render inyecta `PORT` solo; no lo hardcodees.

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
