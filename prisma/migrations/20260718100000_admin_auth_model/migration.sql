-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT_USER';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ImpactLevel" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterEnum SourceType values (recreate-safe approach for new values)
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'CONGRESS_STATE';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'CONGRESS_FEDERAL';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'DOF';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'AUTHORITY';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'MEDIA';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'TRANSCRIPT';

-- AlterTable users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_user_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "users" SET "auth_user_id" = COALESCE("auth_user_id", "id") WHERE "auth_user_id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET NOT NULL;
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_user_id_key" ON "users"("auth_user_id");

-- AlterTable clients
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "slug" TEXT;
UPDATE "clients" SET "slug" = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE "slug" IS NULL;
ALTER TABLE "clients" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "clients_slug_key" ON "clients"("slug");

-- AlterTable sources
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "section" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "frequency" TEXT;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "keywords_guide" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "config" JSONB;
UPDATE "sources" SET "code" = COALESCE("code", lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id, 1, 6)) WHERE "code" IS NULL;
ALTER TABLE "sources" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sources_code_key" ON "sources"("code");
CREATE INDEX IF NOT EXISTS "sources_status_idx" ON "sources"("status");

-- CreateTable client_memberships
CREATE TABLE IF NOT EXISTS "client_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_memberships_user_id_client_id_key" ON "client_memberships"("user_id", "client_id");
CREATE INDEX IF NOT EXISTS "client_memberships_client_id_idx" ON "client_memberships"("client_id");

-- CreateTable regulatory_profiles
CREATE TABLE IF NOT EXISTS "regulatory_profiles" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" JSONB,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "regulatory_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "regulatory_profiles_client_id_idx" ON "regulatory_profiles"("client_id");

-- CreateTable findings
CREATE TABLE IF NOT EXISTS "findings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "impact" "ImpactLevel" NOT NULL DEFAULT 'YELLOW',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "client_id" TEXT,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "findings_client_id_idx" ON "findings"("client_id");
CREATE INDEX IF NOT EXISTS "findings_source_id_idx" ON "findings"("source_id");
CREATE INDEX IF NOT EXISTS "findings_status_idx" ON "findings"("status");
CREATE INDEX IF NOT EXISTS "findings_impact_idx" ON "findings"("impact");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "regulatory_profiles" ADD CONSTRAINT "regulatory_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "findings" ADD CONSTRAINT "findings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "findings" ADD CONSTRAINT "findings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
