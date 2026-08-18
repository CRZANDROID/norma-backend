-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobErrorCode" AS ENUM ('NETWORK', 'PARSE', 'AUTH', 'RATE_LIMIT', 'UNKNOWN');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "source_id" TEXT;

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'source.crawl',
    "source_id" TEXT,
    "source_code" TEXT,
    "triggered_by" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "status" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error_code" "JobErrorCode",
    "message" TEXT,
    "result" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_idempotency_key_key" ON "job_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "job_runs_source_id_idx" ON "job_runs"("source_id");

-- CreateIndex
CREATE INDEX "job_runs_source_code_idx" ON "job_runs"("source_code");

-- CreateIndex
CREATE INDEX "job_runs_status_idx" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "documents_source_id_idx" ON "documents"("source_id");

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
