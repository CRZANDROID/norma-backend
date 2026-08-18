# Asistente de catálogo (OpenAI) — Fase 1

**No es** clasificación de normas (Sprint 7). El modelo **solo** responde con clientes, perfiles y fuentes ya guardados en Postgres.

## Env

| Variable | Obligatorio | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Para `POST /ai/ask` | vacío → `503` |
| `OPENAI_MODEL` | No | `gpt-4o-mini` |

Sin key la API arranca igual. `GET /ai/status` indica `{ configured, model }` sin llamar a OpenAI.

## API

Auth: Bearer JWT. Roles: `ADMIN`, `ANALYST`, `VIEWER`, `CLIENT_USER`.  
No-ADMIN: el catálogo se filtra por memberships. `ADMIN` ve todo.

### `GET /ai/status`

```json
{ "configured": false, "model": null }
```

### `POST /ai/ask`

```json
{
  "question": "¿Qué fuentes tiene Arca y en qué estados?",
  "clientId": "<opcional>"
}
```

Respuesta:

```json
{
  "answer": "...texto del modelo...",
  "model": "gpt-4o-mini",
  "catalog": {
    "clientCount": 1,
    "profileCount": 1,
    "sourceCount": 3,
    "scopedToClientId": null
  }
}
```

`catalog` es un resumen de **qué registros se le pasaron** al modelo (para comprobar congruencia), no el texto crudo.

## Demo

1. `pnpm prisma:seed` (Arca + DOF + Diputados + 32 congresos).
2. `OPENAI_API_KEY` en `.env`.
3. Login → `POST /ai/ask` con preguntas como:
   - ¿Qué clientes hay registrados?
   - ¿Cuál es el perfil regulatorio de Arca?
   - ¿Cuántos congresos estatales hay y cuáles están activos?

## Front

Contrato UI: [FRONTEND-AI-ASK.md](./FRONTEND-AI-ASK.md).
