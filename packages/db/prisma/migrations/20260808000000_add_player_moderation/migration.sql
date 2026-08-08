CREATE TYPE "PlayerReportReason" AS ENUM (
  'HARASSMENT',
  'HATE_SPEECH',
  'SPAM',
  'CHEATING',
  'INAPPROPRIATE_NAME',
  'OTHER'
);

CREATE TYPE "PlayerReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED');

CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL,
  "blockerUserId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerReport" (
  "id" TEXT NOT NULL,
  "reporterUserId" TEXT,
  "reportedUserId" TEXT,
  "reporterGuestId" TEXT,
  "reportedGuestId" TEXT,
  "roomCode" TEXT,
  "messageId" TEXT,
  "messageBody" TEXT,
  "reason" "PlayerReportReason" NOT NULL,
  "details" TEXT,
  "status" "PlayerReportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBlock_blockerUserId_blockedUserId_key"
  ON "UserBlock"("blockerUserId", "blockedUserId");
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");
CREATE INDEX "PlayerReport_createdAt_idx" ON "PlayerReport"("createdAt");
CREATE INDEX "PlayerReport_reportedUserId_status_idx" ON "PlayerReport"("reportedUserId", "status");
CREATE INDEX "PlayerReport_reportedGuestId_status_idx" ON "PlayerReport"("reportedGuestId", "status");
CREATE INDEX "PlayerReport_roomCode_idx" ON "PlayerReport"("roomCode");

ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockerUserId_fkey"
  FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockedUserId_fkey"
  FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerReport"
  ADD CONSTRAINT "PlayerReport_reporterUserId_fkey"
  FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlayerReport"
  ADD CONSTRAINT "PlayerReport_reportedUserId_fkey"
  FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
