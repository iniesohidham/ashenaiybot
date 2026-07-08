-- CreateEnum
CREATE TYPE "ReportResolutionAction" AS ENUM ('no_action', 'warn', 'temporary_ban', 'permanent_ban');

-- CreateEnum
CREATE TYPE "BanAppealStatus" AS ENUM ('pending', 'upheld', 'reversed');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "matchedPatternId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "photoSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "resolutionAction" "ReportResolutionAction",
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByAdminId" TEXT;

-- CreateTable
CREATE TABLE "BanAppeal" (
    "id" TEXT NOT NULL,
    "banRecordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "BanAppealStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,

    CONSTRAINT "BanAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BanAppeal_banRecordId_key" ON "BanAppeal"("banRecordId");

-- CreateIndex
CREATE INDEX "BanAppeal_status_createdAt_idx" ON "BanAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_sentAt_idx" ON "Message"("senderUserId", "sentAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_matchedPatternId_fkey" FOREIGN KEY ("matchedPatternId") REFERENCES "BannedPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_banRecordId_fkey" FOREIGN KEY ("banRecordId") REFERENCES "BanRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
