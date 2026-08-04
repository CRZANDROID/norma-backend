-- CreateTable
CREATE TABLE "client_sources" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_sources_source_id_idx" ON "client_sources"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_sources_client_id_source_id_key" ON "client_sources"("client_id", "source_id");

-- AddForeignKey
ALTER TABLE "client_sources" ADD CONSTRAINT "client_sources_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sources" ADD CONSTRAINT "client_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
