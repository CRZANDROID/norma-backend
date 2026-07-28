-- AlterTable: own auth (password) replaces Supabase auth_user_id
-- Existing users without passwords cannot log in; re-seed admin in development.

DELETE FROM "client_memberships";
DELETE FROM "users";

DROP INDEX IF EXISTS "users_auth_user_id_key";

ALTER TABLE "users" DROP COLUMN IF EXISTS "auth_user_id";

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

UPDATE "users" SET "password_hash" = '' WHERE "password_hash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
