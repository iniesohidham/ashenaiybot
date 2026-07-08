-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "reporterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BannedPattern" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "severity" "ReportSeverity" NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedPattern_pkey" PRIMARY KEY ("id")
);
