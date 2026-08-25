-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM (
    'RECEIVED',
    'EXTRACTED',
    'NORMALIZED',
    'HASHED',
    'DEDUPED',
    'READY_FOR_AI',
    'FAILED',
    'DISCARDED'
);

-- AlterTable
ALTER TABLE "documents"
    ADD COLUMN "processing_status" "DocumentProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    ADD COLUMN "content_hash" TEXT,
    ADD COLUMN "canonical_document_id" TEXT,
    ADD COLUMN "extracted_text" TEXT,
    ADD COLUMN "extracted_path" TEXT,
    ADD COLUMN "normalized_path" TEXT,
    ADD COLUMN "last_error" TEXT,
    ADD COLUMN "job_run_id" TEXT,
    ADD COLUMN "processing_history" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "documents_processing_status_idx" ON "documents"("processing_status");

-- CreateIndex
CREATE INDEX "documents_content_hash_idx" ON "documents"("content_hash");

-- CreateIndex
CREATE INDEX "documents_job_run_id_idx" ON "documents"("job_run_id");

-- CreateIndex
CREATE INDEX "documents_canonical_document_id_idx" ON "documents"("canonical_document_id");

-- Partial unique: solo el canónico (sin canonical_document_id) puede ocupar un hash.
CREATE UNIQUE INDEX "documents_content_hash_canonical_key"
    ON "documents"("content_hash")
    WHERE "content_hash" IS NOT NULL AND "canonical_document_id" IS NULL;

-- AddForeignKey
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_canonical_document_id_fkey"
    FOREIGN KEY ("canonical_document_id") REFERENCES "documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_job_run_id_fkey"
    FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
