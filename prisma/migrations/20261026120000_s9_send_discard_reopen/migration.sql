-- S9: autoSend, correo del informe, nota de reapertura por hash distinto.
ALTER TABLE "client_delivery_configs" ADD COLUMN "auto_send" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "findings" ADD COLUMN "change_note" TEXT;

ALTER TABLE "reports" ADD COLUMN "email_delivery" JSONB;
