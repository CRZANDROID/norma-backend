-- AlterEnum: CLASSIFIED after READY_FOR_AI (not used in this transaction).
ALTER TYPE "DocumentProcessingStatus" ADD VALUE IF NOT EXISTS 'CLASSIFIED';

-- Placeholder findings cannot satisfy document_id / client_id NOT NULL.
DELETE FROM "findings";

ALTER TABLE "findings" DROP CONSTRAINT IF EXISTS "findings_client_id_fkey";

ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "justification" TEXT NOT NULL DEFAULT '';
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "suggested_action" TEXT;
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "document_id" TEXT NOT NULL;
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "ai_meta" JSONB;

ALTER TABLE "findings" ALTER COLUMN "client_id" SET NOT NULL;

ALTER TABLE "findings" ADD CONSTRAINT "findings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "findings" ADD CONSTRAINT "findings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "findings_document_id_client_id_key" ON "findings"("document_id", "client_id");
CREATE INDEX IF NOT EXISTS "findings_document_id_idx" ON "findings"("document_id");
