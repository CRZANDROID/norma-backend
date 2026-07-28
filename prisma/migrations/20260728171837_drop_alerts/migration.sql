/*
  Warnings:

  - You are about to drop the `alerts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_client_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_source_id_fkey";

-- DropTable
DROP TABLE "alerts";

-- DropEnum
DROP TYPE "AlertSeverity";

-- DropEnum
DROP TYPE "AlertStatus";
