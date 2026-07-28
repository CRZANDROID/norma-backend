# NORMA — Producto

## Qué es

NORMA es una plataforma de **monitoreo regulatorio** para detectar, clasificar y priorizar cambios normativos relevantes para un cliente, con validación humana antes de cualquier envío ejecutivo.

Cliente piloto: **Arca Continental** (VCGA / asuntos regulatorios). Si el piloto funciona, se escala a más clientes.

## Problema que resuelve

Equipos regulatorios revisan manualmente muchas fuentes (DOF, congresos, autoridades, medios). Es lento, inconsistente y difícil de auditar. NORMA automatiza recolección y análisis, y deja la decisión final a un humano.

## Alcance del piloto (qué SÍ)

- Backoffice autenticado (Supabase Auth + NestJS)
- Multi-tenant por **cliente** (Arca primero)
- Catálogo de **fuentes** (empezar con pocas representativas: DOF, Diputados, un congreso estatal)
- **Perfil regulatorio** del cliente (keywords, categorías, portafolio)
- Más adelante: ingesta, normalización, deduplicación, clasificación, semáforo 4 niveles, borrador ejecutivo, inbox de validación humana, email solo tras aprobación

## Fuera de alcance (por ahora)

- Microservicios
- Fastify (se mantiene Express en NestJS)
- JWT / passwords propios en Nest (usa Supabase Auth)
- Consultas de negocio desde el frontend directo a tablas Supabase
- Integrar OpenAI, Redis, BullMQ, Resend “por checklist” antes de que aporten valor
- Desplegar los 32 congresos desde el día uno

## Actores

| Actor | Rol en producto |
|-------|-----------------|
| `ADMIN` | Backoffice VCGA: catálogo, usuarios, clientes |
| `ANALYST` | Operación diaria: perfiles, revisión de hallazgos |
| `VIEWER` | Solo lectura |
| `CLIENT_USER` | Usuario del cliente (piloto: acceso restringido a su tenant) |

## Principios de producto

1. **Humano en el loop:** nada ejecutivo se envía sin aprobación.
2. **Auditoría:** estados, versiones y trazas importan más que borrar datos.
3. **Soft-status:** `ACTIVE` / `INACTIVE` en lugar de hard-delete.
4. **Piloto estrecho, arquitectura multi-cliente:** modelar bien el tenant desde el inicio.

## Repos

| Repo | Rol |
|------|-----|
| `norma-backend` | API NestJS + Prisma + PostgreSQL |
| `norma-frontend` | SPA React (Vite) |

Tablero: GitHub Project **NORMA — Piloto Arca**.

## Documentación relacionada

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack y reglas técnicas
- [SPRINTS.md](./SPRINTS.md) — plan semanal
- [SPRINT-3-BACKEND.md](./SPRINT-3-BACKEND.md) — brief CRUD admin (backend)
