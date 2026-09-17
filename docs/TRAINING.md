# Capacitación — entorno limpio

S9 envío/`autoSend` y S10 portal **siguen pendientes**. La sesión llega hasta PDF draft.

Local y staging **comparten el mismo Supabase**. El wipe vacía también el catálogo que ves en Docker.

## Wipe (una vez)

Irreversible. Conserva el ADMIN de `AUTH_SEED_EMAIL`. Borra clientes, fuentes, crawl, hallazgos, informes, otros usuarios, colas Redis y el bucket `documents`.

```bash
pnpm prisma:reset-training          # dry-run: host + conteos
pnpm prisma:reset-training -- --yes
```

Con Compose (Redis alcanzable):

```bash
docker compose run --rm --entrypoint "" api ./node_modules/.bin/tsx prisma/reset-for-training.ts --yes
```

Después:

- Pon `SEED_CATALOG=false` en `.env`. Un `pnpm prisma:seed` **sin** ese flag recrea Arca y las 32 fuentes.
- Apaga el stack local (`docker compose down`). `api` + `worker` contra la misma DB que staging duplican jobs.

## Staging (Render + front desplegado)

Checklist. Los secrets viven en el dashboard, no en Git.

1. Web Service: `JOBS_WORKER=false`, `JOBS_SCHEDULER=false`, build `render:build`, start `start:prod` — [render-deploy.md](./render-deploy.md)
2. Background Worker: mismo build/start, `JOBS_WORKER` on, mismo `REDIS_URL` interno (Key Value, misma región). `GET /jobs/status` → `configured: true`, `redis: up`, `worker: true`
3. `OPENAI_API_KEY` — sin key, classify y rewrite responden 503
4. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + bucket `documents` (el disco de Render no persiste crawl)
5. `CORS_ORIGIN` = URL del front (coma-separada si hay preview)
6. `JWT_SECRET` del API de staging; el login lee el mismo `users` de este Supabase
7. `JOBS_SCHEDULER=false` en el **Background Worker** durante la sesión — crawl solo con «Rastrear ahora»
8. `GET /health` OK; login ADMIN; `GET /clients`, `/sources`, `/findings` vacíos

## Guión de la sesión

Login: el ADMIN de pruebas. Ellos crean el resto (usuarios, clientes, fuentes).

1. Cliente: datos fiscales, al menos un contacto, perfil regulatorio, delivery. Dejar `autoSend` en false.
2. Fuente `WEB` con URL real (no YouTube / X / Facebook). `code` kebab único. Estatal: `jurisdiction: STATE` + `stateCode`.
3. Vincular cliente ↔ fuente (`sourceIds` / `clientIds`). Sin vínculo, classify no genera hallazgos para ese tenant.
4. Dejar la fuente `ACTIVE` → **Rastrear ahora** → panel de progress ([FRONTEND-TRACKING.md](./FRONTEND-TRACKING.md)).
5. `/alertas`: editar, reescribir con IA, excluir ([FRONTEND-ALERTAS.md](./FRONTEND-ALERTAS.md)).
6. Generar PDF → ver / descargar / regenerar en `/informes`.

### Fuera de esta sesión

- Enviar informe, `autoSend`, descartar draft, correo a contactos (S9 resto)
- Portal `CLIENT_USER` (S10)
- Conectores YouTube / X / Facebook (después de S10)

### URLs de referencia (no sembradas)

Copiar a mano si hace falta una fuente WEB. No las recrea el wipe.

| code | Nombre | URL |
|------|--------|-----|
| `dof` | Diario Oficial de la Federación | https://www.dof.gob.mx/ |
| `diputados-gaceta` | Gaceta Parlamentaria — Diputados | https://gaceta.diputados.gob.mx/ |
| `jalisco-congreso` | Congreso de Jalisco | https://www.congresojal.gob.mx/ |

Federales: `jurisdiction: FEDERAL`, `stateCode` vacío. Jalisco: `STATE` + `JAL`. Shape: [FRONTEND-ADMIN.md](./FRONTEND-ADMIN.md).
