-- search_focus: TEXT? → TEXT[] (mismo shape que keywords_guide; [] = vacío)

ALTER TABLE "sources"
  ALTER COLUMN "search_focus" TYPE TEXT[]
  USING CASE
    WHEN "search_focus" IS NULL OR btrim("search_focus") = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY(
      SELECT btrim(part)
      FROM unnest(string_to_array("search_focus", ',')) AS part
      WHERE btrim(part) <> ''
    )
  END;

ALTER TABLE "sources"
  ALTER COLUMN "search_focus" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "search_focus" SET NOT NULL;
