-- Source jurisdiction + entidad federativa + schedule (replaces frequency)
-- Client delivery config (channels + semáforo actions)

CREATE TYPE "SourceJurisdiction" AS ENUM ('FEDERAL', 'STATE');

CREATE TYPE "MexicanState" AS ENUM (
  'AGU',
  'BCN',
  'BCS',
  'CAM',
  'CHP',
  'CHH',
  'CMX',
  'COA',
  'COL',
  'DUR',
  'GUA',
  'GRO',
  'HID',
  'JAL',
  'MEX',
  'MIC',
  'MOR',
  'NAY',
  'NLE',
  'OAX',
  'PUE',
  'QUE',
  'ROO',
  'SLP',
  'SIN',
  'SON',
  'TAB',
  'TAM',
  'TLA',
  'VER',
  'YUC',
  'ZAC'
);

ALTER TABLE "sources" ADD COLUMN "jurisdiction" "SourceJurisdiction" NOT NULL DEFAULT 'FEDERAL';
ALTER TABLE "sources" ADD COLUMN "state_code" "MexicanState";
ALTER TABLE "sources" ADD COLUMN "schedule_time" TEXT NOT NULL DEFAULT '07:00';
ALTER TABLE "sources" ADD COLUMN "schedule_timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';
ALTER TABLE "sources" ADD COLUMN "schedule_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5];

UPDATE "sources"
SET
  "jurisdiction" = 'STATE',
  "state_code" = 'JAL'
WHERE "code" = 'jalisco-congreso';

ALTER TABLE "sources" DROP COLUMN IF EXISTS "frequency";

ALTER TABLE "sources" ADD CONSTRAINT "sources_state_jurisdiction_chk" CHECK (
  ("jurisdiction" = 'FEDERAL' AND "state_code" IS NULL)
  OR ("jurisdiction" = 'STATE' AND "state_code" IS NOT NULL)
);

CREATE INDEX "sources_jurisdiction_idx" ON "sources"("jurisdiction");
CREATE INDEX "sources_state_code_idx" ON "sources"("state_code");

CREATE TABLE "client_delivery_configs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_time" TEXT NOT NULL DEFAULT '07:00',
    "delivery_timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "delivery_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
    "impact_actions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_delivery_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_delivery_configs_client_id_key" ON "client_delivery_configs"("client_id");

ALTER TABLE "client_delivery_configs" ADD CONSTRAINT "client_delivery_configs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "client_delivery_configs" (
  "id",
  "client_id",
  "email_enabled",
  "whatsapp_enabled",
  "delivery_time",
  "delivery_timezone",
  "delivery_weekdays",
  "impact_actions",
  "created_at",
  "updated_at"
)
SELECT
  'cdc_' || c."id",
  c."id",
  true,
  false,
  '07:00',
  'America/Mexico_City',
  ARRAY[1, 2, 3, 4, 5],
  '[
    {"impact":"GREEN","notifyInbox":true,"sendEmail":false,"sendWhatsapp":false,"requireHumanApproval":false},
    {"impact":"YELLOW","notifyInbox":true,"sendEmail":true,"sendWhatsapp":false,"requireHumanApproval":true},
    {"impact":"ORANGE","notifyInbox":true,"sendEmail":true,"sendWhatsapp":false,"requireHumanApproval":true},
    {"impact":"RED","notifyInbox":true,"sendEmail":true,"sendWhatsapp":true,"requireHumanApproval":true}
  ]'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "clients" c
WHERE NOT EXISTS (
  SELECT 1 FROM "client_delivery_configs" d WHERE d."client_id" = c."id"
);
