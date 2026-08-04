-- =============================================================================
-- NORMA — setup manual de Supabase Storage (NO toca tablas de negocio)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1) Crear bucket privado para documentos del piloto
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Políticas RLS: el backend usa service_role (bypass RLS).
--    Estas políticas cubren acceso futuro desde clientes autenticados de Supabase
--    Auth si algún día se usa signed upload desde el front. Hoy el Nest API
--    opera con SUPABASE_SERVICE_ROLE_KEY y no depende de ellas.

-- Lectura autenticada (opcional / futura)
DROP POLICY IF EXISTS "documents_select_authenticated" ON storage.objects;
CREATE POLICY "documents_select_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

-- Escritura autenticada (opcional / futura)
DROP POLICY IF EXISTS "documents_insert_authenticated" ON storage.objects;
CREATE POLICY "documents_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Update autenticado (opcional / futura)
DROP POLICY IF EXISTS "documents_update_authenticated" ON storage.objects;
CREATE POLICY "documents_update_authenticated"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Delete autenticado (opcional / futura)
DROP POLICY IF EXISTS "documents_delete_authenticated" ON storage.objects;
CREATE POLICY "documents_delete_authenticated"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

-- =============================================================================
-- Notas
-- - La tabla Prisma `documents` (metadatos) es una migración aparte:
--     prisma/migrations/20260803180000_documents_storage_meta/
--   NO la apliques hasta que el equipo lo decida (`pnpm prisma:migrate` / deploy).
-- - El módulo Nest `/storage` funciona solo con el bucket; la tabla es prep.
-- =============================================================================
