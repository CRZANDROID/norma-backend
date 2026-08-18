-- Observaciones / enfoque de búsqueda (matriz operativa VCGA)
-- Acciones de semáforo sugeridas en JSON de entrega

ALTER TABLE "sources" ADD COLUMN "search_focus" TEXT;
ALTER TABLE "sources" ADD COLUMN "notes" TEXT;

UPDATE "client_delivery_configs"
SET
  "impact_actions" = '[
    {"impact":"GREEN","notifyInbox":true,"sendEmail":false,"sendWhatsapp":false,"requireHumanApproval":false,"suggestedAction":"Registrar como contexto"},
    {"impact":"YELLOW","notifyInbox":true,"sendEmail":true,"sendWhatsapp":false,"requireHumanApproval":true,"suggestedAction":"Dar seguimiento"},
    {"impact":"ORANGE","notifyInbox":true,"sendEmail":true,"sendWhatsapp":false,"requireHumanApproval":true,"suggestedAction":"Elaborar nota y monitorear avance"},
    {"impact":"RED","notifyInbox":true,"sendEmail":true,"sendWhatsapp":true,"requireHumanApproval":true,"suggestedAction":"Alertar de inmediato y preparar nota ejecutiva"}
  ]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP;
