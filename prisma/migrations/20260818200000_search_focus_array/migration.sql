-- search_focus: TEXT? → TEXT[] (mismo shape que keywords_guide; [] = vacío)
-- USING no admite ARRAY(SELECT ...); regexp_split_to_array sí.

ALTER TABLE "sources"
  ALTER COLUMN "search_focus" TYPE TEXT[]
  USING CASE
    WHEN "search_focus" IS NULL OR btrim("search_focus") = '' THEN ARRAY[]::TEXT[]
    ELSE regexp_split_to_array(btrim("search_focus"), '\s*,\s*')
  END;

ALTER TABLE "sources"
  ALTER COLUMN "search_focus" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "search_focus" SET NOT NULL;
