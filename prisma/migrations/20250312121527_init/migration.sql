/*
  Warnings:

  - You are about to drop the column `stripeAccountLink` on the `stripeAccount` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[educatorId]` on the table `stripeAccount` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `stripeAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeBankAccount` to the `stripeAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "stripeAccount" DROP COLUMN "stripeAccountLink",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "stripeBankAccount" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "stripeAccount_educatorId_index" ON "stripeAccount"("educatorId");

-- CreateIndex
CREATE UNIQUE INDEX "stripeAccount_educatorId_key" ON "stripeAccount"("educatorId");
