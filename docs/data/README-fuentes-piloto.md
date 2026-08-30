# Fuentes piloto NORMA (VCGA)

Origen de negocio: Excel `Fuentes_y_Medios_NORMA_VCGA.xlsx`.  
El camino real a Postgres es **`pnpm prisma:seed`** (`prisma/seed.ts`), no import CSV al Table Editor de Supabase.

CSV de referencia (no importar a ciegas): `docs/data/fuentes-norma-piloto.csv`.

## Qué aplica hoy

- `schedule` (`time` / `timezone` / `weekdays`), no `frequency`.
- Estatales: `jurisdiction=STATE` + `stateCode`. Federales: `FEDERAL` y `stateCode` null.
- Crawl piloto: fuentes `ACTIVE` (DOF, Diputados, AGU, BC, BCS, Campeche, Chihuahua, Jalisco). El resto de congresos va `INACTIVE` en seed.

Catálogo 32 entidades: [state-congresses.md](../state-congresses.md). Shape de fuente: [FRONTEND-SOURCES-V2.md](../FRONTEND-SOURCES-V2.md).
