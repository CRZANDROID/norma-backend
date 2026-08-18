# Fuentes piloto NORMA (VCGA)

Origen: Excel `Fuentes_y_Medios_NORMA_VCGA.xlsx`.  
CSV listo para importar a Supabase tabla `public.sources`:

```text
docs/data/fuentes-norma-piloto.csv
```

También están en `prisma/seed.ts` (recomendado: `pnpm prisma:seed`).

## Mapeo Excel → columnas

| Excel | DB |
|-------|-----|
| Fuente | `name` |
| (generado equipo) | `code` |
| Categoría | `category` (`OFFICIAL` / `MEDIA` / `SOCIAL`) |
| Plataforma | `platform` (`WEB` / `YOUTUBE` / `X`) |
| URL exacta | `url` |
| Frecuencia | `frequency` (`daily` / `weekdays`) |
| Sección exacta | `sections` (JSONB) |
| Qué revisar | `keywords_guide` (text[]) |
| — | `status=ACTIVE` |

“Qué ignorar” e “Instrucción para NORMA” no están en el schema; quedan en el Excel / docs de conectores.

## Import CSV en Supabase

1. Table Editor → `sources` → Import data from CSV.
2. Si ya existen filas con el mismo `code` (seed viejo), actualízalas o bórralas antes.
3. Si `keywords_guide` falla, prueba formato `{"a","b"}` o carga vía seed.
4. Vincular a Arca: tras import, crear filas en `client_sources` o correr `pnpm prisma:seed` (el seed vincula todas las fuentes piloto a Arca).
