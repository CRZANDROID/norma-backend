# Seed y tests e2e — NORMA Backend

## Seed

```bash
pnpm prisma:deploy   # o prisma:migrate en local
pnpm prisma:seed
```

Variables (`.env`):

| Variable | Default | Uso |
|---|---|---|
| `AUTH_SEED_EMAIL` | `admin@norma.local` | Admin creado/actualizado por seed |
| `AUTH_SEED_PASSWORD` | `ChangeMe123!` | Password en claro (se hashea) |

El seed es idempotente (`upsert`) y deja:

- Cliente `arca-continental`
- Perfil `seed-arca-profile`
- Fuentes federales `dof`, `diputados-gaceta` (ACTIVE)
- 32 congresos estatales (`jalisco-congreso` ACTIVE; el resto INACTIVE)
- Catálogo INACTIVE: `senado-gaceta`, `mananera-presidencia`, `cofepris`, `profeco`
- Config de entrega/semáforo del cliente Arca (acciones sugeridas de la matriz)
- Usuario ADMIN con el email/password del `.env`

## Tests e2e (Sprint 4)

Requisitos: `.env` con `DATABASE_URL` + `JWT_SECRET`, migraciones aplicadas, seed ejecutado.

```bash
pnpm test:e2e
```

Cobertura:

| Archivo | Qué valida |
|---|---|
| `test/app.e2e-spec.ts` | `GET /health` |
| `test/auth-permissions.e2e-spec.ts` | login 400/401, `/auth/me`, ANALYST `403` en `/users` y create client |
| `test/crud-smoke.e2e-spec.ts` | create source/client+`sourceIds`, filter `clientId`, profile, validation 400 |
| `test/client-fiscal-contacts.e2e-spec.ts` | fiscales + contactos anidados |
| `test/source-state-delivery.e2e-spec.ts` | `stateCode` / `schedule` + `deliveryConfig` |
| `test/ai-ask.e2e-spec.ts` | `/ai/ask` 401/400 y 503 sin API key |
| `test/jobs-crawl.e2e-spec.ts` | `/jobs/*` 401/400 y 503 sin Redis |

Los tests crean datos con sufijo temporal (`e2e-*`) y desactivan cliente/fuente al final.

## Swagger

Con el server arriba (`pnpm start:dev`):

- UI: `http://localhost:3000/docs`
- Auth: botón Authorize → pegar JWT de `POST /auth/login`
