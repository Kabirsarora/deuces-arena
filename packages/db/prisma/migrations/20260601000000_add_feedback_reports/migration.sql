CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "roomCode" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contactEmail" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackReport_createdAt_idx" ON "FeedbackReport"("createdAt");
CREATE INDEX "FeedbackReport_guestId_idx" ON "FeedbackReport"("guestId");
CREATE INDEX "FeedbackReport_roomCode_idx" ON "FeedbackReport"("roomCode");
CREATE INDEX "FeedbackReport_kind_idx" ON "FeedbackReport"("kind");

ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
