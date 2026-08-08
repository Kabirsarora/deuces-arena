-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('SEMIFINALS', 'FINAL', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('SEMIFINAL_A', 'SEMIFINAL_B', 'FINAL');

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "tournamentId" TEXT,
ADD COLUMN "tournamentStage" "TournamentStage";

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'SEMIFINALS',
    "championUserId" TEXT,
    "championName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentParticipant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "semifinalStage" "TournamentStage" NOT NULL,
    "semifinalPlacement" INTEGER,
    "advancedToFinal" BOOLEAN NOT NULL DEFAULT false,
    "finalPlacement" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_publicId_key" ON "Tournament"("publicId");
CREATE INDEX "Tournament_status_createdAt_idx" ON "Tournament"("status", "createdAt");
CREATE INDEX "Tournament_championUserId_idx" ON "Tournament"("championUserId");
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_guestId_key" ON "TournamentParticipant"("tournamentId", "guestId");
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_seed_key" ON "TournamentParticipant"("tournamentId", "seed");
CREATE INDEX "TournamentParticipant_userId_createdAt_idx" ON "TournamentParticipant"("userId", "createdAt");
CREATE INDEX "TournamentParticipant_tournamentId_finalPlacement_idx" ON "TournamentParticipant"("tournamentId", "finalPlacement");
CREATE UNIQUE INDEX "Match_tournamentId_tournamentStage_key" ON "Match"("tournamentId", "tournamentStage");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_championUserId_fkey" FOREIGN KEY ("championUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
