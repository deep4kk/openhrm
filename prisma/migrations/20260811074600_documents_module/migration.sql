/*
  Warnings:

  - Added the required column `recipientName` to the `generated_letters` table without a default value. This is not possible if the table is not empty.
  - Added the required column `renderedHtml` to the `generated_letters` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `letter_templates` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MailDraftStatus" AS ENUM ('DRAFT', 'SENT', 'FAILED');

-- DropIndex
DROP INDEX "letter_templates_orgId_idx";

-- AlterTable
ALTER TABLE "generated_letters" ADD COLUMN     "letterNumber" TEXT,
ADD COLUMN     "recipientEmail" TEXT,
ADD COLUMN     "recipientName" TEXT NOT NULL,
ADD COLUMN     "renderedHtml" TEXT NOT NULL,
ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "letter_templates" ADD COLUMN     "aiBrief" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "letterSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "letterheadAddress" TEXT,
ADD COLUMN     "signatoryName" TEXT,
ADD COLUMN     "signatoryTitle" TEXT;

-- CreateTable
CREATE TABLE "letter_mail_drafts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "letterId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_mail_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "letter_mail_drafts_orgId_status_idx" ON "letter_mail_drafts"("orgId", "status");

-- CreateIndex
CREATE INDEX "letter_mail_drafts_orgId_letterId_idx" ON "letter_mail_drafts"("orgId", "letterId");

-- CreateIndex
CREATE INDEX "generated_letters_orgId_issuedAt_idx" ON "generated_letters"("orgId", "issuedAt");

-- CreateIndex
CREATE INDEX "letter_templates_orgId_isActive_idx" ON "letter_templates"("orgId", "isActive");

-- AddForeignKey
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_mail_drafts" ADD CONSTRAINT "letter_mail_drafts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_mail_drafts" ADD CONSTRAINT "letter_mail_drafts_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "generated_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_mail_drafts" ADD CONSTRAINT "letter_mail_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
