CREATE TABLE "StoreWorkspaceBackup" (
    "storeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourceRunId" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "backedUpAt" TIMESTAMP(3) NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "restoreCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreWorkspaceBackup_pkey" PRIMARY KEY ("storeId")
);

ALTER TABLE "StoreWorkspaceBackup"
ADD CONSTRAINT "StoreWorkspaceBackup_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
