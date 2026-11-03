-- Who confirmed the send. Null until the report is actually sent.
ALTER TABLE "reports" ADD COLUMN "sent_by_user_id" TEXT;

ALTER TABLE "reports" ADD CONSTRAINT "reports_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
