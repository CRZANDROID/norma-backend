-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SENT', 'DISCARDED');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "date_from" TEXT,
    "date_to" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_by_user_id" TEXT NOT NULL,
    "file_bucket" TEXT,
    "file_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "discarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_findings" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "impact" "ImpactLevel" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_client_id_created_at_idx" ON "reports"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "report_findings_report_id_finding_id_key" ON "report_findings"("report_id", "finding_id");

-- CreateIndex
CREATE INDEX "report_findings_finding_id_idx" ON "report_findings"("finding_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_findings" ADD CONSTRAINT "report_findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_findings" ADD CONSTRAINT "report_findings_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
