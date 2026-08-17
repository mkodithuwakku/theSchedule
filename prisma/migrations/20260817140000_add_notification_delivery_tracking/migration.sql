ALTER TABLE "NotificationLog"
ADD COLUMN "dedupKey" TEXT,
ADD COLUMN "providerId" TEXT,
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "NotificationLog_dedupKey_key"
ON "NotificationLog"("dedupKey");
