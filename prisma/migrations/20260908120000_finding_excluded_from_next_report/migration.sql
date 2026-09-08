-- AlterTable
ALTER TABLE "findings" ADD COLUMN "excluded_from_next_report" BOOLEAN NOT NULL DEFAULT false;
