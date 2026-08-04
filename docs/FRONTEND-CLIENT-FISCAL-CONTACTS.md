# Frontend — Datos fiscales y contactos de cliente

**Audiencia:** agente o dev del repo `norma-frontend`.  
**Backend:** implementado en Nest. Migración `client_fiscal_contacts`.

Contexto: [HANDOFF.md](./HANDOFF.md) · API: [postman-pruebas.md](./postman-pruebas.md)

---

## Datos fiscales (1:1)

Campos en el bloque `fiscal` (create/PATCH client) y respuesta `fiscalData`:

| Campo | Tipo | Notas |
|-------|------|--------|
| `legalName` | string | Legal / business name |
| `rfc` | string | Mexican RFC 12–13; stored uppercase |
| `postalCode` | string | 5-digit postal code |
| `cfdi` | string | CFDI use code (SAT, e.g. `G03`) |
| `taxRegime` | string | Tax regime (SAT, e.g. `601`) |

### Crear / editar

```json
POST /clients
{
  "name": "...",
  "slug": "...",
  "fiscal": {
    "legalName": "Empresa S.A. de C.V.",
    "rfc": "EMA010101AAA",
    "postalCode": "06600",
    "cfdi": "G03",
    "taxRegime": "601"
  },
  "contacts": [
    {
      "name": "María López",
      "phone": "+52 81 1234 5678",
      "email": "maria@empresa.com"
    }
  ]
}
```

```json
PATCH /clients/:id
{
  "fiscal": { "...same shape..." },
  "contacts": [
    { "name": "...", "phone": "...", "email": "..." }
  ]
}
```

- Enviar `fiscal` en PATCH → **upsert**.
- Omitir `fiscal` → no toca la fila fiscal.
- Enviar `contacts` en PATCH → **reemplaza** el set completo (`[]` borra todos).
- Omitir `contacts` → no toca contactos.
- `GET /clients/:id` → `fiscalData` + `contacts[]`

Solo **ADMIN** escribe.

---

## Contactos directos (1:N)

| Campo | Tipo | Notas |
|-------|------|--------|
| `name` | string | Required |
| `phone` | string | Required |
| `email` | string? | Optional |
| `status` | ACTIVE/INACTIVE | Soft-status (rutas dedicadas) |

### Preferido: anidados en el cliente

Usar `contacts` en `POST /clients` y `PATCH /clients/:id` (mismo patrón que el form de create/edit).

### Rutas dedicadas (opcionales / detalle)

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/clients/:clientId/contacts?status=` | autenticado + acceso |
| POST | `/clients/:clientId/contacts` | ADMIN |
| GET | `/contacts/:id` | autenticado + acceso |
| PATCH | `/contacts/:id` | ADMIN |
| PATCH | `/contacts/:id/deactivate` | ADMIN |
| PATCH | `/contacts/:id/activate` | ADMIN |

### UX sugerida

1. Create/edit cliente: sección **Datos fiscales** (`fiscal`) + lista editable **Contactos** (`contacts` completo al guardar).
2. En edit, al guardar manda el array resultante completo (replace), no deltas.

---

## Definition of Done (front)

- [ ] Formulario fiscal en create/edit cliente
- [ ] Lista de contactos en create/edit cliente (persistir vía `contacts[]`)
- [ ] Mostrar `fiscalData` + `contacts` en detalle
- [ ] Errores `400` (RFC/CP inválidos) con el patrón de errores existente
