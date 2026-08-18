# Frontend — Asistente de catálogo (`POST /ai/ask`)

**Audiencia:** `norma-frontend`.  
**Backend:** implementado. **No clasifica normas**; conversa sobre datos admin ya registrados.

Detalle: [openai-catalog.md](./openai-catalog.md)

## Auth

`Authorization: Bearer <accessToken>` de `POST /auth/login`.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/ai/status` | `{ configured, model }` — si `configured: false`, mostrar “OpenAI no configurado” |
| `POST` | `/ai/ask` | Pregunta + respuesta |

### Body

```json
{
  "question": "¿Qué fuentes monitorea Arca Continental?",
  "clientId": "opcional-para-acotar-a-un-cliente"
}
```

`question`: 3–2000 caracteres. Campos extra → `400`.

### Respuesta OK

```json
{
  "answer": "Arca Continental tiene vinculado…",
  "model": "gpt-4o-mini",
  "catalog": {
    "clientCount": 1,
    "profileCount": 1,
    "sourceCount": 2,
    "scopedToClientId": null
  }
}
```

Mostrar `answer` al consultor. `catalog` puede ir en un pie (“Basado en N clientes, N fuentes”) para la demo de congruencia.

### Errores

| Código | Cuándo |
|--------|--------|
| `401` | Sin token |
| `403` | Sin acceso al `clientId` |
| `400` | Pregunta inválida |
| `503` | Sin `OPENAI_API_KEY` o OpenAI caído |

## UI sugerida

Una caja de pregunta en backoffice (no un agente autónomo). Copy: “consultar el catálogo”, no “prompt” ni “LLM”.  
Si `GET /ai/status` → `configured: false`, deshabilitar envío.
