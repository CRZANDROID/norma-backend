# Frontend — Entrega y semáforo (config por cliente)

**Audiencia:** agente o dev del repo `norma-frontend`.  
**Backend:** implementado. Migración `source_state_schedule_delivery`.  
**No es** la vista de hallazgos/inbox: es la **configuración** que VCGA imprime (canales + acciones por color). El envío real (Resend/WhatsApp) no está implementado.

Contexto: [HANDOFF.md](./HANDOFF.md) · API: [postman-pruebas.md](./postman-pruebas.md)

---

## Shape `deliveryConfig`

```json
{
  "id": "clx...",
  "clientId": "clx...",
  "emailEnabled": true,
  "whatsappEnabled": false,
  "schedule": {
    "time": "07:00",
    "timezone": "America/Mexico_City",
    "weekdays": [1, 2, 3, 4, 5]
  },
  "impactActions": [
    {
      "impact": "GREEN",
      "notifyInbox": true,
      "sendEmail": false,
      "sendWhatsapp": false,
      "requireHumanApproval": false,
      "suggestedAction": "Registrar como contexto"
    },
    {
      "impact": "YELLOW",
      "notifyInbox": true,
      "sendEmail": true,
      "sendWhatsapp": false,
      "requireHumanApproval": true,
      "suggestedAction": "Dar seguimiento"
    },
    {
      "impact": "ORANGE",
      "notifyInbox": true,
      "sendEmail": true,
      "sendWhatsapp": false,
      "requireHumanApproval": true,
      "suggestedAction": "Elaborar nota y monitorear avance"
    },
    {
      "impact": "RED",
      "notifyInbox": true,
      "sendEmail": true,
      "sendWhatsapp": true,
      "requireHumanApproval": true,
      "suggestedAction": "Alertar de inmediato y preparar nota ejecutiva"
    }
  ]
}
```

`weekdays`: ISO-8601 (1 = lunes … 7 = domingo). Default días hábiles.

Si `whatsappEnabled` es `false`, un `sendWhatsapp: true` en un nivel **no** se enviará cuando exista el canal.

---

## API

| Acción | Request |
|--------|---------|
| Crear cliente | `POST /clients` opcional `delivery: { ... }` (si omites, se crean defaults) |
| Editar junto al cliente | `PATCH /clients/:id` con `delivery` (**upsert**; omitir = no tocar) |
| Leer | `GET /clients/:id` → `deliveryConfig` · o `GET /clients/:id/delivery` |
| Editar dedicado | `PATCH /clients/:id/delivery` |

Solo **ADMIN** escribe. Lectura: usuario con acceso al cliente.

`impactActions` si se envía: **exactamente los 4 niveles**, sin duplicados.

---

## UI sugerida

Pantalla de **configuración** en ficha cliente (no tablero de alertas):

1. Canales: correo (on por defecto), WhatsApp (off; leyenda “próximamente”).
2. Disparador de entrega: hora + días hábiles + zona.
3. Tabla de 4 filas (Verde / Amarillo / Naranja / Rojo) con `suggestedAction` (texto de la matriz) y toggles: inbox, correo, WhatsApp, requiere aprobación humana.

Copy de negocio: “cliente”, “semáforo”, “canales de entrega”. Evitar “tenant” / “slug” en esta pantalla.
