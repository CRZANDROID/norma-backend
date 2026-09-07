-- CreateIndex
DROP INDEX IF EXISTS "findings_client_id_idx";
CREATE INDEX "findings_client_id_created_at_idx" ON "findings"("client_id", "created_at");
