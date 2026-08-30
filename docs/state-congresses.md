# Catálogo de congresos estatales

Las alertas se clasifican y entregan **por entidad federativa**. El modelo de `Source` incluye:

| Campo | Significado |
|-------|-------------|
| `jurisdiction` | `FEDERAL` (DOF, Diputados, Senado…) o `STATE` |
| `stateCode` | ISO 3166-2:MX sin prefijo (`JAL`, `CMX`, …). Obligatorio si `STATE`; vacío si `FEDERAL` |
| `searchFocus` | `string[]` — qué debe buscar NORMA (matriz VCGA); `[]` vacío válido |
| `notes` | Observaciones de catálogo (prioridad, matices) |

Lista de códigos: `AGU BCN BCS CAM CHP CHH CMX COA COL DUR GUA GRO HID JAL MEX MIC MOR NAY NLE OAX PUE QUE ROO SLP SIN SON TAB TAM TLA VER YUC ZAC`.

Fuente: matriz operativa de fuentes (VCGA). Seed: `prisma/data/state-congresses.ts` + `prisma/data/matrix-extra-sources.ts`.

## Carga

**32 congresos** (`jalisco-congreso` conserva el code histórico).

- **ACTIVE (crawl):** Aguascalientes, Baja California, Baja California Sur, Campeche, Chihuahua, Jalisco.
- **INACTIVE:** los otros 26. Alta prioridad en matriz (diario, aún inactivos): CDMX, Edomex, NL, Oaxaca, Veracruz. El resto: lun-mié-vie.

**Federales ACTIVE:** `dof`, `diputados-gaceta`.

**Federales INACTIVE (catálogo, sin conector aún):** `senado-gaceta`, `mananera-presidencia`, `cofepris`, `profeco`.

No se cargan como fuentes: seguimiento de iniciativas, histórico de hallazgos, portafolio del cliente (eso es perfil) ni “medios” genéricos (hace falta un sitio concreto).

## Filtros

```http
GET /sources?jurisdiction=STATE
GET /sources?stateCode=JAL
GET /sources?status=ACTIVE
```

S5 no debe scrapear los 32: el scheduler ignora `INACTIVE`.
