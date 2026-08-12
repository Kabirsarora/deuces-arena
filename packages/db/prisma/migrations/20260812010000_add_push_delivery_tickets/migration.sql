-- CreateTable
CREATE TABLE "PushDeliveryTicket" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "PushDeliveryTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDeliveryTicket_receiptId_key" ON "PushDeliveryTicket"("receiptId");

-- CreateIndex
CREATE INDEX "PushDeliveryTicket_checkedAt_createdAt_idx" ON "PushDeliveryTicket"("checkedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PushDeliveryTicket_subscriptionId_idx" ON "PushDeliveryTicket"("subscriptionId");

-- AddForeignKey
ALTER TABLE "PushDeliveryTicket" ADD CONSTRAINT "PushDeliveryTicket_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
