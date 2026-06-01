-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('CARD_BACK', 'TABLE_THEME', 'AVATAR', 'PROFILE_BORDER', 'EMOTE', 'WIN_ANIMATION');

-- CreateEnum
CREATE TYPE "CosmeticUnlockSource" AS ENUM ('EARNED', 'SUPPORTER', 'PROMOTIONAL', 'ADMIN_GRANT');

-- CreateTable
CREATE TABLE "Cosmetic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "isSupporter" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "previewUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCosmeticUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "source" "CosmeticUnlockSource" NOT NULL DEFAULT 'EARNED',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "UserCosmeticUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEquippedCosmetic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEquippedCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cosmetic_slug_key" ON "Cosmetic"("slug");

-- CreateIndex
CREATE INDEX "Cosmetic_kind_isActive_idx" ON "Cosmetic"("kind", "isActive");

-- CreateIndex
CREATE INDEX "Cosmetic_isSupporter_idx" ON "Cosmetic"("isSupporter");

-- CreateIndex
CREATE INDEX "UserCosmeticUnlock_cosmeticId_idx" ON "UserCosmeticUnlock"("cosmeticId");

-- CreateIndex
CREATE INDEX "UserCosmeticUnlock_userId_source_idx" ON "UserCosmeticUnlock"("userId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "UserCosmeticUnlock_userId_cosmeticId_key" ON "UserCosmeticUnlock"("userId", "cosmeticId");

-- CreateIndex
CREATE INDEX "UserEquippedCosmetic_cosmeticId_idx" ON "UserEquippedCosmetic"("cosmeticId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEquippedCosmetic_userId_kind_key" ON "UserEquippedCosmetic"("userId", "kind");

-- AddForeignKey
ALTER TABLE "UserCosmeticUnlock" ADD CONSTRAINT "UserCosmeticUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCosmeticUnlock" ADD CONSTRAINT "UserCosmeticUnlock_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "Cosmetic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEquippedCosmetic" ADD CONSTRAINT "UserEquippedCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEquippedCosmetic" ADD CONSTRAINT "UserEquippedCosmetic_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "Cosmetic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
