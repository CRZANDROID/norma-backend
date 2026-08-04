# Frontend handoff — Sources v2

**Breaking change** en el catálogo de fuentes. El front actual (`type`, `section`, `jurisdiction`, `config`) deja de coincidir con el API hasta migrar tipos/formularios.

## Shape `Source`

```json
{
  "id": "clx...",
  "code": "dof",
  "name": "Diario Oficial de la Federación",
  "category": "OFFICIAL",
  "platform": "WEB",
  "url": "https://www.dof.gob.mx/",
  "frequency": "daily",
  "sections": [
    ["Comunicados", "Normatividad", "Alertas sanitarias"],
    ["Avisos"]
  ],
  "keywordsGuide": ["COFEPRIS", "NOM"],
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "...",
  "clients": [
    { "id": "...", "name": "...", "slug": "...", "status": "ACTIVE" }
  ]
}
```

## Enums

| Campo | Valores |
|-------|---------|
| `category` | `OFFICIAL` \| `MEDIA` \| `SOCIAL` |
| `platform` | `WEB` \| `YOUTUBE` \| `X` \| `TIKTOK` \| `FACEBOOK` \| `INSTAGRAM` \| `OTHER` |

## Campos

| Campo | Create | Patch | Notas |
|-------|--------|-------|-------|
| `name` | sí | sí | |
| `code` | sí | no | kebab-case `[a-z0-9-]`, único |
| `category` | sí | sí | |
| `platform` | sí | sí | |
| `url` | no | sí (`null` limpia) | protocolo requerido |
| `frequency` | no | sí | string libre (`daily`, …) |
| `sections` | no | sí | `string[][]` — cada ítem es un path |
| `keywordsGuide` | no | sí | `string[]` |
| `clientIds` | no (opcional) | **no** | solo create; vínculos después vía `PATCH /clients/:id` `sourceIds` |

## Eliminados

`type` (`SourceType`), `section` (string), `jurisdiction`, `config`.

## Queries `GET /sources`

`status?`, `category?`, `platform?`, `clientId?`, `q?`

Ya no: `type`, `jurisdiction`.

## Ejemplos

### POST `/sources`

```json
{
  "name": "Cuenta X COFEPRIS",
  "code": "cofepris-x",
  "category": "OFFICIAL",
  "platform": "X",
  "url": "https://x.com/cofepris",
  "frequency": "daily",
  "sections": [["Comunicados"]],
  "keywordsGuide": ["alerta sanitaria"],
  "clientIds": ["<clientId>"]
}
```

### PATCH `/sources/:id`

```json
{
  "frequency": "weekly",
  "sections": [
    ["Comunicados", "Normatividad", "Alertas sanitarias"]
  ],
  "url": null
}
```

## UI sugerida (cuando migres el front)

1. Categoría + plataforma + nombre + URL + frecuencia.
2. Editor de secciones: lista de paths (chips o árbol → serializar a `string[][]`).
3. Palabras guía (chips) — igual que hoy.
4. Clientes: picker solo en create (o links desde ficha cliente).
5. Filtros lista: `category` / `platform` en lugar de `type` / jurisdicción.
6. Botón “abrir URL”: sigue usando `url`.

## Checklist front

- [x] `types/source.ts` — enums + `sections: string[][]`
- [x] API create/update/list params
- [x] Forms + list panel chips/filtros
- [x] Mock alineado
- [x] Docs `POSTMAN-BACKEND.md` § Sources
