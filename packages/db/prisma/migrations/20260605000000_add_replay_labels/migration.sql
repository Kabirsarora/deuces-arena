-- CreateTable
CREATE TABLE "ReplayLabel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplayLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplayLabel_userId_matchId_label_key" ON "ReplayLabel"("userId", "matchId", "label");

-- CreateIndex
CREATE INDEX "ReplayLabel_matchId_idx" ON "ReplayLabel"("matchId");

-- CreateIndex
CREATE INDEX "ReplayLabel_userId_createdAt_idx" ON "ReplayLabel"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReplayLabel" ADD CONSTRAINT "ReplayLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayLabel" ADD CONSTRAINT "ReplayLabel_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
