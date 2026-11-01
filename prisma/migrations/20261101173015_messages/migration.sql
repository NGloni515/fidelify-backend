/*
  Warnings:

  - You are about to drop the column `segment` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `sentCount` on the `Notification` table. All the data in the column will be lost.
  - Added the required column `audience` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `audienceSize` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ALL', 'LAPSED', 'ONE_STAMP_LEFT');

-- DropIndex
DROP INDEX "Notification_businessId_idx";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "segment",
DROP COLUMN "sentCount",
ADD COLUMN     "audience" "NotificationAudience" NOT NULL,
ADD COLUMN     "audienceSize" INTEGER NOT NULL,
ADD COLUMN     "reached" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pass" ADD COLUMN     "lastMessage" TEXT;

-- CreateIndex
CREATE INDEX "Notification_businessId_createdAt_idx" ON "Notification"("businessId", "createdAt");
