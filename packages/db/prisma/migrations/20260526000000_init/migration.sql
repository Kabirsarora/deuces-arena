-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('CASUAL', 'RANKED', 'LOCAL_DEMO');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PlayerKind" AS ENUM ('HUMAN', 'BOT', 'GUEST');

-- CreateEnum
CREATE TYPE "MoveKind" AS ENUM ('PLAY', 'PASS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "guestId" TEXT,
    "displayName" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "placementTotal" INTEGER NOT NULL DEFAULT 0,
    "supporterStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'CASUAL',
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "roomCode" TEXT,
    "seed" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "playerSeat" INTEGER NOT NULL,
    "playerLabel" TEXT NOT NULL,
    "kind" "PlayerKind" NOT NULL,
    "placement" INTEGER,
    "ratingBefore" INTEGER,
    "ratingAfter" INTEGER,
    "cardsRemaining" INTEGER,
    "bombsPlayed" INTEGER NOT NULL DEFAULT 0,
    "averageMoveCount" INTEGER,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchPlayerId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "kind" "MoveKind" NOT NULL,
    "handType" TEXT,
    "cards" JSONB NOT NULL,
    "handBefore" JSONB NOT NULL,
    "legalMoves" JSONB,
    "currentTrickBefore" JSONB,
    "cardsRemainingBefore" JSONB NOT NULL,
    "cardsRemainingAfter" JSONB NOT NULL,
    "gameResult" JSONB,
    "placement" INTEGER,
    "winProbability" DOUBLE PRECISION,
    "simulationScore" DOUBLE PRECISION,
    "modelScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachEvaluation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchPlayerId" TEXT NOT NULL,
    "roomCode" TEXT,
    "playerId" TEXT NOT NULL,
    "playerLabel" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "handBefore" JSONB NOT NULL,
    "currentTrickBefore" JSONB,
    "evaluations" JSONB NOT NULL,
    "rolloutsPerMove" INTEGER NOT NULL,
    "evaluatedMoveCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_guestId_key" ON "User"("guestId");

-- CreateIndex
CREATE INDEX "User_rating_idx" ON "User"("rating");

-- CreateIndex
CREATE INDEX "Match_mode_status_idx" ON "Match"("mode", "status");

-- CreateIndex
CREATE INDEX "Match_startedAt_idx" ON "Match"("startedAt");

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerSeat_key" ON "MatchPlayer"("matchId", "playerSeat");

-- CreateIndex
CREATE INDEX "MoveEvent_matchPlayerId_idx" ON "MoveEvent"("matchPlayerId");

-- CreateIndex
CREATE INDEX "MoveEvent_matchId_turnNumber_idx" ON "MoveEvent"("matchId", "turnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MoveEvent_matchId_turnNumber_key" ON "MoveEvent"("matchId", "turnNumber");

-- CreateIndex
CREATE INDEX "CoachEvaluation_matchId_turnNumber_idx" ON "CoachEvaluation"("matchId", "turnNumber");

-- CreateIndex
CREATE INDEX "CoachEvaluation_matchPlayerId_idx" ON "CoachEvaluation"("matchPlayerId");

-- CreateIndex
CREATE INDEX "CoachEvaluation_roomCode_createdAt_idx" ON "CoachEvaluation"("roomCode", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveEvent" ADD CONSTRAINT "MoveEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveEvent" ADD CONSTRAINT "MoveEvent_matchPlayerId_fkey" FOREIGN KEY ("matchPlayerId") REFERENCES "MatchPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachEvaluation" ADD CONSTRAINT "CoachEvaluation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachEvaluation" ADD CONSTRAINT "CoachEvaluation_matchPlayerId_fkey" FOREIGN KEY ("matchPlayerId") REFERENCES "MatchPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
