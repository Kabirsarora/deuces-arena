ALTER TABLE "FeedbackReport"
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicStatus" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN "creatorReply" TEXT,
ADD COLUMN "repliedAt" TIMESTAMP(3),
ADD COLUMN "hiddenAt" TIMESTAMP(3),
ADD COLUMN "hiddenReason" TEXT;

CREATE INDEX "FeedbackReport_isPublic_hiddenAt_createdAt_idx"
ON "FeedbackReport"("isPublic", "hiddenAt", "createdAt");
