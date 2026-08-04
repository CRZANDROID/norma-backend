-- Restructure sources: category/platform/sections; drop type/section/jurisdiction/config

CREATE TYPE "SourceCategory" AS ENUM ('OFFICIAL', 'MEDIA', 'SOCIAL');

CREATE TYPE "SourcePlatform" AS ENUM (
  'WEB',
  'YOUTUBE',
  'X',
  'TIKTOK',
  'FACEBOOK',
  'INSTAGRAM',
  'OTHER'
);

ALTER TABLE "sources" ADD COLUMN "category" "SourceCategory";
ALTER TABLE "sources" ADD COLUMN "platform" "SourcePlatform";
ALTER TABLE "sources" ADD COLUMN "sections" JSONB NOT NULL DEFAULT '[]';

UPDATE "sources"
SET
  "category" = CASE
    WHEN "type"::text IN ('DOF', 'CONGRESS_STATE', 'CONGRESS_FEDERAL', 'AUTHORITY')
      THEN 'OFFICIAL'::"SourceCategory"
    WHEN "type"::text IN ('MEDIA', 'TRANSCRIPT')
      THEN 'MEDIA'::"SourceCategory"
    ELSE 'MEDIA'::"SourceCategory"
  END,
  "platform" = 'WEB'::"SourcePlatform",
  "sections" = CASE
    WHEN "section" IS NOT NULL AND btrim("section") <> ''
      THEN jsonb_build_array(jsonb_build_array("section"))
    ELSE '[]'::jsonb
  END;

ALTER TABLE "sources" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "sources" ALTER COLUMN "platform" SET NOT NULL;

ALTER TABLE "sources" DROP COLUMN "type";
ALTER TABLE "sources" DROP COLUMN "section";
ALTER TABLE "sources" DROP COLUMN "jurisdiction";
ALTER TABLE "sources" DROP COLUMN "config";

DROP TYPE "SourceType";

CREATE INDEX "sources_category_idx" ON "sources"("category");
CREATE INDEX "sources_platform_idx" ON "sources"("platform");
