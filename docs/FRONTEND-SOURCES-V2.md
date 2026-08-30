# Frontend handoff — Sources (jurisdicción + disparador)

**Breaking change:** desaparece `frequency` (string libre). Entran `jurisdiction`, `stateCode` y `schedule`.  
`searchFocus` es `string[]` (igual que `keywordsGuide`); `[]` es vacío válido.

## Shape `Source`

```json
{
  "id": "clx...",
  "code": "jalisco-congreso",
  "name": "Congreso de Jalisco",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.congresojal.gob.mx/",
  "jurisdiction": "STATE",
  "stateCode": "JAL",
  "schedule": {
    "time": "07:00",
    "timezone": "America/Mexico_City",
    "weekdays": [1, 2, 3, 4, 5]
  },
  "sections": [
    ["Gaceta"],
    ["Iniciativas"],
    ["Dictámenes"]
  ],
  "keywordsGuide": ["bebidas", "salud"],
  "searchFocus": ["Bebidas", "alimentos", "publicidad", "salud", "residuos", "agua", "comercio"],
  "notes": "Alta prioridad por tamaño económico y actividad legislativa",
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "...",
  "clients": [
    { "id": "...", "name": "...", "slug": "...", "status": "ACTIVE" }
  ]
}
```

Fuentes federales (`dof`, `diputados-gaceta`): `"jurisdiction": "FEDERAL"`, `"stateCode": null`.  
Catálogo INACTIVE: `senado-gaceta`, `mananera-presidencia`, `cofepris`, `profeco`. `platform` `YOUTUBE` / `X` / `FACEBOOK` es **MVP obligatorio** (conectores aparte, no el crawl WEB): [PRODUCT.md](./PRODUCT.md).

## Enums

| Campo | Valores |
|-------|---------|
| `category` | `OFFICIAL` \| `MEDIA` \| `SOCIAL` |
| `platform` | `WEB` \| `YOUTUBE` \| `X` \| `TIKTOK` \| `FACEBOOK` \| `INSTAGRAM` \| `OTHER` |
| `jurisdiction` | `FEDERAL` \| `STATE` |
| `stateCode` | ISO 3166-2:MX: `AGU` `BCN` `BCS` `CAM` `CHP` `CHH` `CMX` `COA` `COL` `DUR` `GUA` `GRO` `HID` `JAL` `MEX` `MIC` `MOR` `NAY` `NLE` `OAX` `PUE` `QUE` `ROO` `SLP` `SIN` `SON` `TAB` `TAM` `TLA` `VER` `YUC` `ZAC` |

`weekdays`: 1 = lunes … 7 = domingo. Default `[1,2,3,4,5]` a las `07:00` `America/Mexico_City`.

## Campos

| Campo | Create | Patch | Notas |
|-------|--------|-------|-------|
| `name` | sí | sí | |
| `code` | sí | no | kebab-case `[a-z0-9-]`, único |
| `category` | sí | sí | |
| `platform` | sí | sí | |
| `url` | no | sí (`null` limpia) | protocolo requerido |
| `jurisdiction` | no (default FEDERAL) | sí | STATE exige `stateCode` |
| `stateCode` | no | sí (`null` limpia) | vacío si FEDERAL |
| `schedule` | no | sí | `{ time, timezone?, weekdays? }` — `time` HH:mm |
| `sections` | no | sí | `string[][]` |
| `keywordsGuide` | no | sí | `string[]` — `[]` vacío válido |
| `searchFocus` | no | sí | `string[]` — qué debe buscar NORMA; `[]` vacío válido |
| `notes` | no | sí (`null` limpia) | observaciones de catálogo |
| `clientIds` | no (opcional) | **no** | solo create |

## Eliminados

`frequency`, `type`, `section`, `config`. El `jurisdiction` viejo (string libre) no vuelve: ahora es el enum `FEDERAL`/`STATE` + `stateCode`.

## Queries `GET /sources`

`status?`, `category?`, `platform?`, `jurisdiction?`, `stateCode?`, `clientId?`, `q?`

## Ejemplos

### POST `/sources`

```json
{
  "name": "Congreso de Nuevo León",
  "code": "congreso-nle-demo",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.hcnl.gob.mx/",
  "jurisdiction": "STATE",
  "stateCode": "NLE",
  "schedule": { "time": "07:00", "weekdays": [1, 2, 3, 4, 5] },
  "sections": [["Comunicados"]],
  "keywordsGuide": ["salud"],
  "searchFocus": []
}
```

### PATCH `/sources/:id`

```json
{
  "schedule": { "time": "08:00" },
  "url": null,
  "searchFocus": [],
  "keywordsGuide": []
}
```

`searchFocus` y `keywordsGuide` son el mismo tipo (`string[]`). Omitir = no tocar; `[]` = vaciar. No mandar `null`.

El seed carga **32 congresos**. ACTIVE de crawl: AGU, BC, BCS, Campeche, Chihuahua, Jalisco. Ver [state-congresses.md](./state-congresses.md).

## UI sugerida

1. Ámbito: Federal vs Estatal. Si estatal, selector de entidad (32 opciones, nombres de negocio no códigos crudos si puedes mapear).
2. Disparador de rastreo: hora + días hábiles (no un combo “daily/weekly”).
3. Filtros lista: `jurisdiction` / `stateCode` / `category` / `platform`.
4. Copy: “fuente”, “entidad federativa”, “horario de rastreo”. Evitar “tenant”.

## Checklist front

- [ ] Quitar `frequency` de types/forms
- [ ] Añadir `jurisdiction`, `stateCode`, `schedule`
- [ ] `searchFocus` y `keywordsGuide` como `string[]` (aceptan `[]`)
- [ ] Filtros STATE / entidad
- [ ] No mostrar los 31 INACTIVE como “monitoreando” (usar `status=ACTIVE` en operación)
